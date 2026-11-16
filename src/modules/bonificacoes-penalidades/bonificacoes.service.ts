import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  AtualizarBonificacoesDto,
  BonificacaoResumoDto,
} from './dto/bonificacao.dto.js';

@Injectable()
export class BonificacoesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(eventId: number): Promise<BonificacaoResumoDto[]> {
    await this.assertEventExists(eventId);

    const entries = await this.prisma.bonificacaoGrupo.findMany({
      where: { grupo: { eventoId: eventId } },
      orderBy: { id: 'asc' },
      include: {
        grupo: { select: { id: true, nome: true } },
        itemBonificacao: { select: { id: true, nome: true, teto: true } },
      },
    });

    return entries.map((entry) => this.toSummary(entry));
  }

  async replaceForGroup(
    eventId: number,
    groupId: number,
    dto: AtualizarBonificacoesDto,
  ): Promise<BonificacaoResumoDto[]> {
    await this.assertGroupInEvent(eventId, groupId);

    const itemIds = dto.bonificacoes.map((entry) => entry.itemBonificacaoId);
    if (new Set(itemIds).size !== itemIds.length) {
      throw new ConflictException(
        'Cada item de bonificação pode aparecer apenas uma vez',
      );
    }

    const items = await this.prisma.itemBonificacao.findMany({
      where: { eventoId: eventId, id: { in: itemIds } },
      select: { id: true, nome: true, teto: true },
    });
    const itemById = new Map(items.map((item) => [item.id, item]));

    for (const entry of dto.bonificacoes) {
      const item = itemById.get(entry.itemBonificacaoId);
      if (!item) {
        throw new NotFoundException(
          `Item de bonificação ${entry.itemBonificacaoId} não pertence ao evento`,
        );
      }
      if (entry.valor > item.teto) {
        throw new UnprocessableEntityException(
          `O valor da bonificação '${item.nome}' não pode exceder o teto de ${item.teto}`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.bonificacaoGrupo.deleteMany({ where: { grupoId: groupId } });
      if (dto.bonificacoes.length > 0) {
        await tx.bonificacaoGrupo.createMany({
          data: dto.bonificacoes.map((entry) => ({
            grupoId: groupId,
            itemBonificacaoId: entry.itemBonificacaoId,
            valor: entry.valor,
          })),
        });
      }
    });

    const entries = await this.prisma.bonificacaoGrupo.findMany({
      where: { grupoId: groupId, grupo: { eventoId: eventId } },
      orderBy: { id: 'asc' },
      include: {
        grupo: { select: { id: true, nome: true } },
        itemBonificacao: { select: { id: true, nome: true, teto: true } },
      },
    });

    return entries.map((entry) => this.toSummary(entry));
  }

  private toSummary(entry: any): BonificacaoResumoDto {
    return {
      id: entry.id,
      itemBonificacaoId: entry.itemBonificacao.id,
      itemNome: entry.itemBonificacao.nome,
      teto: entry.itemBonificacao.teto,
      grupoId: entry.grupo.id,
      grupo: entry.grupo.nome,
      valor: entry.valor,
    };
  }

  private async assertEventExists(eventId: number): Promise<void> {
    const event = await this.prisma.evento.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException('Evento não encontrado');
  }

  private async assertGroupInEvent(
    eventId: number,
    groupId: number,
  ): Promise<void> {
    const group = await this.prisma.grupo.findUnique({
      where: { id_eventoId: { id: groupId, eventoId: eventId } },
      select: { id: true },
    });
    if (!group) {
      await this.assertEventExists(eventId);
      throw new NotFoundException('Grupo não encontrado neste evento');
    }
  }
}
