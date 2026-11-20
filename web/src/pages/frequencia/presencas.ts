import { tipoDeFalha } from '../../api/falhas.ts';

// Formato do contrato v0.3 (frequência); ainda fora do OpenAPI oficial.
export type Presenca = {
  participanteId: number;
  matricula: string;
  nome: string;
  turma: string;
  grupoId: number;
  grupo: string;
  presente: boolean;
};

/** Marcações que não chegaram à API: participanteId -> presente. */
export type Pendentes = Record<number, boolean>;

/**
 * RNF04: marcação que falha por queda de conexão fica guardada no navegador, por evento e dia,
 * e é reenviada depois. O PUT é idempotente, então reenviar não duplica nada.
 */
const chave = (eventoId: number, diaId: number) => `eventscore.presencas.${eventoId}.${diaId}`;

// Sem armazenamento (aba anônima, cota cheia), as pendências ficam só na memória enquanto a página estiver aberta.
const memoria = new Map<string, Pendentes>();
let semArmazenamento = false;

export function lerPendentes(eventoId: number, diaId: number): Pendentes {
  const k = chave(eventoId, diaId);
  if (semArmazenamento) return memoria.get(k) ?? {};
  try {
    return JSON.parse(localStorage.getItem(k) ?? '{}') as Pendentes;
  } catch {
    return memoria.get(k) ?? {};
  }
}

export function gravarPendentes(eventoId: number, diaId: number, pendentes: Pendentes) {
  const k = chave(eventoId, diaId);
  memoria.set(k, pendentes);
  try {
    if (Object.keys(pendentes).length) localStorage.setItem(k, JSON.stringify(pendentes));
    else localStorage.removeItem(k);
  } catch {
    semArmazenamento = true;
  }
}

/**
 * Mesma regra dos Lançamentos: sem conexão, sessão expirada (401), tempo esgotado (408), excesso de
 * requisições (429) e servidor com problema (5xx) passam sozinhos, então a marcação fica guardada e é
 * reenviada. Só a recusa de conteúdo (demais 4xx, ex.: participante de outro evento) desfaz a marcação.
 */
export const guardarAoFalhar = (erro: unknown) => tipoDeFalha(erro) !== 'recusado';

/** Mostra a marcação pendente por cima do que veio da API, já que ela é a mais recente. */
export const aplicarPendentes = (dados: Presenca[], pendentes: Pendentes): Presenca[] =>
  dados.map((p) => (p.participanteId in pendentes ? { ...p, presente: pendentes[p.participanteId] } : p));

export function filtrar(dados: Presenca[], grupoId: string, busca: string): Presenca[] {
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  return dados.filter(
    (p) =>
      (!grupoId || String(p.grupoId) === grupoId) &&
      (!termo || p.nome.toLocaleLowerCase('pt-BR').includes(termo) || p.matricula.toLocaleLowerCase('pt-BR').includes(termo)),
  );
}

export function resumo(dados: Presenca[]) {
  const presentes = dados.filter((p) => p.presente).length;
  return { total: dados.length, presentes, ausentes: dados.length - presentes };
}

/** Dia de hoje, se for um dos dias do evento; senão o primeiro. */
export function diaInicial<T extends { id: number; data: string }>(dias: T[], hoje: string): T | undefined {
  return dias.find((d) => d.data === hoje) ?? dias[0];
}
