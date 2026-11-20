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

// Entrada fora do formato (editada à mão, versão antiga) é ignorada em vez de quebrar a tela.
const lerJson = (texto: string): Pendentes =>
  Object.fromEntries(Object.entries(JSON.parse(texto) as Record<string, unknown>).filter(([, m]) => ehMarcacao(m))) as Pendentes;

export function lerPendentes(alvo: Alvo): Pendentes {
  const k = chaveDasPendentes(alvo);
  if (semArmazenamento) return memoria.get(k) ?? {};
  try {
    return lerJson(localStorage.getItem(k) ?? '{}');
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

/**
 * Outra aba do mesmo usuário mexeu nas pendências deste dia (evento `storage`): devolve como ficaram, para a
 * tela não continuar mostrando como não salva uma marcação que a outra aba já enviou. `undefined` quando a
 * mudança é de outra chave ou veio ilegível; `key` nulo é `localStorage.clear()`, que esvazia tudo.
 */
export function pendentesDeOutraAba(evento: { key: string | null; newValue: string | null }, alvo: Alvo): Pendentes | undefined {
  const k = chaveDasPendentes(alvo);
  if (evento.key !== null && evento.key !== k) return undefined;
  let novo: Pendentes = {};
  if (evento.key !== null && evento.newValue) {
    try {
      novo = lerJson(evento.newValue);
    } catch {
      return undefined;
    }
  }
  memoria.set(k, novo);
  return novo;
}

/**
 * Pendências do formato antigo (`eventscore.presencas.<evento>.<dia>`, sem usuário nem hora) não são
 * reenviadas, porque não dá para saber de quem são; só ocupariam espaço no navegador.
 */
const FORMATO_ANTIGO = /^eventscore\.presencas\.\d+\.\d+$/;
export function descartarFormatoAntigo(armazenamento?: Pick<Storage, 'length' | 'key' | 'removeItem'>) {
  try {
    const a = armazenamento ?? localStorage;
    const antigas: string[] = [];
    for (let i = 0; i < a.length; i++) {
      const k = a.key(i);
      if (k && FORMATO_ANTIGO.test(k)) antigas.push(k);
    }
    for (const k of antigas) a.removeItem(k);
  } catch {
    // Sem armazenamento: não há o que limpar.
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

/**
 * Lista do dia na tela: `dados` é o que aparece (com marcações ainda não salvas) e `salvos` é o último
 * valor que a API confirmou para cada participante. A tela volta para `salvos`, e não para o valor
 * anterior dela, quando uma marcação é recusada ou descartada: o anterior pode ser uma pendência que
 * nunca chegou ao servidor.
 */
export type ListaDoDia = { diaId: number; dados: Presenca[]; salvos: Record<number, boolean> };

const salvosDaApi = (daApi: Presenca[]) => Object.fromEntries(daApi.map((p) => [p.participanteId, p.presente]));
const comValor = (dados: Presenca[], id: number, presente: boolean) =>
  dados.map((p) => (p.participanteId === id ? { ...p, presente } : p));

export const novaListaDoDia = (diaId: number, daApi: Presenca[], pendentes: Pendentes): ListaDoDia => ({
  diaId,
  dados: aplicarPendentes(daApi, pendentes),
  salvos: salvosDaApi(daApi),
});

/** O usuário marcou: aparece na hora, antes de a API responder. */
export const marcarNaLista = (l: ListaDoDia, id: number, presente: boolean): ListaDoDia => ({ ...l, dados: comValor(l.dados, id, presente) });

/** A API salvou: passa a ser o valor confirmado. */
export const confirmarNaLista = (l: ListaDoDia, id: number, presente: boolean): ListaDoDia => ({
  ...l,
  salvos: { ...l.salvos, [id]: presente },
});

/** A API recusou: a linha volta ao último valor confirmado. */
export const recusarNaLista = (l: ListaDoDia, id: number, enviado: boolean): ListaDoDia => ({
  ...l,
  dados: comValor(l.dados, id, l.salvos[id] ?? !enviado),
});

/**
 * As pendências mudaram em outra aba: quem ganhou pendência mostra o valor guardado, e quem deixou de ter
 * volta ao último valor confirmado (pendência descartada ou recusada lá). Se a outra aba salvou, a
 * recarga da lista (`recarregarLista`) traz o valor novo do servidor.
 */
export function sincronizarLista(l: ListaDoDia, antes: Pendentes, depois: Pendentes): ListaDoDia {
  return {
    ...l,
    dados: l.dados.map((p) => {
      const id = p.participanteId;
      if (id in depois) return { ...p, presente: depois[id].presente };
      if (id in antes && id in l.salvos) return { ...p, presente: l.salvos[id] };
      return p;
    }),
  };
}

/**
 * Lista recarregada da API com a tela em uso: o servidor vira o confirmado; aparece o que está pendente
 * e, para quem tem marcação a caminho (`aCaminho`), fica o que está na tela até a resposta chegar.
 */
export function recarregarLista(l: ListaDoDia, daApi: Presenca[], pendentes: Pendentes, aCaminho: Set<number>): ListaDoDia {
  const naTela = new Map(l.dados.map((p) => [p.participanteId, p.presente]));
  return {
    ...l,
    salvos: salvosDaApi(daApi),
    dados: aplicarPendentes(daApi, pendentes).map((p) =>
      aCaminho.has(p.participanteId) && naTela.has(p.participanteId) ? { ...p, presente: naTela.get(p.participanteId)! } : p,
    ),
  };
}

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
