import { ConflictException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { FormatoRelatorio } from '../enums/formato-relatorio.enum.js';
import { RelatorioParcialService } from '../parcial/relatorio-parcial.service.js';
import { PdfTabelaExporter } from '../exporters/pdf-tabela.exporter.js';
import { XlsxPlanilhaExporter } from '../exporters/xlsx-planilha.exporter.js';
import type { TabelaRelatorioConfig } from '../exporters/relatorio-export.types.js';
import { EventosService } from '../../eventos/eventos.service.js';
import { RelatorioFinalService } from './relatorio-final.service.js';

describe('RelatorioFinalService', () => {
  const prisma = {
    diaEvento: { findMany: vi.fn() },
    participante: { findMany: vi.fn() },
    conversaoPontoExtra: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  };
  const eventos = { buscarPorId: vi.fn() };
  const parcial = { calcularClassificacaoParcial: vi.fn() };
  const pdf = { gerarBuffer: vi.fn() };
  const xlsx = { gerarBuffer: vi.fn() };
  let service: RelatorioFinalService;

  beforeEach(() => {
    vi.resetAllMocks();
    eventos.buscarPorId.mockResolvedValue({
      id: 1,
      nome: 'Arena',
      temResultado: true,
    });
    parcial.calcularClassificacaoParcial.mockResolvedValue({
      dados: [
        { grupoId: 10, posicao: 1 },
        { grupoId: 20, posicao: 2 },
      ],
      resumo: { empatesPendentes: [], desafiosLancados: 2, desafiosTotais: 2 },
    });
    prisma.diaEvento.findMany.mockResolvedValue([
      { id: 100, numeroDia: 1 },
      { id: 200, numeroDia: 2 },
    ]);
    prisma.participante.findMany.mockResolvedValue([
      {
        id: 2,
        matricula: 'B',
        nome: 'Bruna',
        turma: 'B',
        grupoId: 20,
        grupo: { nome: 'Beta' },
        presencas: [{ diaId: 100, presente: true }],
      },
      {
        id: 1,
        matricula: 'A',
        nome: 'Ana',
        turma: 'A',
        grupoId: 10,
        grupo: { nome: 'Alfa' },
        presencas: [{ diaId: 200, presente: true }],
      },
    ]);
    prisma.$queryRaw.mockResolvedValue([
      { participanteId: 1, fator: new Prisma.Decimal('0.5') },
      { participanteId: 2, fator: new Prisma.Decimal('1') },
    ]);
    prisma.conversaoPontoExtra.findMany.mockResolvedValue([
      { colocacao: 1, pontoExtra: new Prisma.Decimal('1') },
      { colocacao: 2, pontoExtra: new Prisma.Decimal('0.8') },
    ]);
    pdf.gerarBuffer.mockResolvedValue(Buffer.from('pdf'));
    xlsx.gerarBuffer.mockResolvedValue(Buffer.from('xlsx'));
    service = new RelatorioFinalService(
      prisma as unknown as PrismaService,
      eventos as unknown as EventosService,
      parcial as unknown as RelatorioParcialService,
      pdf as unknown as PdfTabelaExporter,
      xlsx as unknown as XlsxPlanilhaExporter,
    );
  });

  it('agrupa por turma, ordena e inclui ausências como false', async () => {
    await expect(service.gerarPrevia(1, {})).resolves.toEqual([
      {
        turma: 'A',
        totalParticipantes: 1,
        participantes: [
          {
            matricula: 'A',
            nome: 'Ana',
            grupo: 'Alfa',
            turma: 'A',
            presencas: [
              { numeroDia: 1, presente: false },
              { numeroDia: 2, presente: true },
            ],
            pontoExtra: 0.5,
          },
        ],
      },
      {
        turma: 'B',
        totalParticipantes: 1,
        participantes: [
          {
            matricula: 'B',
            nome: 'Bruna',
            grupo: 'Beta',
            turma: 'B',
            presencas: [
              { numeroDia: 1, presente: true },
              { numeroDia: 2, presente: false },
            ],
            pontoExtra: 0.8,
          },
        ],
      },
    ]);
  });

  it('filtra por nome, matrícula ou turma', async () => {
    const resultado = await service.gerarPrevia(1, { busca: 'brun' });
    expect(resultado).toHaveLength(1);
    expect(resultado[0].participantes[0].nome).toBe('Bruna');
  });

  it('bloqueia prévia quando existe empate pendente', async () => {
    parcial.calcularClassificacaoParcial.mockResolvedValueOnce({
      dados: [],
      resumo: {
        empatesPendentes: [[10, 20]],
        desafiosLancados: 2,
        desafiosTotais: 2,
      },
    });
    await expect(service.gerarPrevia(1, {})).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.participante.findMany).not.toHaveBeenCalled();
  });

  it('consome a colocação resultante do desempate manual vigente', async () => {
    parcial.calcularClassificacaoParcial.mockResolvedValueOnce({
      dados: [
        { grupoId: 10, posicao: 2 },
        { grupoId: 20, posicao: 1 },
      ],
      resumo: { empatesPendentes: [], desafiosLancados: 2, desafiosTotais: 2 },
    });
    const previa = await service.gerarPrevia(1, { busca: 'Ana' });
    expect(previa[0].participantes[0].pontoExtra).toBe(0.4);
  });

  it('reproduz o arredondamento decimal do PostgreSQL em meio centavo', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      { participanteId: 1, fator: new Prisma.Decimal('0.35') },
      { participanteId: 2, fator: new Prisma.Decimal('1') },
    ]);
    prisma.conversaoPontoExtra.findMany.mockResolvedValueOnce([
      { colocacao: 1, pontoExtra: new Prisma.Decimal('0.3') },
      { colocacao: 2, pontoExtra: new Prisma.Decimal('0.8') },
    ]);
    const previa = await service.gerarPrevia(1, { busca: 'Ana' });
    expect(previa[0].participantes[0].pontoExtra).toBe(0.11);
  });

  it.each([
    ['0.3499', 0.1],
    ['0.35', 0.11],
    ['0.3501', 0.11],
  ])(
    'arredonda fator %s vezes conversão 0.3 para o esperado independente %s',
    async (fator, esperado) => {
      prisma.$queryRaw.mockResolvedValueOnce([
        { participanteId: 1, fator: new Prisma.Decimal(fator) },
      ]);
      prisma.conversaoPontoExtra.findMany.mockResolvedValueOnce([
        { colocacao: 1, pontoExtra: new Prisma.Decimal('0.3') },
      ]);

      const previa = await service.gerarPrevia(1, { busca: 'Ana' });

      expect(previa[0].participantes[0].pontoExtra).toBe(esperado);
    },
  );

  it('respeita limites e metade da segunda casa no domínio decimal do schema', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([
        { participanteId: 1, fator: new Prisma.Decimal('0.05') },
      ])
      .mockResolvedValueOnce([
        { participanteId: 1, fator: new Prisma.Decimal('0') },
      ])
      .mockResolvedValueOnce([
        { participanteId: 1, fator: new Prisma.Decimal('1') },
      ]);
    prisma.conversaoPontoExtra.findMany
      .mockResolvedValueOnce([
        { colocacao: 1, pontoExtra: new Prisma.Decimal('0.1') },
      ])
      .mockResolvedValueOnce([
        { colocacao: 1, pontoExtra: new Prisma.Decimal('1') },
      ])
      .mockResolvedValueOnce([
        { colocacao: 1, pontoExtra: new Prisma.Decimal('1') },
      ]);

    await expect(
      service.gerarPrevia(1, { busca: 'Ana' }),
    ).resolves.toMatchObject([{ participantes: [{ pontoExtra: 0.01 }] }]);
    await expect(
      service.gerarPrevia(1, { busca: 'Ana' }),
    ).resolves.toMatchObject([{ participantes: [{ pontoExtra: 0 }] }]);
    await expect(
      service.gerarPrevia(1, { busca: 'Ana' }),
    ).resolves.toMatchObject([{ participantes: [{ pontoExtra: 1 }] }]);
  });

  it('usa exportadores compartilhados e retorna metadados de download', async () => {
    await expect(
      service.gerarRelatorioFinal(1, FormatoRelatorio.PDF),
    ).resolves.toMatchObject({
      buffer: Buffer.from('pdf'),
      contentType: 'application/pdf',
      nomeArquivo: 'relatorio-final-arena.pdf',
    });
    expect(pdf.gerarBuffer).toHaveBeenCalledOnce();
    expect(xlsx.gerarBuffer).not.toHaveBeenCalled();

    await service.gerarRelatorioFinal(1, FormatoRelatorio.XLSX);
    expect(xlsx.gerarBuffer).toHaveBeenCalledOnce();
  });

  it('envia ao PDF turma, ordem e valores associados por participante', async () => {
    const dias = Array.from({ length: 5 }, (_, indice) => ({
      id: (indice + 1) * 100,
      numeroDia: indice + 1,
    }));
    const nomeZelia = `Zélia ${'de Ávila '.repeat(16)}`;
    const matriculaLonga = 'T229-C-0000000000001';
    prisma.diaEvento.findMany.mockResolvedValueOnce(dias);
    prisma.participante.findMany.mockResolvedValueOnce([
      {
        id: 2,
        matricula: matriculaLonga,
        nome: nomeZelia,
        turma: 'TURMA-2026',
        grupoId: 20,
        grupo: { nome: 'Beta' },
        presencas: [{ diaId: 200, presente: true }],
      },
      {
        id: 1,
        matricula: 'T229-A',
        nome: 'Mateus Azevedo',
        turma: 'A-26',
        grupoId: 10,
        grupo: { nome: 'Alfa' },
        presencas: [
          { diaId: 100, presente: true },
          { diaId: 300, presente: true },
        ],
      },
      {
        id: 3,
        matricula: 'T229-D',
        nome: 'Ágata do Ó',
        turma: 'TURMA-2026',
        grupoId: 20,
        grupo: { nome: 'Beta' },
        presencas: [],
      },
    ]);
    prisma.$queryRaw.mockResolvedValueOnce([
      { participanteId: 1, fator: new Prisma.Decimal('0.4') },
      { participanteId: 2, fator: new Prisma.Decimal('0.2') },
      { participanteId: 3, fator: new Prisma.Decimal('0') },
    ]);
    prisma.conversaoPontoExtra.findMany.mockResolvedValueOnce([
      { colocacao: 1, pontoExtra: new Prisma.Decimal('1') },
      { colocacao: 2, pontoExtra: new Prisma.Decimal('0.8') },
    ]);

    await service.gerarRelatorioFinal(1, FormatoRelatorio.PDF);

    const config = pdf.gerarBuffer.mock
      .calls[0][0] as unknown as TabelaRelatorioConfig;
    expect(config.orientacaoPdf).toBe('landscape');
    expect(config.secoes[0].colunas.map((coluna) => coluna.titulo)).toEqual([
      'Turma',
      'Matrícula',
      'Nome',
      'Grupo',
      'Dia 1',
      'Dia 2',
      'Dia 3',
      'Dia 4',
      'Dia 5',
      'Ponto extra',
    ]);
    expect(config.secoes[0].linhas).toEqual([
      {
        turma: 'A-26',
        matricula: 'T229-A',
        nome: 'Mateus Azevedo',
        grupo: 'Alfa',
        dia1: 'Presente',
        dia2: 'Ausente',
        dia3: 'Presente',
        dia4: 'Ausente',
        dia5: 'Ausente',
        pontoExtra: 0.4,
      },
      {
        turma: 'TURMA-2026',
        matricula: 'T229-D',
        nome: 'Ágata do Ó',
        grupo: 'Beta',
        dia1: 'Ausente',
        dia2: 'Ausente',
        dia3: 'Ausente',
        dia4: 'Ausente',
        dia5: 'Ausente',
        pontoExtra: 0,
      },
      {
        turma: 'TURMA-2026',
        matricula: matriculaLonga,
        nome: nomeZelia,
        grupo: 'Beta',
        dia1: 'Ausente',
        dia2: 'Presente',
        dia3: 'Ausente',
        dia4: 'Ausente',
        dia5: 'Ausente',
        pontoExtra: 0.16,
      },
    ]);
  });
});
