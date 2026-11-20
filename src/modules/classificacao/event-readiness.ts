/** Dados mínimos necessários para saber se a apuração final pode usar os resultados. */
export interface ChallengeResults {
  resultados: Array<{
    grupoId: number;
    colocacao: number | null;
    ausente: boolean;
  }>;
}

export type IncompleteEventReason = 'groups' | 'challenges' | 'results';

export function getIncompleteEventReason(
  groups: Array<{ id: number }>,
  challenges: ChallengeResults[],
): IncompleteEventReason | null {
  if (groups.length === 0) return 'groups';
  if (challenges.length === 0) return 'challenges';

  const requiredGroupIds = new Set(groups.map((group) => group.id));
  const allResultsPresent = challenges.every((challenge) => {
    const completedGroupIds = new Set(
      challenge.resultados
        .filter((result) => result.ausente || result.colocacao !== null)
        .map((result) => result.grupoId),
    );
    return [...requiredGroupIds].every((groupId) =>
      completedGroupIds.has(groupId),
    );
  });
  return allResultsPresent ? null : 'results';
}

export type MissingConfiguration =
  { kind: 'conversion'; value: number } | { kind: 'factor'; value: number };

/** Uma posição por grupo e um fator para cada quantidade possível de dias. */
export function getMissingConfiguration(
  groupCount: number,
  totalDays: number,
  conversionPlacements: Iterable<number>,
  factorDays: Iterable<number>,
): MissingConfiguration | null {
  const placements = new Set(conversionPlacements);
  for (let placement = 1; placement <= groupCount; placement++) {
    if (!placements.has(placement)) {
      return { kind: 'conversion', value: placement };
    }
  }

  const configuredDays = new Set(factorDays);
  for (let days = 0; days <= totalDays; days++) {
    if (!configuredDays.has(days)) return { kind: 'factor', value: days };
  }
  return null;
}
