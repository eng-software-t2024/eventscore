import { guardadoHaMuito, tipoDeFalha } from '../../api/falhas.ts';

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

/** Marcação que não chegou à API, com quando foi guardada (a mais antiga que 2 h não sai sozinha). */
export type Marcacao = { presente: boolean; criadoEm: string };
/** participanteId -> marcação guardada. */
export type Pendentes = Record<number, Marcacao>;
/** De quem e de qual dia são as pendências. */
export type Alvo = { eventoId: number; usuarioId: number; diaId: number };

/**
 * RNF04: marcação que falha fica guardada no navegador e é reenviada depois. O PUT é idempotente, então
 * reenviar não duplica nada. Uma fila por evento, usuário e dia: num computador compartilhado, quem entra
 * depois não reenvia o que outra pessoa marcou (como na fila dos Lançamentos).
 */
export const chaveDasPendentes = (alvo: Alvo) => `eventscore.presencas.${alvo.eventoId}.${alvo.usuarioId}.${alvo.diaId}`;

const ehMarcacao = (m: unknown): m is Marcacao =>
  typeof m === 'object' && m !== null && typeof (m as Marcacao).presente === 'boolean' && typeof (m as Marcacao).criadoEm === 'string';

// Sem armazenamento (aba anônima, cota cheia), as pendências ficam só na memória enquanto a página estiver aberta.
const memoria = new Map<string, Pendentes>();
let semArmazenamento = false;

export function lerPendentes(alvo: Alvo): Pendentes {
  const k = chaveDasPendentes(alvo);
  if (semArmazenamento) return memoria.get(k) ?? {};
  try {
    const lido = JSON.parse(localStorage.getItem(k) ?? '{}') as Record<string, unknown>;
    // Entrada fora do formato (editada à mão, versão antiga) é ignorada em vez de quebrar a tela.
    return Object.fromEntries(Object.entries(lido).filter(([, m]) => ehMarcacao(m))) as Pendentes;
  } catch {
    return memoria.get(k) ?? {};
  }
}

export function gravarPendentes(alvo: Alvo, pendentes: Pendentes) {
  const k = chaveDasPendentes(alvo);
  memoria.set(k, pendentes);
  try {
    if (Object.keys(pendentes).length) localStorage.setItem(k, JSON.stringify(pendentes));
    else localStorage.removeItem(k);
  } catch {
    semArmazenamento = true;
  }
}

/** Guardada há mais de 2 h: só sai pelo botão, porque pode desfazer uma correção feita depois. */
export const marcacaoAntiga = (m: Marcacao, agora: number) => guardadoHaMuito(m.criadoEm, agora);

/**
 * Mesma regra dos Lançamentos: sem conexão, sessão expirada (401), tempo esgotado (408), excesso de
 * requisições (429) e servidor com problema (5xx) passam sozinhos, então a marcação fica guardada e é
 * reenviada. Só a recusa de conteúdo (demais 4xx, ex.: participante de outro evento) desfaz a marcação.
 */
export const guardarAoFalhar = (erro: unknown) => tipoDeFalha(erro) !== 'recusado';

/** Mostra a marcação pendente por cima do que veio da API, já que ela é a mais recente. */
export const aplicarPendentes = (dados: Presenca[], pendentes: Pendentes): Presenca[] =>
  dados.map((p) => (p.participanteId in pendentes ? { ...p, presente: pendentes[p.participanteId].presente } : p));

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
