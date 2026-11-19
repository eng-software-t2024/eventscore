import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { TipoCriterioDesempate } from '../../common/enums/tipo-criterio-desempate.enum.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ConfiguracaoEventoDto } from './dto/configuracao-evento.dto.js';
import type { CriterioDesempateConfigDto } from './dto/criterio-desempate-config.dto.js';
import type { ItemBonificacaoConfigDto } from './dto/item-bonificacao-config.dto.js';

type Db = PrismaService | Prisma.TransactionClient;

type FaixaPenalidade = {
  penalidadeMin: number | null;
  penalidadeMax: number | null;
};

type ItemAtual = { id: number; nome: string; teto: number };

/**
 * Identidade de um critério: o tipo e, em MAIOR_PONTUACAO_DESAFIO, o desafio.
 * Ordem e descrição podem mudar sem que o critério deixe de ser o mesmo.
 */
function chaveCriterio(tipo: string, desafioId: number | null | undefined) {
  return `${tipo}:${desafioId ?? ''}`;
}

/**
 * Configuração de pontuação do evento (RF02, #199).
 *
 * O PUT substitui tudo numa transação, mas atualiza as linhas no lugar em vez
 * de apagar e recriar: itens de bonificação já lançados (`bonificacao_grupo`)
 * e critérios usados numa apuração gravada (`apuracao_criterio`) têm FK com
 * RESTRICT. Por isso cada lista é casada por chave: colocação, dias
 * presentes, id do item e, no critério, tipo + desafio.
 */
@Injectable()
export class ConfiguracaoService {
  constructor(private readonly prisma: PrismaService) {}

  async obter(eventoId: number): Promise<ConfiguracaoEventoDto> {
    const evento = await this.prisma.evento.findUnique({
      where: { id: eventoId },
      select: { penalidadeMin: true, penalidadeMax: true },
    });
    if (!evento) {
      throw new NotFoundException('Evento não encontrado');
    }

    return this.carregar(this.prisma, eventoId, evento);
  }

  async salvar(
    eventoId: number,
    dto: ConfiguracaoEventoDto,
  ): Promise<ConfiguracaoEventoDto> {
    return this.prisma.$transaction(async (tx) => {
      // Serializa gravações concorrentes da configuração do mesmo evento.
      const [evento] = await tx.$queryRaw<{ quantidade_dias: number }[]>`
        SELECT quantidade_dias
        FROM evento
        WHERE id_evento = ${eventoId}::int
        FOR UPDATE
      `;
      if (!evento) {
        throw new NotFoundException('Evento não encontrado');
      }

      const totalGrupos = await tx.grupo.count({ where: { eventoId } });
      this.validarConversao(dto, totalGrupos);
      this.validarFatores(dto, evento.quantidade_dias);
      this.validarFaixa(dto);
      this.validarCriterios(dto.criteriosDesempate);
      this.validarNomesDosItens(dto.itensBonificacao);

      await this.validarDesafios(tx, eventoId, dto.criteriosDesempate);
      await this.validarPenalidadesLancadas(tx, eventoId, dto);

      await tx.evento.update({
        where: { id: eventoId },
        data: {
          penalidadeMin: dto.penalidadeMin,
          penalidadeMax: dto.penalidadeMax,
        },
      });
      await this.salvarConversao(tx, eventoId, dto);
      await this.salvarFatores(tx, eventoId, dto);
      await this.salvarItens(tx, eventoId, dto.itensBonificacao);
      await this.salvarCriterios(tx, eventoId, dto.criteriosDesempate);

      return this.carregar(tx, eventoId, dto);
    });
  }

