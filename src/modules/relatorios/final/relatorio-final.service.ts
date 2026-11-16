import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { EventosService } from '../../eventos/eventos.service.js';
import { FormatoRelatorio } from '../enums/formato-relatorio.enum.js';
import { RelatorioParcialService } from '../parcial/relatorio-parcial.service.js';
import {
  type ArquivoRelatorioGerado,
  type ColunaRelatorio,
  montarContentDisposition,
  montarNomeArquivoRelatorio,
  obterContentTypeRelatorio,
  type TabelaRelatorioConfig,
} from '../exporters/relatorio-export.types.js';
import { PdfTabelaExporter } from '../exporters/pdf-tabela.exporter.js';
import { XlsxPlanilhaExporter } from '../exporters/xlsx-planilha.exporter.js';
import type { PreviaRelatorioFinalQueryDto } from '../dto/previa-relatorio-final-query.dto.js';

const MENSAGEM_EMPATE =
  'A classificação tem empate pendente; registre o desempate antes do relatório final.';

function arredondarPontoExtra(
  pontoExtraGrupo: Prisma.Decimal,
  fator: Prisma.Decimal,
): number {
  const valorArredondado = pontoExtraGrupo
    .mul(fator)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  return Number(valorArredondado.toString());
}

export interface PresencaRelatorioFinal {
  numeroDia: number;
  presente: boolean;
}

export interface ParticipanteRelatorioFinal {
  matricula: string;
  nome: string;
  grupo: string;
  presencas: PresencaRelatorioFinal[];
  pontoExtra: number;
  turma: string;
}

export interface TurmaRelatorioFinal {
  turma: string;
  totalParticipantes: number;
  participantes: ParticipanteRelatorioFinal[];
}

interface FatorParticipante {
  participanteId: number;
  fator: Prisma.Decimal | null;
}

