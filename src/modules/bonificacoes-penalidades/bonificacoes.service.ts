import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type {
  AtualizarBonificacoesDto,
  BonificacaoGrupoResumoDto,
} from './dto/bonificacao.dto.js';

@Injectable()
export class BonificacoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditoriaService,
  ) {}

  async list(eventId: number): Promise<BonificacaoGrupoResumoDto[]> {
    await this.assertEventExists(eventId);

    const entries = await this.prisma.bonificacaoGrupo.findMany({
      where: { grupo: { eventoId: eventId } },
      orderBy: { id: 'asc' },
      include: {
        grupo: { select: { id: true, nome: true } },
        itemBonificacao: { select: { id: true, nome: true, teto: true } },
      },
    });

    return this.groupEntries(entries);
  }

  async replaceForGroup(
    eventId: number,
    groupId: number,
    dto: AtualizarBonificacoesDto,
    userId: number,
  ): Promise<BonificacaoGrupoResumoDto> {
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
      const previous = await tx.bonificacaoGrupo.findMany({
        where: { grupoId: groupId },
        select: { id: true, itemBonificacaoId: true, valor: true },
      });
      const operationId = randomUUID();

      await tx.bonificacaoGrupo.deleteMany({ where: { grupoId: groupId } });
      for (const entry of previous) {
        await this.audit.record(tx, {
          usuarioId: userId,
          eventoId: eventId,
          operacaoId: operationId,
          entidade: 'BONIFICACAO_GRUPO',
          registroId: entry.id,
          operacao: 'DELETE',
          before: {
            itemBonificacaoId: entry.itemBonificacaoId,
            valor: entry.valor,
          },
          afetaResultado: true,
        });
      }
      if (dto.bonificacoes.length > 0) {
        for (const entry of dto.bonificacoes) {
          const created = await tx.bonificacaoGrupo.create({
            data: {
              grupoId: groupId,
              itemBonificacaoId: entry.itemBonificacaoId,
              valor: entry.valor,
            },
          });
          await this.audit.record(tx, {
            usuarioId: userId,
            eventoId: eventId,
            operacaoId: operationId,
            entidade: 'BONIFICACAO_GRUPO',
            registroId: created.id,
            operacao: 'INSERT',
            after: {
              itemBonificacaoId: entry.itemBonificacaoId,
              valor: entry.valor,
            },
            afetaResultado: true,
          });
        }
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

    return (
      this.groupEntries(entries)[0] ?? {
        grupoId: groupId,
        itens: [],
        total: 0,
      }
    );
  }

  private groupEntries(entries: any[]): BonificacaoGrupoResumoDto[] {
    const byGroup = new Map<number, BonificacaoGrupoResumoDto>();
    for (const entry of entries) {
      const current: BonificacaoGrupoResumoDto = byGroup.get(
        entry.grupo.id,
      ) ?? {
        grupoId: entry.grupo.id,
        itens: [],
        total: 0,
      };
      current.itens.push({
        itemBonificacaoId: entry.itemBonificacao.id,
        valor: entry.valor,
      });
      current.total += entry.valor;
      byGroup.set(entry.grupo.id, current);
    }
    return [...byGroup.values()];
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
