import { ApiError } from '../../api/client.ts';

/**
 * RNF04: lançamento que falha por queda de conexão fica guardado no navegador, por evento, e é
 * reenviado depois. Só entram os PUT (colocações e bônus), que são idempotentes: reenviar não
 * duplica nada. A chave é o caminho, então um novo envio para o mesmo recurso substitui o anterior.
 */
export type EnvioPendente = { caminho: string; corpo: unknown; descricao: string };
export type Pendentes = Record<string, EnvioPendente>;

const chave = (eventoId: number) => `eventscore.lancamentos.${eventoId}`;

export function lerPendentes(eventoId: number): Pendentes {
  try {
    return JSON.parse(localStorage.getItem(chave(eventoId)) ?? '{}') as Pendentes;
  } catch {
    return {};
  }
}

export function gravarPendentes(eventoId: number, pendentes: Pendentes) {
  try {
    if (Object.keys(pendentes).length) localStorage.setItem(chave(eventoId), JSON.stringify(pendentes));
    else localStorage.removeItem(chave(eventoId));
  } catch {
    // Sem armazenamento (aba anônima, cota cheia) não há fila: o lançamento precisa ser enviado de novo.
  }
}

export const comPendente = (pendentes: Pendentes, envio: EnvioPendente): Pendentes => ({ ...pendentes, [envio.caminho]: envio });

export function semPendente(pendentes: Pendentes, caminho: string): Pendentes {
  const resto = { ...pendentes };
  delete resto[caminho];
  return resto;
}

/** O `api` devolve status 0 quando a requisição nem chegou ao servidor. */
export const semConexao = (erro: unknown) => erro instanceof ApiError && erro.status === 0;

/** Colocações guardadas por cima do que veio da API, já que elas são o lançamento mais recente. */
export function aplicarColocacoesPendentes<T extends { grupoId: number; colocacao: number | null; ausente: boolean }>(
  linhas: T[],
  pendente: EnvioPendente | undefined,
): T[] {
  if (!pendente || !Array.isArray(pendente.corpo)) return linhas;
  const porGrupo = new Map((pendente.corpo as { grupoId: number; colocacao: number | null; ausente: boolean }[]).map((l) => [l.grupoId, l]));
  return linhas.map((l) => {
    const p = porGrupo.get(l.grupoId);
    return p ? { ...l, colocacao: p.colocacao, ausente: p.ausente } : l;
  });
}

/** Valores de bônus guardados (itemBonificacaoId -> valor) no formato que a tela edita. */
export function bonusPendente(pendente: EnvioPendente | undefined): Record<number, string> | undefined {
  if (!pendente || !Array.isArray(pendente.corpo)) return undefined;
  return Object.fromEntries((pendente.corpo as { itemBonificacaoId: number; valor: number }[]).map((i) => [i.itemBonificacaoId, String(i.valor)]));
}
