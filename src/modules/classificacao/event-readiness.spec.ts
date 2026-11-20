import {
  describeMissingConfiguration,
  getIncompleteEventReason,
  getMissingConfiguration,
} from './event-readiness.js';

describe('prerequisites for final event calculations', () => {
  const groups = [{ id: 1 }, { id: 2 }];
  const completed = [
    { grupoId: 1, colocacao: 1, ausente: false },
    { grupoId: 2, colocacao: null, ausente: true },
  ];

  it('requires groups, challenges and a valid result for every group', () => {
    expect(getIncompleteEventReason([], [])).toBe('groups');
    expect(getIncompleteEventReason(groups, [])).toBe('challenges');
    expect(
      getIncompleteEventReason(groups, [
        { resultados: [{ grupoId: 1, colocacao: 1, ausente: false }] },
      ]),
    ).toBe('results');
    expect(
      getIncompleteEventReason(groups, [
        {
          resultados: [
            { grupoId: 1, colocacao: null, ausente: false },
            completed[1],
          ],
        },
      ]),
    ).toBe('results');
    expect(
      getIncompleteEventReason(groups, [{ resultados: completed }]),
    ).toBeNull();
  });

  it('requires every placement and every attendance factor including zero days', () => {
    expect(getMissingConfiguration(2, 2, [1], [0, 1, 2])).toEqual({
      kind: 'conversion',
      value: 2,
    });
    expect(getMissingConfiguration(2, 2, [1, 2], [1, 2])).toEqual({
      kind: 'factor',
      value: 0,
    });
    expect(getMissingConfiguration(2, 2, [1, 2], [0, 2])).toEqual({
      kind: 'factor',
      value: 1,
    });
    expect(getMissingConfiguration(2, 2, [1, 2], [0, 1, 2])).toBeNull();
  });

  it('describes the missing configuration in Portuguese', () => {
    expect(describeMissingConfiguration({ kind: 'conversion', value: 7 })).toBe(
      'Falta a conversão da 7ª colocação na configuração do evento.',
    );
    expect(describeMissingConfiguration({ kind: 'factor', value: 1 })).toBe(
      'Falta o fator para 1 dia presente na configuração do evento.',
    );
    expect(describeMissingConfiguration({ kind: 'factor', value: 3 })).toBe(
      'Falta o fator para 3 dias presentes na configuração do evento.',
    );
  });
});
