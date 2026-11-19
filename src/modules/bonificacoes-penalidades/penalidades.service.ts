import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type {
  AtualizarPenalidadeDto,
  CriarPenalidadeDto,
  PenalidadeResumoDto,
} from './dto/penalidade.dto.js';

@Injectable()
export class PenalidadesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditoriaService,
  ) {}

  async list(eventId: number): Promise<PenalidadeResumoDto[]> {
    await this.assertEventExists(eventId);
    const entries = await this.prisma.penalidade.findMany({
      where: { grupo: { eventoId: eventId } },
      orderBy: { id: 'asc' },
      include: { grupo: { select: { id: true, nome: true } } },
    });
    return entries.map((entry) => this.toSummary(entry));
  }

  async create(
    eventId: number,
    dto: CriarPenalidadeDto,
    userId: number,
  ): Promise<PenalidadeResumoDto> {
    const event = await this.getEvent(eventId);
    await this.assertGroupInEvent(eventId, dto.grupoId);
    this.assertPenaltyRange(
      dto.pontos,
      event.penalidadeMin,
      event.penalidadeMax,
    );

    const entry = await this.prisma.$transaction(async (tx) => {
      const created = await tx.penalidade.create({
        data: {
          grupoId: dto.grupoId,
          descricao: dto.descricao,
          pontos: dto.pontos,
          justificativa: dto.justificativa.trim(),
        },
        include: { grupo: { select: { id: true, nome: true } } },
      });
      await this.audit.record(tx, {
        usuarioId: userId,
        eventoId: eventId,
        operacaoId: randomUUID(),
        entidade: 'PENALIDADE',
        registroId: created.id,
        operacao: 'INSERT',
        after: { pontos: created.pontos, justificativa: created.justificativa },
        justificativa: created.justificativa,
        afetaResultado: true,
      });
      return created;
    });
    return this.toSummary(entry);
  }

  async update(
    eventId: number,
    penaltyId: number,
    dto: AtualizarPenalidadeDto,
    userId: number,
  ): Promise<PenalidadeResumoDto> {
    const event = await this.getEvent(eventId);
    const current = await this.getPenaltyInEvent(eventId, penaltyId);
    const groupId = dto.grupoId ?? current.grupoId;
    const points = dto.pontos ?? current.pontos;
    await this.assertGroupInEvent(eventId, groupId);
    this.assertPenaltyRange(points, event.penalidadeMin, event.penalidadeMax);

    const entry = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.penalidade.update({
        where: { id: penaltyId },
        data: {
          grupoId: dto.grupoId,
          descricao: dto.descricao,
          pontos: dto.pontos,
          justificativa: dto.justificativa?.trim(),
        },
        include: { grupo: { select: { id: true, nome: true } } },
      });
      await this.audit.record(tx, {
        usuarioId: userId,
        eventoId: eventId,
        operacaoId: randomUUID(),
        entidade: 'PENALIDADE',
        registroId: penaltyId,
        operacao: 'UPDATE',
        before: {
          pontos: current.pontos,
          justificativa: current.justificativa,
          descricao: current.descricao,
          grupoId: current.grupoId,
        },
        after: {
          pontos: updated.pontos,
          justificativa: updated.justificativa,
          descricao: updated.descricao,
          grupoId: updated.grupoId,
        },
        justificativa: updated.justificativa,
        afetaResultado: true,
      });
      return updated;
    });
    return this.toSummary(entry);
  }

  async remove(
    eventId: number,
    penaltyId: number,
    userId: number,
  ): Promise<void> {
    const current = await this.getPenaltyInEvent(eventId, penaltyId);
    await this.prisma.$transaction(async (tx) => {
      await tx.penalidade.delete({ where: { id: penaltyId } });
      await this.audit.record(tx, {
        usuarioId: userId,
        eventoId: eventId,
        operacaoId: randomUUID(),
        entidade: 'PENALIDADE',
        registroId: penaltyId,
        operacao: 'DELETE',
        before: {
          pontos: current.pontos,
          justificativa: current.justificativa,
          descricao: current.descricao,
          grupoId: current.grupoId,
        },
        justificativa: current.justificativa,
        afetaResultado: true,
      });
    });
  }

  private toSummary(entry: any): PenalidadeResumoDto {
    return {
      id: entry.id,
      descricao: entry.descricao,
      pontos: entry.pontos,
      justificativa: entry.justificativa,
      grupoId: entry.grupo.id,
    };
  }

  private assertPenaltyRange(
    points: number,
    minimum: number | null,
    maximum: number | null,
  ): void {
    if (minimum === null || maximum === null) {
      throw new UnprocessableEntityException(
        'A faixa de penalidade ainda não foi configurada para o evento',
      );
    }
    if (points < minimum || points > maximum) {
      throw new UnprocessableEntityException(
        `A penalidade deve estar entre ${minimum} e ${maximum} pontos`,
      );
    }
  }

  private async getEvent(eventId: number) {
    const event = await this.prisma.evento.findUnique({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException('Evento não encontrado');
    return event;
  }

  private async assertEventExists(eventId: number): Promise<void> {
    await this.getEvent(eventId);
  }

  private async assertGroupInEvent(
    eventId: number,
    groupId: number,
  ): Promise<void> {
    const group = await this.prisma.grupo.findUnique({
      where: { id_eventoId: { id: groupId, eventoId: eventId } },
      select: { id: true },
    });
    if (!group)
      throw new NotFoundException('Grupo não encontrado neste evento');
  }

  private async getPenaltyInEvent(eventId: number, penaltyId: number) {
    const penalty = await this.prisma.penalidade.findUnique({
      where: { id: penaltyId },
      include: { grupo: { select: { id: true, eventoId: true, nome: true } } },
    });
    if (!penalty || penalty.grupo.eventoId !== eventId) {
      throw new NotFoundException('Penalidade não encontrada neste evento');
    }
    return penalty;
  }
}
