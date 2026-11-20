import { ApiError } from '../../api/client.ts';

/**
 * RNF04: lançamento que não chega à API fica guardado no navegador, por evento, e é reenviado depois.
 * Só entram os PUT (colocações e bônus), que são idempotentes: reenviar não duplica nada. A chave é o
 * caminho, então um envio novo para o mesmo recurso substitui o anterior; o `id` distingue os dois.
 */
export type EnvioPendente = { id: string; caminho: string; corpo: unknown; descricao: string };
export type Pendentes = Record<string, EnvioPendente>;

const chave = (eventoId: number) => `eventscore.lancamentos.${eventoId}`;

// Sem armazenamento (aba anônima, cota cheia), a fila fica só na memória enquanto a página estiver aberta.
const memoria = new Map<number, Pendentes>();
let semArmazenamento = false;

export function lerPendentes(eventoId: number): Pendentes {
  if (semArmazenamento) return memoria.get(eventoId) ?? {};
  try {
    return JSON.parse(localStorage.getItem(chave(eventoId)) ?? '{}') as Pendentes;
  } catch {
    return memoria.get(eventoId) ?? {};
  }
}

export function gravarPendentes(eventoId: number, pendentes: Pendentes) {
  memoria.set(eventoId, pendentes);
  try {
    if (Object.keys(pendentes).length) localStorage.setItem(chave(eventoId), JSON.stringify(pendentes));
    else localStorage.removeItem(chave(eventoId));
  } catch {
    semArmazenamento = true;
  }
}

export const novoId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const comPendente = (pendentes: Pendentes, envio: EnvioPendente): Pendentes => ({ ...pendentes, [envio.caminho]: envio });

/** Tira o envio da fila só se ele ainda for o guardado: um envio mais novo do mesmo caminho fica. */
export function semPendente(pendentes: Pendentes, envio: Pick<EnvioPendente, 'caminho' | 'id'>): Pendentes {
  if (pendentes[envio.caminho]?.id !== envio.id) return pendentes;
  const resto = { ...pendentes };
  delete resto[envio.caminho];
  return resto;
}

/**
 * O que fazer quando um envio falha:
 * - `conexao`: não chegou ao servidor (status 0); fica na fila.
 * - `recusado`: a API recusou o conteúdo (400, 404, 409, 422); sai da fila e a mensagem aparece.
 * - `depois`: sessão expirada (401) ou servidor com problema (5xx); fica na fila para tentar de novo.
 */
export function tipoDeFalha(erro: unknown): 'conexao' | 'recusado' | 'depois' {
  if (!(erro instanceof ApiError)) return 'depois';
  if (erro.status === 0) return 'conexao';
  if ([400, 404, 409, 422].includes(erro.status)) return 'recusado';
  return 'depois';
}

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
