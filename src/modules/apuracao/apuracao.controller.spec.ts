import { Test } from '@nestjs/testing';
import { ApuracaoController } from './apuracao.controller.js';
import { ApuracaoService } from './apuracao.service.js';

describe('ApuracaoController', () => {
  it('encaminha identificador e filtros ao serviço sem alterar o contrato', async () => {
    const response = {
      dados: [],
      paginacao: { pagina: 1, tamanho: 20, totalItens: 0, totalPaginas: 0 },
      resumo: { totalParticipantes: 0, assiduidade: 0, aptos: 0 },
    };
    const service = { getResults: vi.fn().mockResolvedValue(response) };
    const moduleRef = await Test.createTestingModule({
      controllers: [ApuracaoController],
      providers: [{ provide: ApuracaoService, useValue: service }],
    }).compile();
    const controller = moduleRef.get(ApuracaoController);
    const query = {
      pagina: 1,
      tamanho: 20,
      grupoId: 3,
      turma: 'T1',
      busca: 'Ana',
    };

    await expect(
      controller.getResults({ eventoId: 4 }, query),
    ).resolves.toEqual(response);
    expect(service.getResults).toHaveBeenCalledExactlyOnceWith(4, query);
  });
});
