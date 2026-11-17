import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AtualizarDesafioDto } from './dto/atualizar-desafio.dto.js';
import type { CriarDesafioDto } from './dto/criar-desafio.dto.js';
import type { DesafioDto } from './dto/desafio.dto.js';
import type { PontoColocacaoDto } from './dto/ponto-colocacao.dto.js';

type ChallengeWithScores = {
  id: number;
  nome: string;
  descricao: string | null;
  diaId: number;
  pontosColocacao: Array<{ colocacao: number; pontos: number }>;
};

const SCORES_ORDERED = {
  pontosColocacao: {
    orderBy: { colocacao: 'asc' as const },
    select: { colocacao: true, pontos: true },
  },
};

@Injectable()
export class DesafiosService {
  constructor(private readonly prisma: PrismaService) {}

  async list(eventId: number): Promise<DesafioDto[]> {
    await this.assertEventExists(this.prisma, eventId);

    const challenges = await this.prisma.desafio.findMany({
      where: { eventoId: eventId },
      orderBy: [{ dia: { numeroDia: 'asc' } }, { id: 'asc' }],
      include: SCORES_ORDERED,
    });

    return challenges.map((challenge) => this.toDto(challenge));
  }

  async findById(eventId: number, challengeId: number): Promise<DesafioDto> {
    const challenge = await this.findChallengeInEvent(
      this.prisma,
      eventId,
      challengeId,
    );

    return this.toDto(challenge);
  }

  async create(eventId: number, dto: CriarDesafioDto): Promise<DesafioDto> {
    const nome = this.normalizeName(dto.nome);
    const descricao = this.normalizeDescription(dto.descricao);

    return this.prisma.$transaction(async (tx) => {
      await this.assertEventExists(tx, eventId);
      await this.assertDayInEvent(tx, eventId, dto.diaId);
      const groupCount = await tx.grupo.count({
        where: { eventoId: eventId },
      });
      this.validateScoringTable(dto.pontosColocacao, groupCount);
      await this.assertUniqueNameInDay(tx, eventId, dto.diaId, nome);

      const created = await tx.desafio.create({
        data: {
          eventoId: eventId,
          diaId: dto.diaId,
          nome,
          descricao,
          pontosColocacao: {
            create: this.sortScores(dto.pontosColocacao),
          },
        },
        include: SCORES_ORDERED,
      });

      return this.toDto(created);
    });
  }

  async update(
    eventId: number,
    challengeId: number,
    dto: AtualizarDesafioDto,
  ): Promise<DesafioDto> {
    const nextName =
      dto.nome !== undefined ? this.normalizeName(dto.nome) : undefined;
    const nextDescription =
      dto.descricao !== undefined
        ? this.normalizeDescription(dto.descricao)
        : undefined;

    return this.prisma.$transaction(async (tx) => {
      const current = await this.findChallengeInEvent(tx, eventId, challengeId);

      const targetName = nextName ?? current.nome;
      const targetDescription = nextDescription ?? current.descricao ?? '';
      const targetDayId = dto.diaId ?? current.diaId;
      const dayChanged = targetDayId !== current.diaId;
      const tableChanged =
        dto.pontosColocacao !== undefined &&
        !this.hasSameScoringTable(current.pontosColocacao, dto.pontosColocacao);

      if (dayChanged) {
        await this.assertDayInEvent(tx, eventId, targetDayId);
      }

      const resultCount = await tx.resultadoDesafio.count({
        where: { desafioId: challengeId, eventoId: eventId },
      });

      if (resultCount > 0) {
        if (dayChanged || tableChanged) {
          throw new ConflictException(
            'Não é possível alterar o dia ou a tabela de pontos de um desafio que já possui resultados lançados.',
          );
        }
      } else {
        const groupCount = await tx.grupo.count({
          where: { eventoId: eventId },
        });
        const resultingTable = dto.pontosColocacao ?? current.pontosColocacao;
        this.validateScoringTable(resultingTable, groupCount);
      }

      if (targetName !== current.nome || dayChanged) {
        await this.assertUniqueNameInDay(
          tx,
          eventId,
          targetDayId,
          targetName,
          challengeId,
        );
      }

      if (tableChanged && dto.pontosColocacao !== undefined) {
        await tx.pontosColocacao.deleteMany({
          where: { desafioId: challengeId },
        });
        await tx.pontosColocacao.createMany({
          data: this.sortScores(dto.pontosColocacao).map((item) => ({
            desafioId: challengeId,
            colocacao: item.colocacao,
            pontos: item.pontos,
          })),
        });
      }

      const updated = await tx.desafio.update({
        where: { id_eventoId: { id: challengeId, eventoId: eventId } },
        data: {
          nome: targetName,
          descricao: targetDescription,
          diaId: targetDayId,
        },
        include: SCORES_ORDERED,
      });

      return this.toDto(updated);
    });
  }

