import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { PasswordHashService } from '../src/modules/auth/password-hash.service.js';
import { DesafiosService } from '../src/modules/desafios/desafios.service.js';
import { ResultadosService } from '../src/modules/resultados/resultados.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('Persistência e concorrência de desafios (T246)', () => {
  let module: TestingModule;
  let desafios: DesafiosService;
  let resultados: ResultadosService;
  let prisma: PrismaService;
  let adminId: number;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    desafios = module.get(DesafiosService);
    resultados = module.get(ResultadosService);
    prisma = module.get(PrismaService);

    const admin = await prisma.usuario.create({
      data: {
        nome: 'Administrador T246',
        email: `t246-${randomUUID()}@example.test`,
        perfil: 'ADMIN',
        ativo: true,
        senhaHash: await module
          .get(PasswordHashService)
          .hash('senha-exclusiva-t246'),
      },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    // Cenários que chamam ResultadosService.save() gravam auditoria imutável (ADR 0004);
    // mantemos fixtures isoladas por UUID no banco exclusivo de testes.
    await module.close();
  });

  async function criarCenario() {
    const evento = await prisma.evento.create({
      data: {
        nome: `Evento T246 ${randomUUID()}`,
        ano: 2095,
        dataInicio: new Date('2095-08-10T00:00:00Z'),
        dataFim: new Date('2095-08-12T00:00:00Z'),
        quantidadeDias: 2,
        ativo: false,
      },
    });

    const dia = await prisma.diaEvento.create({
      data: {
        eventoId: evento.id,
        numeroDia: 1,
        data: new Date('2095-08-10T00:00:00Z'),
      },
    });

    const grupo1 = await prisma.grupo.create({
      data: {
        eventoId: evento.id,
        nome: `Grupo 1 ${randomUUID().slice(0, 6)}`,
        cor: '#114477',
      },
    });
    const grupo2 = await prisma.grupo.create({
      data: {
        eventoId: evento.id,
        nome: `Grupo 2 ${randomUUID().slice(0, 6)}`,
        cor: '#225588',
      },
    });

    const desafio = await desafios.create(evento.id, {
      nome: `Desafio ${randomUUID().slice(0, 8)}`,
      diaId: dia.id,
      pontosColocacao: [
        { colocacao: 1, pontos: 100 },
        { colocacao: 2, pontos: 80 },
      ],
    });

    return { evento, desafio, grupos: [grupo1, grupo2] };
  }

  it('bloqueia alteração da tabela quando transação concorrente lança resultado após adquirir o lock do desafio', async () => {
    const { evento, desafio, grupos } = await criarCenario();
    const locked = createDeferred();

    const txLancamento = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id_desafio
        FROM desafio
        WHERE id_desafio = ${desafio.id}::int
          AND id_evento = ${evento.id}::int
        FOR UPDATE
      `;
      locked.resolve();

      // Mantém o lock tempo suficiente para o update concorrente tentar iniciar e aguardar.
      await new Promise((resolve) => setTimeout(resolve, 100));

      await tx.resultadoDesafio.createMany({
        data: [
          {
            eventoId: evento.id,
            desafioId: desafio.id,
            grupoId: grupos[0].id,
            colocacao: 1,
            ausente: false,
          },
          {
            eventoId: evento.id,
            desafioId: desafio.id,
            grupoId: grupos[1].id,
            colocacao: 2,
            ausente: false,
          },
        ],
      });
    });

    await locked.promise;
    const tentativaUpdate = desafios.update(evento.id, desafio.id, {
      pontosColocacao: [
        { colocacao: 1, pontos: 200 },
        { colocacao: 2, pontos: 80 },
      ],
    });

    const [, resultadoUpdate] = await Promise.allSettled([
      txLancamento,
      tentativaUpdate,
    ]);

    expect(resultadoUpdate.status).toBe('rejected');
    if (resultadoUpdate.status === 'rejected') {
      expect(resultadoUpdate.reason).toBeInstanceOf(ConflictException);
    }

    const persistido = await desafios.findById(evento.id, desafio.id);
    expect(persistido.pontosColocacao).toEqual([
      { colocacao: 1, pontos: 100 },
      { colocacao: 2, pontos: 80 },
    ]);
  });

  it('coordena ResultadosService.save() aguardando alteração da tabela em transação concorrente', async () => {
    const { evento, desafio, grupos } = await criarCenario();
    const locked = createDeferred();

    const txAlteracao = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id_desafio
        FROM desafio
        WHERE id_desafio = ${desafio.id}::int
          AND id_evento = ${evento.id}::int
        FOR UPDATE
      `;
      locked.resolve();

      await new Promise((resolve) => setTimeout(resolve, 100));

      await tx.pontosColocacao.update({
        where: {
          desafioId_colocacao: { desafioId: desafio.id, colocacao: 1 },
        },
        data: { pontos: 200 },
      });
    });

    await locked.promise;
    const salvamento = resultados.save(adminId, evento.id, desafio.id, [
      { grupoId: grupos[0].id, colocacao: 1, ausente: false },
      { grupoId: grupos[1].id, colocacao: 2, ausente: false },
    ]);

    const [, resultadoSalvo] = await Promise.all([txAlteracao, salvamento]);
    expect(resultadoSalvo.find((r) => r.grupoId === grupos[0].id)?.pontos).toBe(
      200,
    );
  });

  it('mantém invariante entre DesafiosService.update() e ResultadosService.save() em execução simultânea', async () => {
    const { evento, desafio, grupos } = await criarCenario();

    const [resUpdate, resSave] = await Promise.allSettled([
      desafios.update(evento.id, desafio.id, {
        pontosColocacao: [
          { colocacao: 1, pontos: 200 },
          { colocacao: 2, pontos: 80 },
        ],
      }),
      resultados.save(adminId, evento.id, desafio.id, [
        { grupoId: grupos[0].id, colocacao: 1, ausente: false },
        { grupoId: grupos[1].id, colocacao: 2, ausente: false },
      ]),
    ]);

    expect(resSave.status).toBe('fulfilled');
    if (resSave.status !== 'fulfilled') return;

    const pontosPrimeiroSalvo = resSave.value.find(
      (r) => r.colocacao === 1,
    )?.pontos;
    const tabelaAtual = await desafios.findById(evento.id, desafio.id);
    const pontosPrimeiroTabela = tabelaAtual.pontosColocacao.find(
      (p) => p.colocacao === 1,
    )?.pontos;

    expect(pontosPrimeiroSalvo).toBe(pontosPrimeiroTabela);

    if (resUpdate.status === 'rejected') {
      expect(resUpdate.reason).toBeInstanceOf(ConflictException);
      expect(pontosPrimeiroTabela).toBe(100);
    } else {
      expect(pontosPrimeiroTabela).toBe(200);
    }
  });
});
