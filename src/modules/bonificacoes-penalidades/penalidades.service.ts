import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  AtualizarPenalidadeDto,
  CriarPenalidadeDto,
  PenalidadeResumoDto,
} from './dto/penalidade.dto.js';

@Injectable()
export class PenalidadesService {
  constructor(private readonly prisma: PrismaService) {}

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
  ): Promise<PenalidadeResumoDto> {
    const event = await this.getEvent(eventId);
    await this.assertGroupInEvent(eventId, dto.grupoId);
    this.assertPenaltyRange(
      dto.pontos,
      event.penalidadeMin,
      event.penalidadeMax,
    );

    const entry = await this.prisma.penalidade.create({
      data: {
        grupoId: dto.grupoId,
        descricao: dto.descricao,
        pontos: dto.pontos,
        justificativa: dto.justificativa.trim(),
      },
      include: { grupo: { select: { id: true, nome: true } } },
    });
    return this.toSummary(entry);
  }

  async update(
    eventId: number,
    penaltyId: number,
    dto: AtualizarPenalidadeDto,
  ): Promise<PenalidadeResumoDto> {
    const event = await this.getEvent(eventId);
    const current = await this.getPenaltyInEvent(eventId, penaltyId);
    const groupId = dto.grupoId ?? current.grupoId;
    const points = dto.pontos ?? current.pontos;
    await this.assertGroupInEvent(eventId, groupId);
    this.assertPenaltyRange(points, event.penalidadeMin, event.penalidadeMax);

    const entry = await this.prisma.penalidade.update({
      where: { id: penaltyId },
      data: {
        grupoId: dto.grupoId,
        descricao: dto.descricao,
        pontos: dto.pontos,
        justificativa: dto.justificativa?.trim(),
      },
      include: { grupo: { select: { id: true, nome: true } } },
    });
    return this.toSummary(entry);
  }

  async remove(eventId: number, penaltyId: number): Promise<void> {
    await this.getPenaltyInEvent(eventId, penaltyId);
    await this.prisma.penalidade.delete({ where: { id: penaltyId } });
  }

  private toSummary(entry: any): PenalidadeResumoDto {
    return {
      id: entry.id,
      descricao: entry.descricao,
      pontos: entry.pontos,
      justificativa: entry.justificativa,
      grupoId: entry.grupo.id,
      grupo: entry.grupo.nome,
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