  async remove(eventId: number, challengeId: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.findChallengeInEvent(tx, eventId, challengeId);

      const criteriaCount = await tx.criterioDesempate.count({
        where: { desafioId: challengeId, eventoId: eventId },
      });
      if (criteriaCount > 0) {
        throw new ConflictException(
          'O desafio está vinculado a um critério de desempate.',
        );
      }

      const resultCount = await tx.resultadoDesafio.count({
        where: { desafioId: challengeId, eventoId: eventId },
      });
      if (resultCount > 0) {
        throw new ConflictException(
          'O desafio não pode ser excluído porque já possui resultados lançados.',
        );
      }

      await tx.pontosColocacao.deleteMany({
        where: { desafioId: challengeId },
      });
      await tx.desafio.delete({
        where: { id_eventoId: { id: challengeId, eventoId: eventId } },
      });
    });
  }

  private async assertEventExists(
    db: PrismaService | Prisma.TransactionClient,
    eventId: number,
  ): Promise<void> {
    const event = await db.evento.findUnique({
      where: { id: eventId },
      select: { id: true },
    });

    if (!event) {
      throw new NotFoundException('Evento não encontrado');
    }
  }

  private async assertDayInEvent(
    db: PrismaService | Prisma.TransactionClient,
    eventId: number,
    dayId: number,
  ): Promise<void> {
    const day = await db.diaEvento.findUnique({
      where: { id_eventoId: { id: dayId, eventoId: eventId } },
      select: { id: true },
    });

    if (!day) {
      throw new NotFoundException('Dia do evento não encontrado neste evento');
    }
  }

  private async findChallengeInEvent(
    db: PrismaService | Prisma.TransactionClient,
    eventId: number,
    challengeId: number,
  ): Promise<ChallengeWithScores> {
    const challenge = await db.desafio.findUnique({
      where: { id_eventoId: { id: challengeId, eventoId: eventId } },
      include: SCORES_ORDERED,
    });

    if (challenge) {
      return challenge;
    }

    await this.assertEventExists(db, eventId);
    throw new NotFoundException('Desafio não encontrado neste evento');
  }

  private async assertUniqueNameInDay(
    db: PrismaService | Prisma.TransactionClient,
    eventId: number,
    dayId: number,
    nome: string,
    ignoreChallengeId?: number,
  ): Promise<void> {
    const existing = await db.desafio.findUnique({
      where: {
        eventoId_diaId_nome: {
          eventoId: eventId,
          diaId: dayId,
          nome,
        },
      },
      select: { id: true },
    });

    if (existing && existing.id !== ignoreChallengeId) {
      throw new ConflictException(
        `Já existe um desafio com o nome '${nome}' neste dia do evento.`,
      );
    }
  }

  private normalizeName(value: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException('nome deve ser uma string');
    }

    const normalized = value.trim();
    if (normalized.length === 0 || normalized.length > 100) {
      throw new BadRequestException(
        'nome deve possuir entre 1 e 100 caracteres',
      );
    }

    return normalized;
  }

  private normalizeDescription(value?: string): string {
    if (value === undefined) {
      return '';
    }
    if (typeof value !== 'string') {
      throw new BadRequestException('descricao deve ser uma string');
    }
    if (value.length > 255) {
      throw new BadRequestException(
        'descricao deve possuir no máximo 255 caracteres',
      );
    }
    return value;
  }

  private validateScoringTable(
    table: PontoColocacaoDto[],
    groupCount: number,
  ): void {
    if (groupCount === 0) {
      throw new UnprocessableEntityException(
        'O evento precisa ter ao menos um grupo cadastrado para definir a tabela de pontos.',
      );
    }

    if (table.length !== groupCount) {
      throw new UnprocessableEntityException(
        `A tabela de pontos precisa ter uma linha por grupo (${groupCount}).`,
      );
    }

    const seen = new Set<number>();
    for (const item of table) {
      if (seen.has(item.colocacao)) {
        throw new UnprocessableEntityException(
          'A tabela de pontos não pode repetir colocações.',
        );
      }
      seen.add(item.colocacao);
    }

    for (let placement = 1; placement <= groupCount; placement++) {
      if (!seen.has(placement)) {
        throw new UnprocessableEntityException(
          `As colocações da tabela de pontos devem formar a sequência 1..${groupCount}.`,
        );
      }
    }
  }

  private hasSameScoringTable(
    current: Array<{ colocacao: number; pontos: number }>,
    candidate: PontoColocacaoDto[],
  ): boolean {
    if (current.length !== candidate.length) {
      return false;
    }

    const candidateByPlacement = new Map<number, number>();
    for (const item of candidate) {
      if (candidateByPlacement.has(item.colocacao)) {
        return false;
      }
      candidateByPlacement.set(item.colocacao, item.pontos);
    }

    return current.every(
      (item) => candidateByPlacement.get(item.colocacao) === item.pontos,
    );
  }

  private sortScores(table: PontoColocacaoDto[]): PontoColocacaoDto[] {
    return [...table]
      .sort((a, b) => a.colocacao - b.colocacao)
      .map((item) => ({ colocacao: item.colocacao, pontos: item.pontos }));
  }

  private toDto(challenge: ChallengeWithScores): DesafioDto {
    return {
      id: challenge.id,
      nome: challenge.nome,
      descricao: challenge.descricao ?? '',
      diaId: challenge.diaId,
      pontosColocacao: challenge.pontosColocacao
        .slice()
        .sort((a, b) => a.colocacao - b.colocacao)
        .map((item) => ({
          colocacao: item.colocacao,
          pontos: item.pontos,
        })),
    };
  }
}
