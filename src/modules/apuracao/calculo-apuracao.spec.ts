import { ConflictException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { calculateIndividualResults } from './calculo-apuracao.js';

const participante = (id: number, grupoId = 1) => ({
  id,
  matricula: `2026-${id}`,
  nome: `Aluno ${id}`,
  turma: 'A1',
  grupoId,
  grupo: { nome: `Grupo ${grupoId}` },
});

describe('cálculo da apuração individual (RF16)', () => {
  it('usa conversão da posição e fator configurado, arredondando somente o resultado final', () => {
    const calculada = calculateIndividualResults(
      [participante(1), participante(2), participante(3, 2)],
      [
        {
          participanteId: 1,
          diasPresentes: 2n,
          fator: new Prisma.Decimal('0.75'),
        },
        {
          participanteId: 2,
          diasPresentes: 1n,
          fator: new Prisma.Decimal('0.5'),
        },
        { participanteId: 3, diasPresentes: 0n, fator: new Prisma.Decimal(0) },
      ],
      new Map([
        [1, 1],
        [2, 2],
      ]),
      new Map([
        [1, new Prisma.Decimal('0.9')],
        [2, new Prisma.Decimal('0.8')],
      ]),
      2,
    );

    expect(calculada.linhas.map((item) => item.pontoExtra)).toEqual([
      0.68, 0.45, 0,
    ]);
    expect(calculada.linhas[0]).toMatchObject({
      colocacaoGrupo: 1,
      pontoExtraGrupo: 0.9,
      diasPresentes: 2,
      diasTotais: 2,
      fator: 0.75,
    });
    expect(calculada.resumo).toEqual({
      totalParticipantes: 3,
      assiduidade: 0.5,
      aptos: 2,
    });
  });

  it('trata presença não lançada como zero quando há fator configurado', () => {
    const calculada = calculateIndividualResults(
      [participante(1)],
      [{ participanteId: 1, diasPresentes: 0n, fator: new Prisma.Decimal(0) }],
      new Map([[1, 1]]),
      new Map([[1, new Prisma.Decimal('0.9')]]),
      2,
    );
    expect(calculada.linhas[0]).toMatchObject({
      diasPresentes: 0,
      fator: 0,
      pontoExtraGrupo: 0.9,
      pontoExtra: 0,
    });
    expect(calculada.resumo).toEqual({
      totalParticipantes: 1,
      assiduidade: 0,
      aptos: 0,
    });
  });

  it('recusa classificação inconsistente e configuração ausente', () => {
    const attend = [
      { participanteId: 1, diasPresentes: 0n, fator: new Prisma.Decimal(0) },
    ];
    expect(() =>
      calculateIndividualResults(
        [participante(1)],
        attend,
        new Map(),
        new Map([[1, new Prisma.Decimal(1)]]),
        2,
      ),
    ).toThrow(ConflictException);
    expect(() =>
      calculateIndividualResults(
        [participante(1)],
        attend,
        new Map([[1, 1]]),
        new Map(),
        2,
      ),
    ).toThrow(ConflictException);
    expect(() =>
      calculateIndividualResults(
        [participante(1)],
        [{ participanteId: 1, diasPresentes: 0n, fator: null }],
        new Map([[1, 1]]),
        new Map([[1, new Prisma.Decimal(1)]]),
        2,
      ),
    ).toThrow(ConflictException);
  });

  it('arredonda assiduidade não periódica a quatro casas', () => {
    const result = calculateIndividualResults(
      [participante(1)],
      [
        {
          participanteId: 1,
          diasPresentes: 1n,
          fator: new Prisma.Decimal('0.33'),
        },
      ],
      new Map([[1, 1]]),
      new Map([[1, new Prisma.Decimal(1)]]),
      3,
    );
    expect(result.resumo.assiduidade).toBe(0.3333);
  });

  it('retorna resumo zerado quando não há participantes', () => {
    expect(calculateIndividualResults([], [], new Map(), new Map(), 0)).toEqual(
      {
        linhas: [],
        resumo: { totalParticipantes: 0, assiduidade: 0, aptos: 0 },
      },
    );
  });
});
