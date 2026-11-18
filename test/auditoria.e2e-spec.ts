import { randomUUID } from 'node:crypto';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { AuditoriaService } from '../src/modules/auditoria/auditoria.service.js';
import { PasswordHashService } from '../src/modules/auth/password-hash.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * A auditoria é imutável (V8) e impede excluir o evento e o usuário ligados a
 * ela, por isso esta suíte não apaga o que cria.
 *
 * Os registroIds são derivados do evento criado na execução e ficam acima de
 * 2 bilhões, fora do alcance das sequências do banco de teste. Assim não se
 * misturam com execuções anteriores nem com o histórico real gravado por
 * outras suítes (resultados, bônus, penalidades).
 */
describe('Auditoria dos lançamentos (#255)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let audit: AuditoriaService;
  let token: string;
  let usuarioId: number;
  let eventoId: number;
  const identificador = randomUUID();
  const email = `auditoria-${identificador}@example.test`;
  const senha = 'senha-exclusiva-teste-auditoria';

  const get = (query: string) =>
    request(app.getHttpServer())
      .get(`/api/v1/auditoria?${query}`)
      .auth(token, { type: 'bearer' });

  /** Um registroId exclusivo desta execução para cada teste (slot 0 a 3). */
  const uniqueId = (slot: number) => 2_000_000_000 + eventoId * 4 + slot;

  const entry = (registroId: number) => ({
    usuarioId,
    eventoId,
    operacaoId: randomUUID(),
    entidade: 'RESULTADO_DESAFIO' as const,
    registroId,
  });

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
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    audit = app.get(AuditoriaService);

    const usuario = await prisma.usuario.create({
      data: {
        nome: 'Administrador de teste auditoria',
        email,
        senhaHash: await app.get(PasswordHashService).hash(senha),
        perfil: 'ADMIN',
        ativo: true,
      },
    });
    usuarioId = usuario.id;

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, senha })
      .expect(200);
    token = login.body.token;

    const evento = await prisma.evento.create({
      data: {
        nome: `Evento auditoria ${identificador}`,
        ano: 2097,
        dataInicio: new Date('2097-05-10T00:00:00.000Z'),
        dataFim: new Date('2097-05-12T00:00:00.000Z'),
        quantidadeDias: 3,
      },
    });
    eventoId = evento.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('protege GET /auditoria', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auditoria?entidade=RESULTADO_DESAFIO&registroId=1')
      .expect(401, {
        statusCode: 401,
        message: 'Token ausente ou inválido',
        error: 'Unauthorized',
      });
  });

  it('rejeita entidade fora da lista e registroId inválido', async () => {
    await get('entidade=GRUPO&registroId=1').expect(400);
    await get('entidade=RESULTADO_DESAFIO&registroId=0').expect(400);
  });

  it('devolve lista vazia para registro sem histórico', async () => {
    await get(`entidade=PENALIDADE&registroId=${uniqueId(0)}`).expect(200, []);
  });

  it('grava lançamento e correção e devolve o histórico no formato do front', async () => {
    const registroId = uniqueId(1);

    await prisma.$transaction((tx) =>
      audit.record(tx, {
        ...entry(registroId),
        operacao: 'INSERT',
        after: { colocacao: 2, ausente: false },
      }),
    );
    const reenvio = await prisma.$transaction((tx) =>
      audit.record(tx, {
        ...entry(registroId),
        operacao: 'UPDATE',
        before: { colocacao: 2, ausente: false },
        after: { colocacao: 2, ausente: false },
      }),
    );
    await prisma.$transaction((tx) =>
      audit.record(tx, {
        ...entry(registroId),
        operacao: 'UPDATE',
        before: { colocacao: 2, ausente: false },
        after: { colocacao: 1, ausente: false },
      }),
    );

    expect(reenvio).toBe(false);
    const response = await get(
      `entidade=RESULTADO_DESAFIO&registroId=${registroId}`,
    ).expect(200);
    expect(response.body).toEqual([
      {
        dataHora: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
        ),
        usuario: 'Administrador de teste auditoria',
        operacao: 'INSERT',
        valorAnterior: null,
        valorNovo: 'ausente=false; colocacao=2',
      },
      {
        dataHora: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
        ),
        usuario: 'Administrador de teste auditoria',
        operacao: 'UPDATE',
        valorAnterior: 'colocacao=2',
        valorNovo: 'colocacao=1',
      },
    ]);
  });

  it('desfaz a anotação quando a transação falha', async () => {
    const registroId = uniqueId(2);

    await expect(
      prisma.$transaction(async (tx) => {
        await audit.record(tx, {
          ...entry(registroId),
          operacao: 'INSERT',
          after: { colocacao: 3 },
        });
        throw new Error('falha simulada depois da auditoria');
      }),
    ).rejects.toThrow('falha simulada');

    await get(`entidade=RESULTADO_DESAFIO&registroId=${registroId}`).expect(
      200,
      [],
    );
  });

  it('impede alterar ou apagar o histórico e excluir o evento auditado', async () => {
    const registroId = uniqueId(3);
    await prisma.$transaction(async (tx) => {
      await audit.record(tx, {
        ...entry(registroId),
        operacao: 'INSERT',
        after: { colocacao: 1 },
      });
      await audit.record(tx, {
        ...entry(registroId),
        entidade: 'APURACAO',
        operacao: 'RECALCULO',
      });
    });
    const comDetalhe = await prisma.auditoria.findFirstOrThrow({
      where: { entidade: 'RESULTADO_DESAFIO', registroId },
      select: { id: true },
    });
    const semDetalhe = await prisma.auditoria.findFirstOrThrow({
      where: { entidade: 'APURACAO', registroId },
      select: { id: true },
    });

    // Cada tentativa só pode ser recusada pelo trigger da V8. A exclusão usa a
    // anotação sem detalhes, porque a FK dos detalhes também a impediria.
    await expect(
      prisma.auditoria.update({
        where: { id: comDetalhe.id },
        data: { descricao: 'adulterado' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.auditoriaDetalhe.deleteMany({
        where: { auditoriaId: comDetalhe.id },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.auditoria.delete({ where: { id: semDetalhe.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.evento.delete({ where: { id: eventoId } }),
    ).rejects.toThrow();
  });
});
