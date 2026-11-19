import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import {
  type ClassificacaoCalculada,
  calcularClassificacao,
  type EmpateClassificacao,
} from './calculo-classificacao.js';
import type {
  DesempateRegistradoDto,
  RegistrarDesempateDto,
} from './dto/desempate.dto.js';

type ClientePrisma = PrismaService | Prisma.TransactionClient;

type DecisaoVigente = {
  id: number;
  grupoId: number;
  apuracaoId: number;
  posicao: number;
  justificativa: string;
  dataHora: Date;
  usuario: { nome: string };
};

@Injectable()
export class ClassificacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditoriaService,
  ) {}

  /** GET /classificacao: calculada na hora, sem gravar (RF12, RF13). */
  async consultar(eventoId: number): Promise<ClassificacaoCalculada> {
    const evento = await this.prisma.evento.findUnique({
      where: { id: eventoId },
      select: { id: true },
    });
    if (!evento) throw new NotFoundException('Evento não encontrado');

    return this.calcularParaEvento(eventoId);
  }

  /**
   * Mesmo cálculo do GET, para quem já confirmou que o evento existe (os
   * relatórios), sem repetir a consulta ao evento.
   */
  async calcularParaEvento(eventoId: number): Promise<ClassificacaoCalculada> {
    const { classificacao } = await this.calcular(this.prisma, eventoId);
    return classificacao;
  }

  /**
   * POST /desempates (RF14, ADR 0003 item 5). Numa transação só, grava uma
   * apuração nova com a classificação já decidida, as decisões manuais e a
   * auditoria. As decisões anteriores dos mesmos grupos deixam de valer.
   */
  async registrarDesempate(
    eventoId: number,
    dto: RegistrarDesempateDto,
    usuarioId: number,
  ): Promise<DesempateRegistradoDto> {
    return this.prisma.$transaction(async (tx) => {
      // Serializa os desempates do evento: dois envios ao mesmo tempo
      // gerariam a mesma versão de apuração. NO KEY UPDATE não bloqueia os
      // lançamentos (resultado, auditoria), que só travam a chave do evento.
      //
      // Um lançamento confirmado entre esta leitura e o commit deixa a
      // classificação gravada com os pontos anteriores. Não há prejuízo: na
      // próxima consulta os pontos não batem, a decisão é ignorada e o empate
      // volta como pendente (ADR 0003, item 5).
      const eventos = await tx.$queryRaw<Array<{ id_evento: number }>>`
        SELECT id_evento FROM evento
        WHERE id_evento = ${eventoId}::int
        FOR NO KEY UPDATE
      `;
      if (eventos.length === 0) {
        throw new NotFoundException('Evento não encontrado');
      }

      const { classificacao, decisoesVigentes } = await this.calcular(
        tx,
        eventoId,
      );
      const empatesEnviados = this.validarPosicoes(dto, classificacao);

      const decisaoPorGrupo = new Map(
        decisoesVigentes.map((d) => [d.grupoId, d]),
      );
      const repetido = this.buscarEnvioRepetido(
        dto,
        empatesEnviados,
        decisaoPorGrupo,
      );
      if (repetido) return repetido;

      return this.gravarDecisao(
        tx,
        eventoId,
        usuarioId,
        dto,
        classificacao,
        decisaoPorGrupo,
      );
    });
  }

  private async calcular(client: ClientePrisma, eventoId: number) {
    const [
      grupos,
      desafios,
      bonificacoes,
      penalidades,
      criterios,
      decisoesVigentes,
    ] = await Promise.all([
      client.grupo.findMany({
        where: { eventoId },
        select: { id: true, nome: true, cor: true },
        orderBy: { nome: 'asc' },
      }),
      client.desafio.findMany({
        where: { eventoId },
        select: {
          id: true,
          pontosColocacao: { select: { colocacao: true, pontos: true } },
          resultados: {
            select: { grupoId: true, colocacao: true, ausente: true },
          },
        },
      }),
      client.bonificacaoGrupo.findMany({
        where: { grupo: { eventoId } },
        select: { grupoId: true, valor: true },
      }),
      client.penalidade.findMany({
        where: { grupo: { eventoId } },
        select: { grupoId: true, pontos: true },
      }),
      client.criterioDesempate.findMany({
        where: { eventoId },
        orderBy: { ordem: 'asc' },
        select: { tipo: true, desafioId: true },
      }),
      client.desempateManual.findMany({
        where: { eventoId, vigente: true },
        select: {
          id: true,
          grupoId: true,
          apuracaoId: true,
          posicao: true,
          justificativa: true,
          dataHora: true,
          usuario: { select: { nome: true } },
        },
      }),
    ]);

    const snapshots = await client.classificacaoGrupo.findMany({
      where: {
        apuracaoId: {
          in: [...new Set(decisoesVigentes.map((d) => d.apuracaoId))],
        },
      },
      select: {
        apuracaoId: true,
        grupoId: true,
        pontosDesafios: true,
        pontosBonificacoes: true,
        pontosPenalidades: true,
        pontosTotal: true,
      },
    });
    const snapshotPorChave = new Map(
      snapshots.map((s) => [`${s.apuracaoId}:${s.grupoId}`, s]),
    );

    const classificacao = calcularClassificacao({
      grupos,
      desafios,
      bonificacoes,
      penalidades,
      criterios,
      desempatesVigentes: decisoesVigentes.map((d) => ({
        grupoId: d.grupoId,
        apuracaoId: d.apuracaoId,
        posicao: d.posicao,
        snapshot: snapshotPorChave.get(`${d.apuracaoId}:${d.grupoId}`),
      })),
    });

    return { classificacao, decisoesVigentes };
  }

  /**
   * O envio precisa trazer empates inteiros, cada um com as posições que ele
   * ocupa, e todos os empates pendentes juntos: a apuração gravada não
   * aceita duas equipes na mesma posição. Um empate já decidido pode vir de
   * novo para trocar a decisão.
   */
  private validarPosicoes(
    dto: RegistrarDesempateDto,
    classificacao: ClassificacaoCalculada,
  ): EmpateClassificacao[] {
    // O desempate decide a classificação final (Regimento, Art. 16). Antes de
    // todos os desafios lançados, os empates ainda mudam a cada lançamento.
    const { desafiosLancados, desafiosTotais } = classificacao.resumo;
    if (desafiosTotais === 0 || desafiosLancados < desafiosTotais) {
      throw new UnprocessableEntityException(
        'O desempate manual só pode ser registrado depois que todos os desafios forem lançados.',
      );
    }
    if (classificacao.empates.length === 0) {
      throw new UnprocessableEntityException(
        'Não há empate para resolver na classificação atual.',
      );
    }

    const nomePorGrupo = new Map(
      classificacao.dados.map((linha) => [linha.grupoId, linha.grupo]),
    );
    const empatePorGrupo = new Map<number, EmpateClassificacao>();
    for (const empate of classificacao.empates) {
      for (const grupoId of empate.grupoIds)
        empatePorGrupo.set(grupoId, empate);
    }

    const posicaoPorGrupo = new Map<number, number>();
    for (const item of dto.posicoes) {
      const nome = nomePorGrupo.get(item.grupoId);
      if (nome === undefined) {
        throw new NotFoundException('Grupo não encontrado neste evento');
      }
      if (posicaoPorGrupo.has(item.grupoId)) {
        throw new UnprocessableEntityException(
          `O grupo ${nome} aparece mais de uma vez.`,
        );
      }
      posicaoPorGrupo.set(item.grupoId, item.posicao);

      if (!empatePorGrupo.has(item.grupoId)) {
        throw new UnprocessableEntityException(
          `O grupo ${nome} não está empatado.`,
        );
      }
    }

    const enviados = classificacao.empates.filter((empate) =>
      empate.grupoIds.some((grupoId) => posicaoPorGrupo.has(grupoId)),
    );

    for (const empate of enviados) {
      const inicio = empate.posicaoInicial;
      const fim = inicio + empate.grupoIds.length - 1;
      if (!empate.grupoIds.every((grupoId) => posicaoPorGrupo.has(grupoId))) {
        throw new UnprocessableEntityException(
          `Informe todos os grupos do empate no ${inicio}º lugar.`,
        );
      }
      const posicoes = new Set(
        empate.grupoIds.map((grupoId) => posicaoPorGrupo.get(grupoId)!),
      );
      if (
        posicoes.size !== empate.grupoIds.length ||
        [...posicoes].some((p) => p < inicio || p > fim)
      ) {
        throw new UnprocessableEntityException(
          `As posições do empate no ${inicio}º lugar devem ir do ${inicio}º ao ${fim}º, sem repetir.`,
        );
      }
    }

    const faltando = classificacao.empates.find(
      (empate) => !empate.resolvidoManualmente && !enviados.includes(empate),
    );
    if (faltando) {
      throw new UnprocessableEntityException(
        `Resolva também o empate no ${faltando.posicaoInicial}º lugar: os empates pendentes são registrados juntos.`,
      );
    }

    return enviados;
  }

  /**
   * Reenvio da decisão que já vale (mesmas posições e justificativa) não grava
   * nada e devolve a decisão existente, como os PUT idempotentes (RNF04).
   */
  private buscarEnvioRepetido(
    dto: RegistrarDesempateDto,
    empatesEnviados: EmpateClassificacao[],
    decisaoPorGrupo: Map<number, DecisaoVigente>,
  ): DesempateRegistradoDto | null {
    if (!empatesEnviados.every((empate) => empate.resolvidoManualmente)) {
      return null;
    }

    const decisoes: DecisaoVigente[] = [];
    for (const item of dto.posicoes) {
      const decisao = decisaoPorGrupo.get(item.grupoId);
      if (
        !decisao ||
        decisao.posicao !== item.posicao ||
        decisao.justificativa !== dto.justificativa
      ) {
        return null;
      }
      decisoes.push(decisao);
    }

    const maisRecente = decisoes.reduce((a, b) =>
      b.dataHora > a.dataHora ? b : a,
    );
    return this.paraResposta(
      dto,
      maisRecente.usuario.nome,
      maisRecente.dataHora,
    );
  }

  private async gravarDecisao(
    tx: Prisma.TransactionClient,
    eventoId: number,
    usuarioId: number,
    dto: RegistrarDesempateDto,
    classificacao: ClassificacaoCalculada,
    decisaoPorGrupo: Map<number, DecisaoVigente>,
  ): Promise<DesempateRegistradoDto> {
    const operacaoId = randomUUID();
    const posicaoEnviada = new Map(
      dto.posicoes.map((item) => [item.grupoId, item.posicao]),
    );
    const gruposDecididosAntes = new Set(
      classificacao.empates
        .filter((empate) => empate.resolvidoManualmente)
        .flatMap((empate) => empate.grupoIds),
    );

    const ultima = await tx.apuracao.aggregate({
      where: { eventoId },
      _max: { versao: true },
    });
    const apuracao = await tx.apuracao.create({
      data: {
        eventoId,
        versao: (ultima._max.versao ?? 0) + 1,
        usuarioId,
        operacaoId,
        status: 'PROVISORIA',
      },
      select: { id: true, versao: true, status: true, dataHora: true },
    });
    await this.audit.record(tx, {
      usuarioId,
      eventoId,
      operacaoId,
      entidade: 'APURACAO',
      registroId: apuracao.id,
      operacao: 'INSERT',
      after: { versao: apuracao.versao, status: apuracao.status },
      descricao: 'Classificação gravada no desempate manual',
      afetaResultado: false,
    });

    // A classificação daquele momento, já com a decisão aplicada.
    await tx.classificacaoGrupo.createMany({
      data: classificacao.dados.map((linha) => ({
        apuracaoId: apuracao.id,
        grupoId: linha.grupoId,
        eventoId,
        posicao: posicaoEnviada.get(linha.grupoId) ?? linha.posicao,
        pontosDesafios: linha.pontosDesafios,
        pontosBonificacoes: linha.bonificacao,
        pontosPenalidades: linha.penalidade,
        pontosTotal: linha.total,
        desempateManual:
          posicaoEnviada.has(linha.grupoId) ||
          gruposDecididosAntes.has(linha.grupoId),
      })),
    });

    for (const item of dto.posicoes) {
      const anterior = decisaoPorGrupo.get(item.grupoId);
      if (anterior) {
        // O índice único só permite uma decisão vigente por grupo.
        await tx.desempateManual.update({
          where: { id: anterior.id },
          data: { vigente: false },
        });
        await this.audit.record(tx, {
          usuarioId,
          eventoId,
          operacaoId,
          entidade: 'DESEMPATE_MANUAL',
          registroId: anterior.id,
          operacao: 'UPDATE',
          before: { vigente: true },
          after: { vigente: false },
          descricao: 'Decisão substituída por um novo desempate',
        });
      }

      const decisao = await tx.desempateManual.create({
        data: {
          eventoId,
          grupoId: item.grupoId,
          apuracaoId: apuracao.id,
          decisaoAnteriorId: anterior?.id ?? null,
          operacaoId,
          posicao: item.posicao,
          justificativa: dto.justificativa,
          usuarioId,
        },
        select: { id: true },
      });
      await this.audit.record(tx, {
        usuarioId,
        eventoId,
        operacaoId,
        entidade: 'DESEMPATE_MANUAL',
        registroId: decisao.id,
        operacao: 'INSERT',
        after: { grupoId: item.grupoId, posicao: item.posicao },
        justificativa: dto.justificativa,
      });
    }

    const usuario = await tx.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { nome: true },
    });
    return this.paraResposta(dto, usuario.nome, apuracao.dataHora);
  }

  private paraResposta(
    dto: RegistrarDesempateDto,
    responsavel: string,
    dataHora: Date,
  ): DesempateRegistradoDto {
    return {
      posicoes: [...dto.posicoes]
        .sort((a, b) => a.posicao - b.posicao)
        .map(({ grupoId, posicao }) => ({ grupoId, posicao })),
      justificativa: dto.justificativa,
      responsavel,
      // Sem milissegundos, como a auditoria (2026-11-24T20:10:00Z).
      dataHora: dataHora.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    };
  }
}
