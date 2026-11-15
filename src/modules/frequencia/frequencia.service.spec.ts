import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { FrequenciaService } from './frequencia.service.js';

describe('FrequenciaService', () => {
  const prisma = {
    evento: { findUnique: vi.fn() },
    diaEvento: { findFirst: vi.fn() },
    participante: { findFirst: vi.fn(), findMany: vi.fn() },
    presenca: { upsert: vi.fn() },
  };
  let service: FrequenciaService;

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.evento.findUnique.mockResolvedValue({ id: 7 });
    prisma.diaEvento.findFirst.mockResolvedValue({ id: 21, eventoId: 7 });
    prisma.participante.findFirst.mockResolvedValue({ id: 11, eventoId: 7 });
    prisma.participante.findMany.mockResolvedValue([
      {
        id: 11,
        matricula: 'A1',
        nome: 'Ana',
        turma: 'T1',
        grupo: { id: 3, nome: 'Alfa' },
        presencas: [{ presente: true }],
      },
      {
        id: 12,
        matricula: 'B1',
        nome: 'Bia',
        turma: 'T1',
        grupo: { id: 4, nome: 'Beta' },
        presencas: [],
      },
    ]);
    service = new FrequenciaService(prisma as unknown as PrismaService);
  });

  it('lista participantes, converte ausência sem registro e resume a grade', async () => {
    await expect(service.listar(7, 21, {})).resolves.toEqual({
      dados: [
        {
          participanteId: 11,
          matricula: 'A1',
          nome: 'Ana',
          turma: 'T1',
          grupoId: 3,
          grupo: 'Alfa',
          presente: true,
        },
        {
          participanteId: 12,
          matricula: 'B1',
          nome: 'Bia',
          turma: 'T1',
          grupoId: 4,
          grupo: 'Beta',
          presente: false,
        },
      ],
      resumo: { total: 2, presentes: 1, ausentes: 1 },
    });
  });

  it('repassa filtros de grupo e busca ao repositório', async () => {
    await service.listar(7, 21, { grupoId: 3, busca: 'ana' });
    expect(prisma.participante.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventoId: 7,
          grupoId: 3,
          OR: expect.any(Array),
        }),
      }),
    );
  });

  it('usa upsert para registrar e repetir a marcação sem duplicar', async () => {
    prisma.presenca.upsert.mockResolvedValue({
      participanteId: 11,
      presente: true,
    });
    await expect(
      service.registrar(7, 21, 11, { presente: true }),
    ).resolves.toEqual({ participanteId: 11, presente: true });
    expect(prisma.presenca.upsert).toHaveBeenCalledWith({
      where: { diaId_participanteId: { diaId: 21, participanteId: 11 } },
      create: { eventoId: 7, diaId: 21, participanteId: 11, presente: true },
      update: { presente: true },
    });
  });

  it('rejeita evento, dia e participante inexistentes ou de outro evento', async () => {
    prisma.evento.findUnique.mockResolvedValueOnce(null);
    await expect(service.listar(99, 21, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.evento.findUnique.mockResolvedValue({ id: 7 });
    prisma.diaEvento.findFirst.mockResolvedValue(null);
    await expect(service.listar(7, 99, {})).rejects.toThrow(
      'Dia não encontrado neste evento',
    );
    prisma.diaEvento.findFirst.mockResolvedValue({ id: 21, eventoId: 7 });
    prisma.participante.findFirst.mockResolvedValue(null);
    await expect(
      service.registrar(7, 21, 99, { presente: true }),
    ).rejects.toThrow('Participante não encontrado neste evento');
  });
});
