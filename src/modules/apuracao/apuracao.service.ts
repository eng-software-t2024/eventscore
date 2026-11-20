import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ClassificacaoService } from '../classificacao/classificacao.service.js';
import {
  describeMissingConfiguration,
  getIncompleteEventReason,
  getMissingConfiguration,
} from '../classificacao/event-readiness.js';
import {
  calculateIndividualResults,
  type PresencaParticipanteApuracao,
} from './calculo-apuracao.js';
import type { ApuracaoEnvelopeDto } from './dto/apuracao.dto.js';
import type { ConsultarApuracaoQueryDto } from './dto/consultar-apuracao-query.dto.js';

@Injectable()
export class ApuracaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classificacao: ClassificacaoService,
  ) {}

  async getResults(
    eventId: number,
    query: ConsultarApuracaoQueryDto,
  ): Promise<ApuracaoEnvelopeDto> {
    // A classificação oficial é calculada no mesmo serviço usado pela rota
    // /classificacao e pelos relatórios; a apuração não cria outra ordenação.
    const classification = await this.classificacao.consultar(eventId);
    const [event, groups, challenges, conversions, factors] = await Promise.all(
      [
        this.prisma.evento.findUnique({
          where: { id: eventId },
          select: { quantidadeDias: true },
        }),
        this.prisma.grupo.findMany({
          where: { eventoId: eventId },
          select: { id: true },
        }),
        this.prisma.desafio.findMany({
          where: { eventoId: eventId },
          select: {
            resultados: {
              select: { grupoId: true, colocacao: true, ausente: true },
            },
          },
        }),
        this.prisma.conversaoPontoExtra.findMany({
          where: { eventoId: eventId },
          select: { colocacao: true, pontoExtra: true },
        }),
        this.prisma.fatorPresenca.findMany({
          where: { eventoId: eventId },
          select: { diasPresentes: true },
        }),
      ],
    );
    if (!event) throw new NotFoundException('Evento não encontrado');

    const incompleteReason = getIncompleteEventReason(groups, challenges);
    if (incompleteReason === 'groups')
      throw new ConflictException(
        'A apuração não está disponível porque o evento não possui grupos.',
      );
    if (incompleteReason === 'challenges')
      throw new ConflictException(
        'A apuração não está disponível porque o evento não possui desafios.',
      );
    if (incompleteReason === 'results')
      throw new ConflictException(
        'A apuração não está disponível porque há resultados pendentes.',
      );
    if (classification.resumo.empatesPendentes.length > 0) {
      throw new ConflictException(
        'A classificação tem empate pendente; registre o desempate antes da apuração.',
      );
    }

    const missing = getMissingConfiguration(
      groups.length,
      event.quantidadeDias,
      conversions.map((item) => item.colocacao),
      factors.map((item) => item.diasPresentes),
    );
    if (missing)
      throw new ConflictException(describeMissingConfiguration(missing));

    const where: Prisma.ParticipanteWhereInput = { eventoId: eventId };
    if (query.grupoId !== undefined) where.grupoId = query.grupoId;
    if (query.turma) where.turma = query.turma;
    const search = query.busca?.trim();
    if (search) {
      where.OR = [
        { nome: { contains: search, mode: 'insensitive' } },
        { matricula: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [participants, totalDays, attendance] = await Promise.all([
      this.prisma.participante.findMany({
        where,
        orderBy: [{ turma: 'asc' }, { nome: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          matricula: true,
          nome: true,
          turma: true,
          grupoId: true,
          grupo: { select: { nome: true } },
        },
      }),
      this.prisma.diaEvento.count({ where: { eventoId: eventId } }),
      this.prisma.$queryRaw<PresencaParticipanteApuracao[]>(Prisma.sql`
        SELECT id_participante AS "participanteId",
               dias_presentes AS "diasPresentes", fator
        FROM vw_participante_fator
          WHERE id_evento = ${eventId}
      `),
    ]);

    const placements = new Map(
      classification.dados.map((item) => [item.grupoId, item.posicao]),
    );
    const conversionTable = new Map(
      conversions.map((item) => [item.colocacao, item.pontoExtra]),
    );
    const { linhas: lines, resumo: summary } = calculateIndividualResults(
      participants,
      attendance,
      placements,
      conversionTable,
      totalDays,
    );
    const { pagina: page, tamanho: pageSize } = query;

    return {
      dados: lines.slice((page - 1) * pageSize, page * pageSize),
      paginacao: {
        pagina: page,
        tamanho: pageSize,
        totalItens: lines.length,
        totalPaginas: Math.ceil(lines.length / pageSize),
      },
      resumo: summary,
    };
  }
}
