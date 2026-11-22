import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SecurityTelemetryService } from '../security-telemetry/security-telemetry.service.js';
import type { AtualizarUsuarioDto, CriarUsuarioDto } from './management.dto.js';

const EVENTOS_DE_ATIVIDADE_REAL = new Set([
  'ROUTE_CHANGE',
  'ACTION',
  'FORM_SUBMIT',
]);
const EVENTOS_CLIENTE_PERMITIDOS = new Set([
  'ROUTE_CHANGE',
  'ACTION',
  'MODAL_OPEN',
  'MODAL_CLOSE',
  'FORM_SUBMIT',
  'JS_ERROR',
  'API_FAILURE',
  'TAB_VISIBILITY',
  'IDLE',
]);

@Injectable()
export class ManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telemetry: SecurityTelemetryService,
  ) {}

  async listarUsuarios(filtro: {
    busca?: string;
    perfil?: string;
    ativo?: boolean;
    pagina: number;
    limite: number;
  }) {
    const where: Prisma.UsuarioWhereInput = {
      ...(filtro.perfil
        ? { perfil: filtro.perfil }
        : { perfil: { in: ['ADMIN', 'MASTER'] } }),
      ...(filtro.ativo === undefined ? {} : { ativo: filtro.ativo }),
      ...(filtro.busca
        ? {
            OR: [
              { nome: { contains: filtro.busca, mode: 'insensitive' } },
              { email: { contains: filtro.busca, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.usuario.count({ where }),
      this.prisma.usuario.findMany({
        where,
        orderBy: [{ nome: 'asc' }, { id: 'asc' }],
        skip: (filtro.pagina - 1) * filtro.limite,
        take: filtro.limite,
        select: {
          id: true,
          nome: true,
          email: true,
          perfil: true,
          ativo: true,
          _count: {
            select: {
              auditorias: true,
              apuracoes: true,
              desempatesManuais: true,
              sessoes: true,
              eventosTelemetria: true,
            },
          },
        },
      }),
    ]);
    return {
      dados: rows.map(({ _count, ...user }) => ({
        ...user,
        referencias: _count,
        podeExcluir: Object.values(_count).every((n) => n === 0),
      })),
      total,
      pagina: filtro.pagina,
      limite: filtro.limite,
    };
  }

  async criarUsuario(
    input: CriarUsuarioDto,
    actor: number,
    correlationId?: string,
  ) {
    const email = input.email.trim().toLowerCase();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.usuario.create({
          data: {
            nome: input.nome.trim(),
            email,
            senhaHash: await argon2.hash(input.senha, {
              type: argon2.argon2id,
            }),
            perfil: 'ADMIN',
            ativo: true,
          },
          select: {
            id: true,
            nome: true,
            email: true,
            perfil: true,
            ativo: true,
          },
        });
        await tx.adminAuditEvent.create({
          data: {
            id: crypto.randomUUID(),
            actorUserId: actor,
            targetUserId: user.id,
            action: 'USER_CREATED',
            correlationId,
            details: { perfil: 'ADMIN' },
          },
        });
        return user;
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('Já existe usuário com este e-mail');
      throw error;
    }
  }

  async atualizarUsuario(
    id: number,
    input: AtualizarUsuarioDto,
    actor: number,
    correlationId?: string,
  ) {
    await this.exigirUsuario(id);
    if (id === actor && input.ativo === false)
      throw new ConflictException(
        'Não é possível desativar a própria conta MASTER',
      );
    const data = {
      ...(input.nome === undefined ? {} : { nome: input.nome.trim() }),
      ...(input.email === undefined
        ? {}
        : { email: input.email.trim().toLowerCase() }),
      ...(input.ativo === undefined ? {} : { ativo: input.ativo }),
    };
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const user = await tx.usuario.update({
          where: { id },
          data,
          select: {
            id: true,
            nome: true,
            email: true,
            perfil: true,
            ativo: true,
          },
        });
        const revoked =
          input.ativo === false
            ? await tx.authSession.updateMany({
                where: { usuarioId: id, endedAt: null },
                data: {
                  endedAt: new Date(),
                  endReason: 'REVOKED',
                  purgeAfter: new Date(Date.now() + 30 * 86400000),
                },
              })
            : { count: 0 };
        await tx.adminAuditEvent.create({
          data: {
            id: crypto.randomUUID(),
            actorUserId: actor,
            targetUserId: id,
            action:
              input.ativo === false
                ? 'USER_DEACTIVATED'
                : input.ativo === true
                  ? 'USER_ACTIVATED'
                  : 'USER_UPDATED',
            correlationId,
            details: {
              fields: Object.keys(data).sort(),
              revokedSessions: revoked.count,
            },
          },
        });
        return { user, revokedSessions: revoked.count };
      });
      if (result.revokedSessions > 0) {
        await this.telemetry.registrarEvento({
          usuarioId: id,
          source: 'AUTH',
          eventType: 'SESSION_REVOKED',
          outcome: 'INFO',
          details: {
            reason: 'account_deactivated',
            count: result.revokedSessions,
          },
        });
      }
      return result.user;
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('Já existe usuário com este e-mail');
      throw error;
    }
  }

  async redefinirSenha(
    id: number,
    senha: string,
    actor: number,
    correlationId?: string,
  ) {
    await this.exigirUsuario(id);
    await this.prisma.$transaction([
      this.prisma.usuario.update({
        where: { id },
        data: {
          senhaHash: await argon2.hash(senha, { type: argon2.argon2id }),
        },
      }),
      this.prisma.authSession.updateMany({
        where: { usuarioId: id, endedAt: null },
        data: {
          endedAt: new Date(),
          endReason: 'REVOKED',
          purgeAfter: new Date(Date.now() + 30 * 86400000),
        },
      }),
      this.prisma.adminAuditEvent.create({
        data: {
          id: crypto.randomUUID(),
          actorUserId: actor,
          targetUserId: id,
          action: 'PASSWORD_RESET',
          correlationId,
          details: {},
        },
      }),
    ]);
  }

  async excluirUsuario(id: number, actor: number, correlationId?: string) {
    if (id === actor)
      throw new ConflictException('Não é possível excluir a própria conta');
    return this.prisma.$transaction(
      async (tx) => {
        const refs = await this.contarReferencias(tx, id);
        if (Object.values(refs).some((count) => count > 0))
          throw new ConflictException({
            message: 'Usuário possui referências e não pode ser excluído',
            referencias: refs,
          });
        await tx.adminAuditEvent.create({
          data: {
            id: crypto.randomUUID(),
            actorUserId: actor,
            targetUserId: id,
            action: 'USER_DELETED',
            correlationId,
            details: {},
          },
        });
        return tx.usuario.delete({
          where: { id },
          select: { id: true, nome: true, email: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async listarSessoes(limite = 100, usuarioId?: number) {
    return this.prisma.authSession.findMany({
      where: usuarioId ? { usuarioId } : {},
      orderBy: { issuedAt: 'desc' },
      take: limite,
      select: {
        id: true,
        usuarioId: true,
        issuedAt: true,
        lastActivityAt: true,
        expiresAt: true,
        endedAt: true,
        endReason: true,
        ip: true,
        userAgent: true,
        usuario: { select: { nome: true, email: true } },
      },
    });
  }

  async revogarSessao(id: string, actor: number, correlationId?: string) {
    const session = await this.prisma.authSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Sessão não encontrada');
    await this.prisma.$transaction([
      this.prisma.authSession.updateMany({
        where: { id, endedAt: null },
        data: {
          endedAt: new Date(),
          endReason: 'REVOKED',
          purgeAfter: new Date(Date.now() + 30 * 86400000),
        },
      }),
      this.prisma.adminAuditEvent.create({
        data: {
          id: crypto.randomUUID(),
          actorUserId: actor,
          targetUserId: session.usuarioId,
          action: 'SESSION_REVOKED',
          correlationId,
          details: { sessionId: id },
        },
      }),
    ]);
    await this.telemetry.registrarEvento({
      usuarioId: session.usuarioId,
      source: 'AUTH',
      eventType: 'SESSION_REVOKED',
      outcome: 'INFO',
      details: { byMaster: actor },
    });
  }

  listarTelemetria(filtro: {
    limite: number;
    tipo?: string;
    usuarioId?: number;
    desde?: string;
    ate?: string;
  }) {
    return this.prisma.telemetryEvent.findMany({
      where: {
        ...(filtro.tipo ? { eventType: filtro.tipo } : {}),
        ...(filtro.usuarioId ? { usuarioId: filtro.usuarioId } : {}),
        ...(filtro.desde || filtro.ate
          ? {
              occurredAt: {
                ...(filtro.desde ? { gte: new Date(filtro.desde) } : {}),
                ...(filtro.ate ? { lte: new Date(filtro.ate) } : {}),
              },
            }
          : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: filtro.limite,
      select: {
        id: true,
        usuarioId: true,
        occurredAt: true,
        source: true,
        eventType: true,
        method: true,
        route: true,
        status: true,
        durationMs: true,
        outcome: true,
        correlationId: true,
        ip: true,
        userAgent: true,
        details: true,
        usuario: { select: { nome: true, email: true } },
      },
    });
  }

  async linhaDoTempo(usuarioId: number, limite = 100) {
    const [telemetry, audit] = await Promise.all([
      this.prisma.telemetryEvent.findMany({
        where: { usuarioId },
        orderBy: { occurredAt: 'desc' },
        take: limite,
        select: {
          occurredAt: true,
          eventType: true,
          source: true,
          outcome: true,
          route: true,
          status: true,
          details: true,
        },
      }),
      this.prisma.adminAuditEvent.findMany({
        where: {
          OR: [{ actorUserId: usuarioId }, { targetUserId: usuarioId }],
        },
        orderBy: { occurredAt: 'desc' },
        take: limite,
        select: {
          occurredAt: true,
          action: true,
          actorUserId: true,
          details: true,
        },
      }),
    ]);
    return [
      ...telemetry.map((e) => ({ ...e, categoria: 'TELEMETRIA' })),
      ...audit.map((e) => ({ ...e, categoria: 'AUDITORIA_GESTAO' })),
    ]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, limite);
  }

  listarAuditoria(limite = 100) {
    return this.prisma.adminAuditEvent.findMany({
      orderBy: { occurredAt: 'desc' },
      take: limite,
      select: {
        id: true,
        actorUserId: true,
        targetUserId: true,
        action: true,
        occurredAt: true,
        correlationId: true,
        details: true,
        actor: { select: { nome: true, email: true } },
      },
    });
  }

  async periodo() {
    let period = await this.prisma.telemetryPeriod.findFirst({
      where: { status: 'OPEN' },
      orderBy: { startedAt: 'desc' },
    });
    if (!period)
      period = await this.prisma.telemetryPeriod.create({
        data: { id: crypto.randomUUID() },
      });
    return period;
  }

  async encerrarPeriodo(actor: number, correlationId?: string) {
    return this.prisma.$transaction(async (tx) => {
      let period = await tx.telemetryPeriod.findFirst({
        where: { status: 'OPEN' },
        orderBy: { startedAt: 'desc' },
      });
      if (!period) {
        period = await tx.telemetryPeriod.create({
          data: { id: crypto.randomUUID() },
        });
      }
      const now = new Date();
      const purgeAfter = new Date(now.getTime() + 30 * 86400000);
      const closed = await tx.telemetryPeriod.updateMany({
        where: { id: period.id, status: 'OPEN' },
        data: { status: 'CLOSED', endedAt: now, purgeAfter },
      });
      if (closed.count !== 1)
        throw new ConflictException('Período de telemetria não está aberto');
      await tx.adminAuditEvent.create({
        data: {
          id: crypto.randomUUID(),
          actorUserId: actor,
          action: 'TELEMETRY_PERIOD_CLOSED',
          correlationId,
          details: { periodId: period.id, updated: closed.count },
        },
      });
      return { id: period.id, encerrado: closed.count === 1, purgeAfter };
    });
  }

  async registrarEventoFrontend(
    userId: number,
    event: {
      eventType: string;
      rota?: string;
      acao?: string;
      visivel?: boolean;
    },
    sessionId: string,
    requestMeta: { ip?: string; userAgent?: string; correlationId?: string },
  ) {
    if (!EVENTOS_CLIENTE_PERMITIDOS.has(event.eventType))
      throw new ConflictException('Evento de telemetria inválido');
    if (
      EVENTOS_DE_ATIVIDADE_REAL.has(event.eventType) &&
      !(await this.telemetry.validarEAtualizarSessao(sessionId, userId))
    )
      throw new UnauthorizedException('Sessão expirada ou revogada');
    const details = {
      ...(event.rota ? { route: normalizeClientRoute(event.rota) } : {}),
      ...(event.acao
        ? { action: event.acao.replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 80) }
        : {}),
      ...(event.visivel === undefined ? {} : { visible: event.visivel }),
    };
    await this.telemetry.registrarEvento({
      usuarioId: userId,
      source: 'FRONTEND',
      eventType: event.eventType,
      outcome:
        event.eventType === 'JS_ERROR' || event.eventType === 'API_FAILURE'
          ? 'FAILURE'
          : 'INFO',
      ...requestMeta,
      details,
    });
  }

  private async exigirUsuario(id: number) {
    if (
      !(await this.prisma.usuario.findUnique({
        where: { id },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Usuário não encontrado');
  }

  private async contarReferencias(tx: Prisma.TransactionClient, id: number) {
    const [
      auditoria,
      apuracoes,
      desempatesManuais,
      sessoes,
      eventosTelemetria,
      auditoriaGestaoComoAtor,
    ] = await Promise.all([
      tx.auditoria.count({ where: { usuarioId: id } }),
      tx.apuracao.count({ where: { usuarioId: id } }),
      tx.desempateManual.count({ where: { usuarioId: id } }),
      tx.authSession.count({ where: { usuarioId: id } }),
      tx.telemetryEvent.count({ where: { usuarioId: id } }),
      tx.adminAuditEvent.count({ where: { actorUserId: id } }),
    ]);
    return {
      auditoria,
      apuracoes,
      desempatesManuais,
      sessoes,
      eventosTelemetria,
      auditoriaGestaoComoAtor,
    };
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function normalizeClientRoute(route: string) {
  return route
    .split('?')[0]
    .replace(/\b\d+\b/g, ':id')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':uuid')
    .slice(0, 255);
}
