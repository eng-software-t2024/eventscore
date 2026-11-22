import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { limparUsuariosAuthTeste } from './helpers/limpar-usuarios-auth-teste.js';

describe('Gestão MASTER, sessões e telemetria (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let masterId: number;
  let adminId: number;
  let masterToken: string;
  let adminToken: string;
  const ids: number[] = [];
  const prefix = `isolado-${randomUUID()}`;
  const senha = 'senha-isolada-master-2026';
  const senhaAdmin = 'senha-isolada-admin-2026';

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    const [master, admin] = await Promise.all([
      prisma.usuario.create({
        data: {
          nome: 'Master Isolado',
          email: `${prefix}-master@example.test`,
          senhaHash: await argon2.hash(senha),
          perfil: 'MASTER',
        },
      }),
      prisma.usuario.create({
        data: {
          nome: 'Admin Isolado',
          email: `${prefix}-admin@example.test`,
          senhaHash: await argon2.hash(senhaAdmin),
          perfil: 'ADMIN',
        },
      }),
    ]);
    ids.push(master.id, admin.id);
    masterId = master.id;
    adminId = admin.id;
    const [masterLogin, adminLogin] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: master.email, senha }),
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: admin.email, senha: senhaAdmin }),
    ]);
    expect(masterLogin.status).toBe(200);
    expect(masterLogin.body.usuario.perfil).toBe('MASTER');
    expect(adminLogin.status).toBe(200);
    masterToken = masterLogin.body.token;
    adminToken = adminLogin.body.token;
  });

  afterAll(async () => {
    if (prisma && ids.length) await limparUsuariosAuthTeste(prisma, ids);
    await app?.close();
  });

  it('autentica MASTER e ADMIN, mas retorna 403 ao ADMIN nas rotas de gestão', async () => {
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${masterToken}`)
      .expect(200);
    expect(me.body.perfil).toBe('MASTER');
    await request(app.getHttpServer())
      .get('/api/v1/management/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/management/users')
      .set('Authorization', `Bearer ${masterToken}`)
      .expect(200);
  });

  it('registra login e chamadas de API sem salvar credencial nem corpo', async () => {
    const marker = `secret-body-${randomUUID()}`;
    await request(app.getHttpServer())
      .post('/api/v1/telemetry/client')
      .set('Authorization', `Bearer ${masterToken}`)
      .send({
        eventType: 'FORM_SUBMIT',
        rota: '/gestao',
        acao: 'master.create_user.submit',
        senha: marker,
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/telemetry/client')
      .set('Authorization', `Bearer ${masterToken}`)
      .send({
        eventType: 'FORM_SUBMIT',
        rota: '/gestao/21',
        acao: 'master.create_user.submit',
      })
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${masterToken}`)
      .expect(200);

    const rows = await prisma.telemetryEvent.findMany({
      where: { usuarioId: masterId },
    });
    expect(rows.some((row) => row.eventType === 'LOGIN_SUCCEEDED')).toBe(true);
    expect(
      rows.some(
        (row) =>
          row.eventType === 'API_REQUEST' && row.route?.includes('/auth/me'),
      ),
    ).toBe(true);
    expect(
      rows.some(
        (row) =>
          row.eventType === 'FORM_SUBMIT' &&
          (row.details as { action?: unknown } | null)?.action ===
            'master.create_user.submit',
      ),
    ).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(marker);
    expect(JSON.stringify(rows)).not.toContain(senha);
    expect(JSON.stringify(rows)).not.toContain(adminToken);
  });

  it('não renova a sessão com telemetria automática, mas renova com atividade real', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `${prefix}-master@example.test`, senha })
      .expect(200);
    const claims = JSON.parse(
      Buffer.from(login.body.token.split('.')[1], 'base64url').toString(),
    ) as { jti: string };
    const lastActivityAt = new Date(Date.now() - 60_000);
    await prisma.authSession.update({
      where: { id: claims.jti },
      data: { lastActivityAt },
    });

    await request(app.getHttpServer())
      .post('/api/v1/telemetry/client')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ eventType: 'TAB_VISIBILITY', visivel: true })
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/v1/telemetry/client')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ eventType: 'IDLE' })
      .expect(204);
    const afterAutomaticEvent = await prisma.authSession.findUniqueOrThrow({
      where: { id: claims.jti },
    });
    expect(afterAutomaticEvent.lastActivityAt.getTime()).toBe(
      lastActivityAt.getTime(),
    );

    await request(app.getHttpServer())
      .post('/api/v1/telemetry/client')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ eventType: 'ACTION', acao: 'navigation.real_click' })
      .expect(204);
    const afterRealActivity = await prisma.authSession.findUniqueOrThrow({
      where: { id: claims.jti },
    });
    expect(afterRealActivity.lastActivityAt.getTime()).toBeGreaterThan(
      lastActivityAt.getTime(),
    );
  });

  it('cria, edita, redefine senha e desativa ADMIN com auditoria de negócio', async () => {
    const targetEmail = `${prefix}-criado@example.test`;
    const created = await request(app.getHttpServer())
      .post('/api/v1/management/users')
      .set('Authorization', `Bearer ${masterToken}`)
      .send({
        nome: 'Conta Criada',
        email: targetEmail,
        senha: 'senha-temporaria-validada',
      })
      .expect(201);
    const id = created.body.id as number;
    ids.push(id);
    expect(created.body).toMatchObject({
      nome: 'Conta Criada',
      email: targetEmail,
      perfil: 'ADMIN',
      ativo: true,
    });
    const persisted = await prisma.usuario.findUniqueOrThrow({ where: { id } });
    expect(
      await argon2.verify(persisted.senhaHash, 'senha-temporaria-validada'),
    ).toBe(true);

    await request(app.getHttpServer())
      .patch(`/api/v1/management/users/${id}`)
      .set('Authorization', `Bearer ${masterToken}`)
      .send({ nome: 'Conta Alterada', ativo: false })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/management/users/${id}/password`)
      .set('Authorization', `Bearer ${masterToken}`)
      .send({ senha: 'senha-nova-validada-2026' })
      .expect(201);
    const updated = await prisma.usuario.findUniqueOrThrow({ where: { id } });
    expect(updated).toMatchObject({
      nome: 'Conta Alterada',
      perfil: 'ADMIN',
      ativo: false,
    });
    expect(
      await argon2.verify(updated.senhaHash, 'senha-nova-validada-2026'),
    ).toBe(true);
    expect(
      await prisma.adminAuditEvent.count({
        where: { actorUserId: masterId, targetUserId: id },
      }),
    ).toBe(3);
  });

  it('lista e revoga sessões, e nega o token revogado no request seguinte', async () => {
    const sessions = await request(app.getHttpServer())
      .get('/api/v1/management/sessions')
      .set('Authorization', `Bearer ${masterToken}`)
      .expect(200);
    const adminSession = sessions.body.find(
      (session: { usuarioId: number }) => session.usuarioId === adminId,
    );
    expect(adminSession).toBeDefined();
    await request(app.getHttpServer())
      .post(`/api/v1/management/sessions/${adminSession.id}/revoke`)
      .set('Authorization', `Bearer ${masterToken}`)
      .send({})
      .expect(201);
    const stored = await prisma.authSession.findUniqueOrThrow({
      where: { id: adminSession.id },
    });
    expect(stored.endReason).toBe('REVOKED');
    expect(stored.purgeAfter!.getTime()).toBeGreaterThan(
      Date.now() + 29 * 86400000,
    );
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(401);
  });

  it('expira sessão após 15 minutos sem atividade e mantém trilha por 30 dias', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `${prefix}-admin@example.test`, senha: senhaAdmin })
      .expect(200);
    const claims = JSON.parse(
      Buffer.from(login.body.token.split('.')[1], 'base64url').toString(),
    ) as { jti: string };
    await prisma.authSession.update({
      where: { id: claims.jti },
      data: { lastActivityAt: new Date(Date.now() - 16 * 60 * 1000) },
    });
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(401);
    const session = await prisma.authSession.findUniqueOrThrow({
      where: { id: claims.jti },
    });
    expect(session.endReason).toBe('EXPIRED');
    expect(session.purgeAfter!.getTime()).toBeGreaterThan(
      Date.now() + 29 * 86400000,
    );
  });

  it('exporta apenas o tipo filtrado e todos os tipos quando não há filtro', async () => {
    let period = await prisma.telemetryPeriod.findFirst({
      where: { status: 'OPEN' },
    });
    if (!period)
      period = await prisma.telemetryPeriod.create({
        data: { id: randomUUID() },
      });
    const tipoCorrespondente = `CSV_MATCH_${randomUUID().slice(0, 8)}`;
    const tipoAlheio = `CSV_OTHER_${randomUUID().slice(0, 8)}`;
    await prisma.telemetryEvent.createMany({
      data: [tipoCorrespondente, tipoAlheio].map((eventType) => ({
        id: randomUUID(),
        periodId: period!.id,
        usuarioId: masterId,
        source: 'SYSTEM',
        eventType,
        outcome: 'INFO',
      })),
    });

    const filtrado = await request(app.getHttpServer())
      .get(
        `/api/v1/management/telemetry/export.csv?limite=100&tipo=${tipoCorrespondente}`,
      )
      .set('Authorization', `Bearer ${masterToken}`)
      .expect(200);
    expect(filtrado.text).toContain(`"${tipoCorrespondente}"`);
    expect(filtrado.text).not.toContain(`"${tipoAlheio}"`);

    const semFiltro = await request(app.getHttpServer())
      .get('/api/v1/management/telemetry/export.csv?limite=100')
      .set('Authorization', `Bearer ${masterToken}`)
      .expect(200);
    expect(semFiltro.text).toContain(`"${tipoCorrespondente}"`);
    expect(semFiltro.text).toContain(`"${tipoAlheio}"`);
  });

  it('fecha período e grava a auditoria na mesma transação', async () => {
    const correlationId = randomUUID();
    const response = await request(app.getHttpServer())
      .post('/api/v1/management/telemetry/period/close')
      .set('Authorization', `Bearer ${masterToken}`)
      .set('x-correlation-id', correlationId)
      .send({})
      .expect(201);
    expect(response.body.encerrado).toBe(true);
    expect(new Date(response.body.purgeAfter).getTime()).toBeGreaterThan(
      Date.now() + 29 * 86400000,
    );
    const period = await prisma.telemetryPeriod.findUniqueOrThrow({
      where: { id: response.body.id },
    });
    expect(period.status).toBe('CLOSED');
    const audit = await prisma.adminAuditEvent.findFirstOrThrow({
      where: {
        action: 'TELEMETRY_PERIOD_CLOSED',
        actorUserId: masterId,
        correlationId,
      },
    });
    expect(audit.details).toMatchObject({ periodId: period.id, updated: 1 });
    const csv = await request(app.getHttpServer())
      .get('/api/v1/management/telemetry/export.csv')
      .set('Authorization', `Bearer ${masterToken}`)
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('horario_utc');
  });

  it('não grava auditoria quando o fechamento falha e preserva o período aberto', async () => {
    let period = await prisma.telemetryPeriod.findFirst({
      where: { status: 'OPEN' },
    });
    if (!period)
      period = await prisma.telemetryPeriod.create({
        data: { id: randomUUID() },
      });
    const correlationId = randomUUID();
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION e2e_fail_telemetry_period_close() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.status = 'CLOSED' THEN RAISE EXCEPTION 'forced e2e close failure'; END IF;
        RETURN NEW;
      END; $$;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER e2e_fail_telemetry_period_close
      BEFORE UPDATE ON telemetry_period
      FOR EACH ROW EXECUTE FUNCTION e2e_fail_telemetry_period_close();
    `);
    try {
      await request(app.getHttpServer())
        .post('/api/v1/management/telemetry/period/close')
        .set('Authorization', `Bearer ${masterToken}`)
        .set('x-correlation-id', correlationId)
        .send({})
        .expect(500);
      const unchanged = await prisma.telemetryPeriod.findUniqueOrThrow({
        where: { id: period.id },
      });
      expect(unchanged.status).toBe('OPEN');
      expect(
        await prisma.adminAuditEvent.count({
          where: { action: 'TELEMETRY_PERIOD_CLOSED', correlationId },
        }),
      ).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER e2e_fail_telemetry_period_close ON telemetry_period',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION e2e_fail_telemetry_period_close()',
      );
    }
  });

  it('reverte o fechamento se a auditoria falha', async () => {
    let period = await prisma.telemetryPeriod.findFirst({
      where: { status: 'OPEN' },
    });
    if (!period)
      period = await prisma.telemetryPeriod.create({
        data: { id: randomUUID() },
      });
    const correlationId = randomUUID();
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION e2e_fail_telemetry_close_audit() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.action = 'TELEMETRY_PERIOD_CLOSED' THEN RAISE EXCEPTION 'forced e2e audit failure'; END IF;
        RETURN NEW;
      END; $$;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER e2e_fail_telemetry_close_audit
      BEFORE INSERT ON admin_audit_event
      FOR EACH ROW EXECUTE FUNCTION e2e_fail_telemetry_close_audit();
    `);
    try {
      await request(app.getHttpServer())
        .post('/api/v1/management/telemetry/period/close')
        .set('Authorization', `Bearer ${masterToken}`)
        .set('x-correlation-id', correlationId)
        .send({})
        .expect(500);
      const unchanged = await prisma.telemetryPeriod.findUniqueOrThrow({
        where: { id: period.id },
      });
      expect(unchanged.status).toBe('OPEN');
      expect(
        await prisma.adminAuditEvent.count({
          where: { action: 'TELEMETRY_PERIOD_CLOSED', correlationId },
        }),
      ).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER e2e_fail_telemetry_close_audit ON admin_audit_event',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION e2e_fail_telemetry_close_audit()',
      );
    }
  });

  it('exclui usuário sem referências e preserva o registro de auditoria da ação', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/management/users')
      .set('Authorization', `Bearer ${masterToken}`)
      .send({
        nome: 'Descartável sem referências',
        email: `${prefix}-descartavel@example.test`,
        senha: 'senha-temporaria-validada',
      })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/v1/management/users/${created.body.id}`)
      .set('Authorization', `Bearer ${masterToken}`)
      .expect(200);
    expect(
      await prisma.usuario.findUnique({ where: { id: created.body.id } }),
    ).toBeNull();
    expect(
      await prisma.adminAuditEvent.count({
        where: { targetUserId: created.body.id, action: 'USER_DELETED' },
      }),
    ).toBe(1);
  });

  it('não permite ao MASTER desativar a própria conta', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/management/users/${masterId}`)
      .set('Authorization', `Bearer ${masterToken}`)
      .send({ ativo: false })
      .expect(409);
    expect(
      (await prisma.usuario.findUniqueOrThrow({ where: { id: masterId } }))
        .ativo,
    ).toBe(true);
  });
});