  private async carregar(
    db: Db,
    eventoId: number,
    faixa: FaixaPenalidade,
  ): Promise<ConfiguracaoEventoDto> {
    const [conversoes, itens, fatores, criterios] = await Promise.all([
      db.conversaoPontoExtra.findMany({
        where: { eventoId },
        orderBy: { colocacao: 'asc' },
      }),
      db.itemBonificacao.findMany({
        where: { eventoId },
        orderBy: { id: 'asc' },
      }),
      db.fatorPresenca.findMany({
        where: { eventoId },
        orderBy: { diasPresentes: 'asc' },
      }),
      db.criterioDesempate.findMany({
        where: { eventoId },
        orderBy: { ordem: 'asc' },
      }),
    ]);

    return {
      conversaoPontoExtra: conversoes.map((c) => ({
        colocacao: c.colocacao,
        pontoExtra: Number(c.pontoExtra),
      })),
      itensBonificacao: itens.map((i) => ({
        id: i.id,
        nome: i.nome,
        teto: i.teto,
      })),
      penalidadeMin: faixa.penalidadeMin,
      penalidadeMax: faixa.penalidadeMax,
      fatoresPresenca: fatores.map((f) => ({
        diasPresentes: f.diasPresentes,
        fator: Number(f.fator),
      })),
      criteriosDesempate: criterios.map((c) => ({
        ordem: c.ordem,
        tipo: c.tipo as TipoCriterioDesempate,
        desafioId: c.desafioId,
        descricao: c.descricao,
      })),
    };
  }

  // ---------------------------------------------------------------------
  // Validações sem banco
  // ---------------------------------------------------------------------

  /** Uma linha por grupo, colocações 1..N (Regimento, art. 17; RF06). */
  private validarConversao(dto: ConfiguracaoEventoDto, totalGrupos: number) {
    const colocacoes = dto.conversaoPontoExtra.map((c) => c.colocacao);
    if (colocacoes.length !== totalGrupos) {
      throw new UnprocessableEntityException(
        `A tabela de ponto extra deve ter uma linha para cada um dos ${totalGrupos} grupos do evento.`,
      );
    }
    if (!this.formaSequencia(colocacoes, 1)) {
      throw new UnprocessableEntityException(
        `As colocações da tabela de ponto extra devem ir de 1 a ${totalGrupos}, sem repetição.`,
      );
    }
  }

  /** Um fator para cada quantidade de dias presentes, de 0 a N (art. 17). */
  private validarFatores(dto: ConfiguracaoEventoDto, quantidadeDias: number) {
    const dias = dto.fatoresPresenca.map((f) => f.diasPresentes);
    if (dias.length !== quantidadeDias + 1 || !this.formaSequencia(dias, 0)) {
      throw new UnprocessableEntityException(
        `Informe um fator de presença para cada quantidade de dias presentes, de 0 a ${quantidadeDias}, sem repetição.`,
      );
    }
  }

  private validarFaixa(dto: ConfiguracaoEventoDto) {
    const { penalidadeMin: min, penalidadeMax: max } = dto;
    if ((min === null) !== (max === null)) {
      throw new UnprocessableEntityException(
        'Informe a penalidade mínima e a máxima, ou deixe as duas em branco.',
      );
    }
    if (min !== null && max !== null && min > max) {
      throw new UnprocessableEntityException(
        'A penalidade mínima não pode ser maior que a máxima.',
      );
    }
  }

  /**
   * Ordem 1..N; desafioId só em MAIOR_PONTUACAO_DESAFIO (V12); sem critério
   * repetido. O mesmo tipo de desafio pode aparecer com desafios diferentes,
   * como no art. 16 do Regimento (Maratona, Robótica, P&R, Algoritmo).
   */
  private validarCriterios(criterios: CriterioDesempateConfigDto[]) {
    if (
      !this.formaSequencia(
        criterios.map((c) => c.ordem),
        1,
      )
    ) {
      throw new UnprocessableEntityException(
        `A ordem dos critérios de desempate deve ir de 1 a ${criterios.length}, sem repetição.`,
      );
    }

    const vistos = new Set<string>();
    for (const criterio of criterios) {
      const porDesafio =
        criterio.tipo === TipoCriterioDesempate.MAIOR_PONTUACAO_DESAFIO;
      const desafioId = criterio.desafioId ?? null;

      if (porDesafio && desafioId === null) {
        throw new UnprocessableEntityException(
          `Escolha o desafio do ${criterio.ordem}º critério de desempate.`,
        );
      }
      if (!porDesafio && desafioId !== null) {
        throw new UnprocessableEntityException(
          `O ${criterio.ordem}º critério de desempate não usa desafio; envie desafioId nulo.`,
        );
      }

      const chave = chaveCriterio(criterio.tipo, desafioId);
      if (vistos.has(chave)) {
        throw new UnprocessableEntityException(
          `O ${criterio.ordem}º critério de desempate repete um critério anterior.`,
        );
      }
      vistos.add(chave);
    }
  }

