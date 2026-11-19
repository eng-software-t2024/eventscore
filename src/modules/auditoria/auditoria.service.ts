import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditOperation, AuditedEntity } from './auditoria.constants.js';
import type { AuditoriaItemDto } from './dto/auditoria-item.dto.js';

/**
 * Dados de uma anotação. As propriedades espelham as colunas da tabela
 * `auditoria`; `before` e `after` trazem só os campos relevantes do registro.
 */
export type AuditEntry = {
  usuarioId: number;
  eventoId: number;
  /** UUID compartilhado por todas as anotações de uma mesma requisição. */
  operacaoId: string;
  entidade: AuditedEntity;
  registroId: number;
  operacao: AuditOperation;
  /** Campos antes da alteração; ausente em INSERT. */
  before?: Record<string, unknown> | null;
  /** Campos depois da alteração; ausente em DELETE. */
  after?: Record<string, unknown> | null;
  descricao?: string;
  justificativa?: string;
  /** Padrão `true`: lançamentos alteram a classificação. */
  afetaResultado?: boolean;
};

type FieldChange = {
  campo: string;
  valorAnterior: string | null;
  valorNovo: string | null;
};

@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Histórico de um registro, da alteração mais antiga para a mais recente,
   * no formato exibido pelo front. Registro sem histórico devolve lista vazia.
   */
  async list(
    entidade: AuditedEntity,
    registroId: number,
  ): Promise<AuditoriaItemDto[]> {
    const audits = await this.prisma.auditoria.findMany({
      where: { entidade, registroId },
      orderBy: [{ dataHora: 'asc' }, { id: 'asc' }],
      select: {
        dataHora: true,
        operacao: true,
        usuario: { select: { nome: true } },
        detalhes: {
          select: { campo: true, valorAnterior: true, valorNovo: true },
          orderBy: { campo: 'asc' },
        },
      },
    });

    return audits.map((audit) => ({
      // Sem milissegundos, no formato do contrato (2026-11-23T14:38:00Z).
      dataHora: audit.dataHora.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      usuario: audit.usuario.nome,
      operacao: audit.operacao,
      valorAnterior: this.joinValues(audit.detalhes, 'valorAnterior'),
      valorNovo: this.joinValues(audit.detalhes, 'valorNovo'),
    }));
  }

  /**
   * Grava a anotação e os campos alterados usando a transação de quem chama,
   * para que alteração e histórico sejam confirmados ou desfeitos juntos.
   *
   * Retorna `false` sem gravar quando um UPDATE não muda nenhum campo
   * (reenvio idempotente dos mesmos valores).
   */
  async record(
    tx: Prisma.TransactionClient,
    entry: AuditEntry,
  ): Promise<boolean> {
    const changes = this.diffFields(entry.before, entry.after);
    if (changes.length === 0 && entry.operacao === 'UPDATE') {
      return false;
    }

    const audit = await tx.auditoria.create({
      data: {
        usuarioId: entry.usuarioId,
        eventoId: entry.eventoId,
        operacaoId: entry.operacaoId,
        entidade: entry.entidade,
        registroId: entry.registroId,
        operacao: entry.operacao,
        descricao: entry.descricao,
        justificativa: entry.justificativa,
        afetaResultado: entry.afetaResultado ?? true,
      },
      select: { id: true },
    });

    if (changes.length > 0) {
      await tx.auditoriaDetalhe.createMany({
        data: changes.map((change) => ({ auditoriaId: audit.id, ...change })),
      });
    }

    return true;
  }

  private diffFields(
    before: Record<string, unknown> | null | undefined,
    after: Record<string, unknown> | null | undefined,
  ): FieldChange[] {
    const fields = new Set([
      ...Object.keys(before ?? {}),
      ...Object.keys(after ?? {}),
    ]);

    const changes: FieldChange[] = [];
    for (const field of [...fields].sort()) {
      const previous = this.toText(before?.[field]);
      const next = this.toText(after?.[field]);
      // O banco recusa detalhe sem mudança (ck_auditoria_detalhe_mudanca).
      if (previous !== next) {
        changes.push({
          campo: field,
          valorAnterior: previous,
          valorNovo: next,
        });
      }
    }
    return changes;
  }

  /**
   * Junta um lado das alterações como `campo=valor; campo=valor`, omitindo
   * os campos sem valor. Retorna `null` quando nenhum campo tem valor
   * (o "antes" de um INSERT ou o "depois" de um DELETE).
   */
  private joinValues(
    details: FieldChange[],
    side: 'valorAnterior' | 'valorNovo',
  ): string | null {
    const pairs = details
      .filter((detail) => detail[side] !== null)
      .map((detail) => `${detail.campo}=${detail[side]}`);
    return pairs.length > 0 ? pairs.join('; ') : null;
  }

  private toText(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (Prisma.Decimal.isDecimal(value)) return value.toString();
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }
    return JSON.stringify(value);
  }
}
