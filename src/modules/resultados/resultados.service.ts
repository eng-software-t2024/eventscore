import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ResultadoSalvoDto } from './dto/resultado-salvo.dto.js';
import type { ResultadoDto } from './dto/resultado.dto.js';
import type { SalvarResultadoDto } from './dto/salvar-resultado.dto.js';

type ExistingResult = {
  id: number;
  grupoId: number;
  colocacao: number | null;
  ausente: boolean;
};

type ChallengeWithPoints = {
  id: number;
  pontosColocacao: Array<{ colocacao: number; pontos: number }>;
};

@Injectable()
export class ResultadosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditoriaService,
  ) {}

  async list(eventId: number, challengeId: number): Promise<ResultadoDto[]> {
    const challenge = await this.findChallengeInEvent(
      this.prisma,
      eventId,
      challengeId,
    );
    const groups = await this.prisma.grupo.findMany({
      where: { eventoId: eventId },
      orderBy: { id: 'asc' },
      select: { id: true },
    });

    if (groups.length === 0) {
      return [];
    }

    const existingRows = await this.prisma.resultadoDesafio.findMany({
      where: { eventoId: eventId, desafioId: challengeId },
      select: { id: true, grupoId: true, colocacao: true, ausente: true },
    });

    const pointsByPlacement = this.buildPointsMap(challenge.pontosColocacao);
    const existingByGroup = new Map(
      existingRows.map((row) => [row.grupoId, row]),
    );

    return groups.map((group) => {
      const existing = existingByGroup.get(group.id);
      if (!existing) {
        return {
          id: null,
          grupoId: group.id,
          colocacao: null,
          ausente: false,
          pontos: 0,
        };
      }

      return {
        id: existing.id,
        grupoId: group.id,
        colocacao: existing.colocacao,
        ausente: existing.ausente,
        pontos: this.calculatePoints(
          existing.ausente,
          existing.colocacao,
          pointsByPlacement,
        ),
      };
    });
  }

  async save(
    userId: number,
    eventId: number,
    challengeId: number,
    items: SalvarResultadoDto[],
  ): Promise<ResultadoSalvoDto[]> {
    if (items.length === 0) {
      throw new BadRequestException('Informe ao menos um resultado.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id_desafio
        FROM desafio
        WHERE id_desafio = ${challengeId}::int
          AND id_evento = ${eventId}::int
        FOR UPDATE
      `;

      const challenge = await this.findChallengeInEvent(
        tx,
        eventId,
        challengeId,
      );
      const groups = await tx.grupo.findMany({
        where: { eventoId: eventId },
        orderBy: { id: 'asc' },
        select: { id: true },
      });

      const pointsByPlacement = this.buildPointsMap(challenge.pontosColocacao);
      this.validatePayloadDomain(items, groups, pointsByPlacement);

      const existingRows = await tx.resultadoDesafio.findMany({
        where: { eventoId: eventId, desafioId: challengeId },
        select: { id: true, grupoId: true, colocacao: true, ausente: true },
      });
      const existingByGroup = new Map(
        existingRows.map((row) => [row.grupoId, row]),
      );

      const toInsert: SalvarResultadoDto[] = [];
      const toUpdate: Array<{
        existing: ExistingResult;
        next: SalvarResultadoDto;
      }> = [];
      const finalByGroup = new Map<number, ExistingResult>();

      for (const item of items) {
        const existing = existingByGroup.get(item.grupoId);
        if (!existing) {
          toInsert.push(item);
        } else if (
          existing.colocacao !== item.colocacao ||
          existing.ausente !== item.ausente
        ) {
          toUpdate.push({ existing, next: item });
        } else {
          finalByGroup.set(item.grupoId, existing);
        }
      }

      // O índice único parcial ux_resultado_colocacao_presentes é imediato; liberar colocações
      // em alteração antes de gravar as finais evita colisão ao trocar 1º e 2º lugar mantendo os IDs.
      if (toUpdate.length > 0) {
        await tx.resultadoDesafio.updateMany({
          where: { id: { in: toUpdate.map((entry) => entry.existing.id) } },
          data: { ausente: true, colocacao: null },
        });

        for (const { existing, next } of toUpdate) {
          const updated = await tx.resultadoDesafio.update({
            where: { id: existing.id },
            data: { colocacao: next.colocacao, ausente: next.ausente },
            select: { id: true, grupoId: true, colocacao: true, ausente: true },
          });
          finalByGroup.set(updated.grupoId, updated);
        }
      }

      const insertedRows: ExistingResult[] = [];
      for (const item of toInsert) {
        const created = await tx.resultadoDesafio.create({
          data: {
            eventoId: eventId,
            desafioId: challengeId,
            grupoId: item.grupoId,
            colocacao: item.colocacao,
            ausente: item.ausente,
          },
          select: { id: true, grupoId: true, colocacao: true, ausente: true },
        });
        insertedRows.push(created);
        finalByGroup.set(created.grupoId, created);
      }

      await this.runDatabaseValidation(tx, challengeId);

      const operationId = randomUUID();
      for (const created of insertedRows) {
        await this.audit.record(tx, {
          usuarioId: userId,
          eventoId: eventId,
          operacaoId: operationId,
          entidade: 'RESULTADO_DESAFIO',
          registroId: created.id,
          operacao: 'INSERT',
          after: {
            colocacao: created.colocacao,
            ausente: created.ausente,
          },
          afetaResultado: true,
        });
      }

      for (const { existing, next } of toUpdate) {
        await this.audit.record(tx, {
          usuarioId: userId,
          eventoId: eventId,
          operacaoId: operationId,
          entidade: 'RESULTADO_DESAFIO',
          registroId: existing.id,
          operacao: 'UPDATE',
          before: {
            colocacao: existing.colocacao,
            ausente: existing.ausente,
          },
          after: {
            colocacao: next.colocacao,
            ausente: next.ausente,
          },
          afetaResultado: true,
        });
      }

      return groups.map((group) => {
        const saved = finalByGroup.get(group.id)!;
        return {
          id: saved.id,
          grupoId: saved.grupoId,
          colocacao: saved.colocacao,
          ausente: saved.ausente,
          pontos: this.calculatePoints(
            saved.ausente,
            saved.colocacao,
            pointsByPlacement,
          ),
        };
      });
    });
  }

  private async findChallengeInEvent(
    db: PrismaService | Prisma.TransactionClient,
    eventId: number,
    challengeId: number,
  ): Promise<ChallengeWithPoints> {
    const challenge = await db.desafio.findUnique({
      where: { id_eventoId: { id: challengeId, eventoId: eventId } },
      select: {
        id: true,
        pontosColocacao: {
          select: { colocacao: true, pontos: true },
        },
      },
    });

    if (challenge) {
      return challenge;
    }

    const event = await db.evento.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (!event) {
      throw new NotFoundException('Evento não encontrado');
    }

    throw new NotFoundException('Desafio não encontrado neste evento');
  }

  private validatePayloadDomain(
    items: SalvarResultadoDto[],
    groups: Array<{ id: number }>,
    pointsByPlacement: Map<number, number>,
  ): void {
    const eventGroupIds = new Set(groups.map((group) => group.id));
    const seenGroups = new Set<number>();

    for (const item of items) {
      if (!eventGroupIds.has(item.grupoId)) {
        throw new NotFoundException('Grupo não encontrado neste evento');
      }
      if (seenGroups.has(item.grupoId)) {
        throw new UnprocessableEntityException(
          'Não é permitido repetir grupo no lançamento de resultados.',
        );
      }
      seenGroups.add(item.grupoId);
    }

    if (groups.length === 0 || seenGroups.size !== groups.length) {
      throw new UnprocessableEntityException(
        'O lançamento deve informar exatamente uma linha para cada grupo do evento.',
      );
    }

    const usedPlacements = new Set<number>();
    let presentCount = 0;

    for (const item of items) {
      if (item.ausente) {
        if (item.colocacao !== null) {
          throw new UnprocessableEntityException(
            'Grupo ausente não pode receber colocação.',
          );
        }
        continue;
      }

      if (item.colocacao === null) {
        throw new UnprocessableEntityException(
          'Grupo presente precisa ter uma colocação informada.',
        );
      }

      if (usedPlacements.has(item.colocacao)) {
        throw new UnprocessableEntityException(
          'Dois grupos não podem ter a mesma colocação.',
        );
      }

      usedPlacements.add(item.colocacao);
      presentCount++;
    }

    for (let placement = 1; placement <= presentCount; placement++) {
      if (!usedPlacements.has(placement)) {
        throw new UnprocessableEntityException(
          'As colocações dos grupos presentes devem formar a sequência 1..P sem lacunas.',
        );
      }
    }

    for (const placement of usedPlacements) {
      if (!pointsByPlacement.has(placement)) {
        throw new UnprocessableEntityException(
          `Não há pontuação configurada para a colocação ${placement}º neste desafio.`,
        );
      }
    }
  }

  private async runDatabaseValidation(
    tx: Prisma.TransactionClient,
    challengeId: number,
  ): Promise<void> {
    try {
      await tx.$queryRaw`SELECT fn_validar_resultado_desafio(${challengeId}::int)`;
    } catch {
      throw new UnprocessableEntityException(
        'Conjunto de colocações inválido para as regras do desafio.',
      );
    }
  }

  private buildPointsMap(
    table: Array<{ colocacao: number; pontos: number }>,
  ): Map<number, number> {
    return new Map(table.map((entry) => [entry.colocacao, entry.pontos]));
  }

  private calculatePoints(
    ausente: boolean,
    colocacao: number | null,
    pointsByPlacement: Map<number, number>,
  ): number {
    if (ausente || colocacao === null) {
      return 0;
    }
    return pointsByPlacement.get(colocacao) ?? 0;
  }
}
