import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { FormatoRelatorio } from '../enums/formato-relatorio.enum.js';
import { RelatorioParcialService } from '../parcial/relatorio-parcial.service.js';
import { PdfTabelaExporter } from '../exporters/pdf-tabela.exporter.js';
import { XlsxPlanilhaExporter } from '../exporters/xlsx-planilha.exporter.js';
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
      { participanteId: 1, fator: 0.5 },
      { participanteId: 2, fator: 1 },
    ]);
    prisma.conversaoPontoExtra.findMany.mockResolvedValue([
      { colocacao: 1, pontoExtra: 1 },
      { colocacao: 2, pontoExtra: 0.8 },
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
      { participanteId: 1, fator: 0.35 },
      { participanteId: 2, fator: 1 },
    ]);
    prisma.conversaoPontoExtra.findMany.mockResolvedValueOnce([
      { colocacao: 1, pontoExtra: 0.3 },
      { colocacao: 2, pontoExtra: 0.8 },
    ]);
    const previa = await service.gerarPrevia(1, { busca: 'Ana' });
    expect(previa[0].participantes[0].pontoExtra).toBe(0.11);
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
});