@Injectable()
export class RelatorioFinalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventosService: EventosService,
    private readonly relatorioParcialService: RelatorioParcialService,
    private readonly pdfExporter: PdfTabelaExporter,
    private readonly xlsxExporter: XlsxPlanilhaExporter,
  ) {}

  async gerarPrevia(
    eventoId: number,
    query: PreviaRelatorioFinalQueryDto,
  ): Promise<TurmaRelatorioFinal[]> {
    const { classificacao } = await this.obterBaseFinal(eventoId);
    const dias = await this.prisma.diaEvento.findMany({
      where: { eventoId },
      orderBy: [{ numeroDia: 'asc' }, { id: 'asc' }],
      select: { id: true, numeroDia: true },
    });
    const participantes = await this.prisma.participante.findMany({
      where: { eventoId },
      orderBy: [{ turma: 'asc' }, { nome: 'asc' }, { id: 'asc' }],
      include: {
        grupo: { select: { nome: true } },
        presencas: { select: { diaId: true, presente: true } },
      },
    });
    const fatores = await this.obterFatores(eventoId);
    const conversoes = await this.prisma.conversaoPontoExtra.findMany({
      where: { eventoId },
      select: { colocacao: true, pontoExtra: true },
    });
    const conversaoPorColocacao = new Map(
      conversoes.map((item) => [item.colocacao, item.pontoExtra]),
    );
    const busca = query.busca?.trim().toLocaleLowerCase('pt-BR');
    const linhas = participantes
      .filter((participante) => {
        if (!busca) return true;
        return [participante.nome, participante.matricula, participante.turma]
          .join(' ')
          .toLocaleLowerCase('pt-BR')
          .includes(busca);
      })
      .map((participante) => {
        const colocacao = classificacao.get(participante.grupoId);
        const pontoExtraGrupo =
          conversaoPorColocacao.get(colocacao ?? -1) ?? new Prisma.Decimal(0);
        const fator = fatores.get(participante.id) ?? new Prisma.Decimal(0);
        const pontoExtra = arredondarPontoExtra(pontoExtraGrupo, fator);
        const presencas = dias.map((dia) => ({
          numeroDia: dia.numeroDia,
          presente:
            participante.presencas.find((presenca) => presenca.diaId === dia.id)
              ?.presente ?? false,
        }));

        return {
          matricula: participante.matricula,
          nome: participante.nome,
          grupo: participante.grupo.nome,
          presencas,
          pontoExtra,
          turma: participante.turma,
        };
      })
      .sort(
        (a, b) =>
          a.turma.localeCompare(b.turma, 'pt-BR') ||
          a.nome.localeCompare(b.nome, 'pt-BR') ||
          a.matricula.localeCompare(b.matricula, 'pt-BR'),
      );

    const porTurma = new Map<string, ParticipanteRelatorioFinal[]>();
    for (const linha of linhas) {
      const grupo = porTurma.get(linha.turma) ?? [];
      grupo.push(linha);
      porTurma.set(linha.turma, grupo);
    }

    return [...porTurma.entries()].map(([turma, itens]) => ({
      turma,
      totalParticipantes: itens.length,
      participantes: itens,
    }));
  }

  async gerarRelatorioFinal(
    eventoId: number,
    formato: FormatoRelatorio,
  ): Promise<ArquivoRelatorioGerado> {
    const evento = await this.eventosService.buscarPorId(eventoId);
    const previa = await this.gerarPrevia(eventoId, {});
    const dias = [
      ...new Set(
        previa.flatMap((turma) =>
          turma.participantes.flatMap((item) =>
            item.presencas.map((dia) => dia.numeroDia),
          ),
        ),
      ),
    ].sort((a, b) => a - b);
    const colunas: ColunaRelatorio[] = [
      ...(formato === FormatoRelatorio.XLSX
        ? [{ chave: 'turma', titulo: 'Turma' }]
        : []),
      { chave: 'matricula', titulo: 'Matrícula' },
      { chave: 'nome', titulo: 'Nome' },
      { chave: 'grupo', titulo: 'Grupo' },
      ...dias.map((numeroDia) => ({
        chave: `dia${numeroDia}`,
        titulo: `Dia ${numeroDia}`,
        alinhamento: 'center' as const,
      })),
      {
        chave: 'pontoExtra',
        titulo: 'Ponto extra',
        alinhamento: 'right' as const,
      },
    ];
    const linhas = previa.flatMap((turma) =>
      turma.participantes.map((participante) => ({
        turma: turma.turma,
        matricula: participante.matricula,
        nome: participante.nome,
        grupo: participante.grupo,
        ...Object.fromEntries(
          participante.presencas.map((dia) => [
            `dia${dia.numeroDia}`,
            dia.presente ? 'Presente' : 'Ausente',
          ]),
        ),
        pontoExtra: participante.pontoExtra,
      })),
    );
    const config: TabelaRelatorioConfig = {
      nomePlanilha: 'Relatório Final',
      nomeEvento: evento.nome,
      tituloRelatorio: 'Relatório final por participante',
      geradoEm: new Date(),
      secoes: [
        { colunas, linhas, mensagemVazia: 'Nenhum participante encontrado.' },
      ],
    };
    const buffer =
      formato === FormatoRelatorio.PDF
        ? await this.pdfExporter.gerarBuffer(config)
        : await this.xlsxExporter.gerarBuffer(config);
    const nomeArquivo = montarNomeArquivoRelatorio(
      'final',
      evento.nome,
      formato,
    );
    return {
      buffer,
      contentType: obterContentTypeRelatorio(formato),
      nomeArquivo,
      contentDisposition: montarContentDisposition(nomeArquivo),
    };
  }

  private async obterBaseFinal(eventoId: number): Promise<{
    classificacao: Map<number, number>;
  }> {
    await this.eventosService.buscarPorId(eventoId);
    const calculada =
      await this.relatorioParcialService.calcularClassificacaoParcial(eventoId);
    if (calculada.resumo.empatesPendentes.length > 0) {
      throw new ConflictException(MENSAGEM_EMPATE);
    }
    return {
      classificacao: new Map(
        calculada.dados.map((linha) => [linha.grupoId, linha.posicao]),
      ),
    };
  }

  private async obterFatores(
    eventoId: number,
  ): Promise<Map<number, Prisma.Decimal>> {
    const fatores = await this.prisma.$queryRaw<FatorParticipante[]>(Prisma.sql`
      SELECT id_participante AS "participanteId", fator
      FROM vw_participante_fator
      WHERE id_evento = ${eventoId}
    `);
    return new Map(
      fatores.map((item) => [
        item.participanteId,
        item.fator === null ? new Prisma.Decimal(0) : item.fator,
      ]),
    );
  }
}