  private validarNomesDosItens(itens: ItemBonificacaoConfigDto[]) {
    const nomes = new Set<string>();
    const ids = new Set<number>();
    for (const item of itens) {
      const nome = item.nome.toLocaleLowerCase('pt-BR');
      if (nomes.has(nome)) {
        throw new UnprocessableEntityException(
          `O item de bonificação "${item.nome}" aparece mais de uma vez.`,
        );
      }
      nomes.add(nome);

      if (item.id !== undefined) {
        if (ids.has(item.id)) {
          throw new UnprocessableEntityException(
            `O item de bonificação ${item.id} aparece mais de uma vez.`,
          );
        }
        ids.add(item.id);
      }
    }
  }

  private formaSequencia(valores: number[], inicio: number): boolean {
    const unicos = new Set(valores);
    return (
      unicos.size === valores.length &&
      valores.every((v) => v >= inicio && v < inicio + valores.length)
    );
  }

  // ---------------------------------------------------------------------
  // Validações que dependem do que já está gravado
  // ---------------------------------------------------------------------

  private async validarDesafios(
    tx: Prisma.TransactionClient,
    eventoId: number,
    criterios: CriterioDesempateConfigDto[],
  ) {
    const ids = [
      ...new Set(
        criterios
          .map((c) => c.desafioId)
          .filter((id): id is number => typeof id === 'number'),
      ),
    ];
    if (ids.length === 0) {
      return;
    }

    const encontrados = await tx.desafio.findMany({
      where: { eventoId, id: { in: ids } },
      select: { id: true },
    });
    if (encontrados.length !== ids.length) {
      throw new NotFoundException('Desafio não encontrado neste evento');
    }
  }

  /** A faixa não pode deixar de fora penalidade já lançada (ADR 0003, item 7). */
  private async validarPenalidadesLancadas(
    tx: Prisma.TransactionClient,
    eventoId: number,
    dto: ConfiguracaoEventoDto,
  ) {
    const lancadas = await tx.penalidade.aggregate({
      where: { grupo: { eventoId } },
      _count: { _all: true },
      _min: { pontos: true },
      _max: { pontos: true },
    });
    if (lancadas._count._all === 0) {
      return;
    }

    const { penalidadeMin: min, penalidadeMax: max } = dto;
    if (min === null || max === null) {
      throw new UnprocessableEntityException(
        'Não é possível remover a faixa de penalidade porque já há penalidade lançada.',
      );
    }
    const menor = lancadas._min.pontos ?? min;
    const maior = lancadas._max.pontos ?? max;
    if (menor < min || maior > max) {
      throw new UnprocessableEntityException(
        `A nova faixa deixaria fora penalidades já lançadas (de ${menor} a ${maior} pontos).`,
      );
    }
  }

  // ---------------------------------------------------------------------
  // Gravação
  // ---------------------------------------------------------------------

  private async salvarConversao(
    tx: Prisma.TransactionClient,
    eventoId: number,
    dto: ConfiguracaoEventoDto,
  ) {
    const colocacoes = dto.conversaoPontoExtra.map((c) => c.colocacao);
    await tx.conversaoPontoExtra.deleteMany({
      where: { eventoId, colocacao: { notIn: colocacoes } },
    });
    for (const { colocacao, pontoExtra } of dto.conversaoPontoExtra) {
      await tx.conversaoPontoExtra.upsert({
        where: { eventoId_colocacao: { eventoId, colocacao } },
        create: { eventoId, colocacao, pontoExtra },
        update: { pontoExtra },
      });
    }
  }

