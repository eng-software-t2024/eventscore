import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';

export const LIMITE_INATIVIDADE_MS = 15 * 60 * 1000;
const RETENCAO_MS = 30 * 24 * 60 * 60 * 1000;

export type EventoTelemetria = {
  usuarioId?: number;
  source: 'API' | 'FRONTEND' | 'AUTH' | 'SYSTEM';
  eventType: string;
  outcome: 'SUCCESS' | 'FAILURE' | 'INFO';
  method?: string;
  route?: string;
  status?: number;
  durationMs?: number;
  correlationId?: string;
  ip?: string;
  userAgent?: string;
  details?: Record<string, string | number | boolean | null>;
};

@Injectable()
export class SecurityTelemetryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SecurityTelemetryService.name);
  private sweepTimer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.sweepTimer = setInterval(() => {
      void this.sweep().catch(() =>
        this.logger.error('Falha na manutenção de sessões/telemetria'),
      );
    }, 60_000);
    this.sweepTimer.unref();
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  async criarSessao(input: {
    id: string;
    usuarioId: number;
    expiresAt: Date;
    ip?: string;
    userAgent?: string;
  }) {
    await this.prisma.authSession.create({
      data: {
        id: input.id,
        usuarioId: input.usuarioId,
        expiresAt: input.expiresAt,
        ip: input.ip || null,
        userAgent: input.userAgent?.slice(0, 512) || null,
      },
    });
  }

  async validarEAtualizarSessao(
    id: string,
    usuarioId: number,
  ): Promise<boolean> {
    const now = new Date();
    const session = await this.prisma.authSession.findUnique({ where: { id } });
    if (!session || session.usuarioId !== usuarioId || session.endedAt)
      return false;
    const expirou = session.expiresAt <= now;
    const inativa =
      now.getTime() - session.lastActivityAt.getTime() >= LIMITE_INATIVIDADE_MS;
    if (expirou || inativa) {
      await this.encerrarSessao(id, 'EXPIRED', usuarioId);
      await this.registrarEvento({
        usuarioId,
        source: 'AUTH',
        eventType: 'SESSION_EXPIRED',
        outcome: 'INFO',
      });
      return false;
    }
    const updated = await this.prisma.authSession.updateMany({
      where: {
        id,
        usuarioId,
        endedAt: null,
        expiresAt: { gt: now },
        lastActivityAt: session.lastActivityAt,
      },
      data: { lastActivityAt: now },
    });
    if (updated.count === 1) return true;
    const current = await this.prisma.authSession.findUnique({ where: { id } });
    return Boolean(
      current &&
      !current.endedAt &&
      current.expiresAt > now &&
      now.getTime() - current.lastActivityAt.getTime() < LIMITE_INATIVIDADE_MS,
    );
  }

  async encerrarSessao(
    id: string,
    motivo: 'LOGOUT' | 'EXPIRED' | 'REVOKED',
    usuarioId?: number,
  ) {
    const now = new Date();
    return this.prisma.authSession.updateMany({
      where: { id, endedAt: null, ...(usuarioId ? { usuarioId } : {}) },
      data: {
        endedAt: now,
        endReason: motivo,
        purgeAfter: new Date(now.getTime() + RETENCAO_MS),
      },
    });
  }

  async registrarEvento(event: EventoTelemetria) {
    const period = await this.periodoAberto();
    await this.prisma.telemetryEvent.create({
      data: {
        id: randomUUID(),
        periodId: period.id,
        usuarioId: event.usuarioId ?? null,
        source: event.source,
        eventType: event.eventType.slice(0, 60),
        outcome: event.outcome,
        method: event.method?.slice(0, 10) ?? null,
        route: event.route?.slice(0, 255) ?? null,
        status: event.status ?? null,
        durationMs:
          event.durationMs === undefined ? null : Math.max(0, event.durationMs),
        correlationId: event.correlationId?.slice(0, 100) ?? null,
        ip: event.ip || null,
        userAgent: event.userAgent?.slice(0, 512) ?? null,
        details: event.details ?? {},
      },
    });
  }

  async registrarAuditoriaGestao(input: {
    actorUserId: number;
    targetUserId?: number;
    action: string;
    correlationId?: string;
    details?: Record<string, string | number | boolean | null>;
  }) {
    await this.prisma.adminAuditEvent.create({
      data: {
        id: randomUUID(),
        actorUserId: input.actorUserId,
        targetUserId: input.targetUserId ?? null,
        action: input.action.slice(0, 40),
        correlationId: input.correlationId?.slice(0, 100) ?? null,
        details: input.details ?? {},
      },
    });
  }

  async listarOuIniciarPeriodo() {
    return this.periodoAberto();
  }

  async fecharPeriodo(id: string) {
    const now = new Date();
    return this.prisma.telemetryPeriod.updateMany({
      where: { id, status: 'OPEN' },
      data: {
        status: 'CLOSED',
        endedAt: now,
        purgeAfter: new Date(now.getTime() + RETENCAO_MS),
      },
    });
  }

  async sweep() {
    const now = new Date();
    const ended = await this.prisma.authSession.updateMany({
      where: {
        endedAt: null,
        OR: [
          { expiresAt: { lte: now } },
          {
            lastActivityAt: {
              lte: new Date(now.getTime() - LIMITE_INATIVIDADE_MS),
            },
          },
        ],
      },
      data: {
        endedAt: now,
        endReason: 'EXPIRED',
        purgeAfter: new Date(now.getTime() + RETENCAO_MS),
      },
    });
    if (ended.count) {
      await this.registrarEvento({
        source: 'SYSTEM',
        eventType: 'SESSION_EXPIRED',
        outcome: 'INFO',
        details: { count: ended.count },
      });
    }
    await this.prisma.telemetryEvent.deleteMany({
      where: { period: { status: 'CLOSED', purgeAfter: { lte: now } } },
    });
    await this.prisma.authSession.deleteMany({
      where: { endedAt: { not: null }, purgeAfter: { lte: now } },
    });
    await this.prisma.telemetryPeriod.deleteMany({
      where: { status: 'CLOSED', purgeAfter: { lte: now } },
    });
  }

  private async periodoAberto() {
    const existing = await this.prisma.telemetryPeriod.findFirst({
      where: { status: 'OPEN' },
    });
    if (existing) return existing;
    try {
      return await this.prisma.telemetryPeriod.create({
        data: { id: randomUUID() },
      });
    } catch {
      const concurrent = await this.prisma.telemetryPeriod.findFirst({
        where: { status: 'OPEN' },
      });
      if (concurrent) return concurrent;
      throw new Error('Não foi possível abrir período de telemetria');
    }
  }
}
