import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ConsultarApuracaoQueryDto } from './consultar-apuracao-query.dto.js';

describe('ConsultarApuracaoQueryDto', () => {
  const validate = (input: object) =>
    validateSync(plainToInstance(ConsultarApuracaoQueryDto, input));

  it('aceita defaults, filtros e converte números inteiros', () => {
    expect(validate({})).toEqual([]);
    expect(
      validate({
        pagina: '2',
        tamanho: '10',
        grupoId: '3',
        turma: 'T1',
        busca: 'Ana',
      }),
    ).toEqual([]);
  });

  it.each([
    { pagina: '0' },
    { tamanho: '101' },
    { grupoId: 'abc' },
    { grupoId: '0' },
    { turma: 4 },
    { busca: 4 },
  ])('recusa filtro inválido: %o', (input) => {
    expect(validate(input).length).toBeGreaterThan(0);
  });
});