  private async salvarFatores(
    tx: Prisma.TransactionClient,
    eventoId: number,
    dto: ConfiguracaoEventoDto,
  ) {
    const dias = dto.fatoresPresenca.map((f) => f.diasPresentes);
    await tx.fatorPresenca.deleteMany({
      where: { eventoId, diasPresentes: { notIn: dias } },
    });
    for (const { diasPresentes, fator } of dto.fatoresPresenca) {
      await tx.fatorPresenca.upsert({
        where: { eventoId_diasPresentes: { eventoId, diasPresentes } },
        create: { eventoId, diasPresentes, fator },
        update: { fator },
      });
    }
  }

  private async salvarItens(
    tx: Prisma.TransactionClient,
    eventoId: number,
    itens: ItemBonificacaoConfigDto[],
  ) {
    const atuais = await tx.itemBonificacao.findMany({
      where: { eventoId },
      select: { id: true, nome: true, teto: true },
    });
    const atuaisPorId = new Map(atuais.map((i) => [i.id, i]));

    const mantidos: Array<{
      atual: ItemAtual;
      novo: ItemBonificacaoConfigDto;
    }> = [];
    const novos: ItemBonificacaoConfigDto[] = [];
    for (const item of itens) {
      if (item.id === undefined) {
        novos.push(item);
        continue;
      }
      const atual = atuaisPorId.get(item.id);
      if (!atual) {
        throw new NotFoundException(
          'Item de bonificação não encontrado neste evento',
        );
      }
      mantidos.push({ atual, novo: item });
    }

    const idsMantidos = new Set(mantidos.map((m) => m.atual.id));
    const removidos = atuais.filter((i) => !idsMantidos.has(i.id));
    await this.validarItensRemovidos(tx, removidos);
    await this.validarTetos(tx, mantidos);

    if (removidos.length > 0) {
      await tx.itemBonificacao.deleteMany({
        where: { id: { in: removidos.map((i) => i.id) } },
      });
    }

    // Duas etapas: trocar o nome de dois itens entre si colidiria no índice
    // único (id_evento, nome), que não é adiável.
    const renomeados = mantidos.filter((m) => m.atual.nome !== m.novo.nome);
    for (const { atual } of renomeados) {
      await tx.itemBonificacao.update({
        where: { id: atual.id },
        data: { nome: `~${randomUUID()}` },
      });
    }
    for (const { atual, novo } of mantidos) {
      if (atual.nome !== novo.nome || atual.teto !== novo.teto) {
        await tx.itemBonificacao.update({
          where: { id: atual.id },
          data: { nome: novo.nome, teto: novo.teto },
        });
      }
    }

    for (const item of novos) {
      await tx.itemBonificacao.create({
        data: { eventoId, nome: item.nome, teto: item.teto },
      });
    }
  }

  private async validarItensRemovidos(
    tx: Prisma.TransactionClient,
    removidos: ItemAtual[],
  ) {
    if (removidos.length === 0) {
      return;
    }
    const lancamento = await tx.bonificacaoGrupo.findFirst({
      where: { itemBonificacaoId: { in: removidos.map((i) => i.id) } },
      select: { itemBonificacaoId: true },
    });
    if (lancamento) {
      const item = removidos.find((i) => i.id === lancamento.itemBonificacaoId);
      throw new ConflictException(
        `O item de bonificação "${item?.nome}" já tem bonificação lançada e não pode ser removido.`,
      );
    }
  }

  /** O teto novo não pode ficar abaixo de bonificação já lançada (RF10). */
  private async validarTetos(
    tx: Prisma.TransactionClient,
    mantidos: Array<{ atual: ItemAtual; novo: ItemBonificacaoConfigDto }>,
  ) {
    const reduzidos = mantidos.filter((m) => m.novo.teto < m.atual.teto);
    if (reduzidos.length === 0) {
      return;
    }

    const maiores = await tx.bonificacaoGrupo.groupBy({
      by: ['itemBonificacaoId'],
      where: { itemBonificacaoId: { in: reduzidos.map((m) => m.atual.id) } },
      _max: { valor: true },
    });
    for (const { itemBonificacaoId, _max } of maiores) {
      const item = reduzidos.find((m) => m.atual.id === itemBonificacaoId);
      if (item && _max.valor !== null && _max.valor > item.novo.teto) {
        throw new UnprocessableEntityException(
          `O teto de "${item.novo.nome}" não pode ficar abaixo de ${_max.valor}, bonificação já lançada.`,
        );
      }
    }
  }

  /**
   * Critérios casados pela identidade (tipo + desafio), nunca pela posição:
   * a linha usada numa apuração (`apuracao_criterio`) aponta para o id, que
   * não guarda o tipo. Se o id da 1ª posição passasse de "Maratona" para
   * "Robótica" ao reordenar, a apuração antiga mudaria de sentido. Assim,
   * reordenar só muda `ordem`, e só o critério que saiu da lista é removido.
   */
  private async salvarCriterios(
    tx: Prisma.TransactionClient,
    eventoId: number,
    criterios: CriterioDesempateConfigDto[],
  ) {
    const atuais = await tx.criterioDesempate.findMany({
      where: { eventoId },
      select: {
        id: true,
        ordem: true,
        tipo: true,
        desafioId: true,
        descricao: true,
      },
    });
    const atuaisPorChave = new Map(
      atuais.map((c) => [chaveCriterio(c.tipo, c.desafioId), c]),
    );
    const chavesNovas = new Set(
      criterios.map((c) => chaveCriterio(c.tipo, c.desafioId)),
    );

    const removidos = atuais.filter(
      (c) => !chavesNovas.has(chaveCriterio(c.tipo, c.desafioId)),
    );
    if (removidos.length > 0) {
      const emUso = await tx.apuracaoCriterio.findFirst({
        where: { criterioDesempateId: { in: removidos.map((c) => c.id) } },
        select: { criterioDesempateId: true },
      });
      if (emUso) {
        const criterio = removidos.find(
          (c) => c.id === emUso.criterioDesempateId,
        );
        throw new ConflictException(
          `O critério de desempate "${criterio?.descricao}" já foi usado em uma apuração e não pode ser removido.`,
        );
      }
      await tx.criterioDesempate.deleteMany({
        where: { id: { in: removidos.map((c) => c.id) } },
      });
    }

    const mantidos = criterios.flatMap((novo) => {
      const atual = atuaisPorChave.get(
        chaveCriterio(novo.tipo, novo.desafioId),
      );
      return atual ? [{ atual, novo }] : [];
    });

    // Duas etapas: o índice único (id_evento, ordem) não é adiável, então quem
    // muda de posição passa antes por uma ordem livre, acima de todas as outras.
    const movidos = mantidos.filter((m) => m.atual.ordem !== m.novo.ordem);
    const livre = Math.max(criterios.length, ...atuais.map((c) => c.ordem)) + 1;
    for (const [i, { atual }] of movidos.entries()) {
      await tx.criterioDesempate.update({
        where: { id: atual.id },
        data: { ordem: livre + i },
      });
    }
    for (const { atual, novo } of mantidos) {
      if (atual.ordem !== novo.ordem || atual.descricao !== novo.descricao) {
        await tx.criterioDesempate.update({
          where: { id: atual.id },
          data: { ordem: novo.ordem, descricao: novo.descricao },
        });
      }
    }

    for (const novo of criterios) {
      if (!atuaisPorChave.has(chaveCriterio(novo.tipo, novo.desafioId))) {
        await tx.criterioDesempate.create({
          data: {
            eventoId,
            ordem: novo.ordem,
            tipo: novo.tipo,
            desafioId: novo.desafioId ?? null,
            descricao: novo.descricao,
          },
        });
      }
    }
  }
}
