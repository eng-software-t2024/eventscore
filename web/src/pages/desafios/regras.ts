import { lerNumero } from '../../numero.ts';

// Formato do contrato v0.3 (desafios); ainda fora do OpenAPI oficial.
export type Pontos = { colocacao: number; pontos: number };
export type Desafio = { id: number; nome: string; descricao: string; diaId: number; pontosColocacao: Pontos[] };
export type FormDesafio = { nome: string; descricao: string; diaId: string; pontos: string[] };

/** Uma linha por grupo (RF06), preenchida com os pontos já cadastrados. */
export function paraFormulario(desafio: Desafio | undefined, grupos: number): FormDesafio {
  const ponto = (c: number) => desafio?.pontosColocacao.find((p) => p.colocacao === c)?.pontos;
  return {
    nome: desafio?.nome ?? '',
    descricao: desafio?.descricao ?? '',
    diaId: desafio ? String(desafio.diaId) : '',
    pontos: Array.from({ length: grupos }, (_, i) => String(ponto(i + 1) ?? '')),
  };
}

// Limites das colunas do banco, iguais aos da proposta de contrato de desafios (T245).
export const MAX_NOME = 100;
export const MAX_DESCRICAO = 255;

export function montarDesafio(f: FormDesafio, grupos: number): { dados: Omit<Desafio, 'id'> } | { erro: string } {
  if (!f.nome.trim()) return { erro: 'Informe o nome do desafio.' };
  if (f.nome.trim().length > MAX_NOME) return { erro: `O nome pode ter no máximo ${MAX_NOME} caracteres.` };
  if (f.descricao.trim().length > MAX_DESCRICAO) return { erro: `A descrição pode ter no máximo ${MAX_DESCRICAO} caracteres.` };
  if (!f.diaId) return { erro: 'Escolha o dia do desafio.' };
  if (grupos === 0) return { erro: 'Cadastre os grupos antes: a tabela de pontos tem uma linha por grupo.' };
  if (f.pontos.length !== grupos) return { erro: `A tabela de pontos precisa ter uma linha por grupo (${grupos}).` };
  const pontosColocacao = f.pontos.map((t, i) => ({ colocacao: i + 1, pontos: lerNumero(t) }));
  const ruim = pontosColocacao.find((p) => !(Number.isInteger(p.pontos) && p.pontos >= 0));
  if (ruim) return { erro: `Informe os pontos do ${ruim.colocacao}º lugar (número inteiro).` };
  return { dados: { nome: f.nome.trim(), descricao: f.descricao.trim(), diaId: Number(f.diaId), pontosColocacao } };
}

const tabelaComoTexto = (tabela: Pontos[]) =>
  [...tabela]
    .sort((a, b) => a.colocacao - b.colocacao)
    .map((p) => `${p.colocacao}:${p.pontos}`)
    .join(',');

/**
 * Contrato v0.3: PATCH só com os campos alterados. Depois de lançar resultados, a API recusa com 409
 * mudança de dia ou de tabela, então renomear um desafio não pode reenviar a tabela. A tabela vai
 * inteira quando qualquer linha muda, porque a API a substitui por completo.
 */
export function camposAlterados(original: Desafio, dados: Omit<Desafio, 'id'>): Partial<Omit<Desafio, 'id'>> {
  const mudou: Partial<Omit<Desafio, 'id'>> = {};
  if (dados.nome !== original.nome) mudou.nome = dados.nome;
  if (dados.descricao !== (original.descricao ?? '')) mudou.descricao = dados.descricao;
  if (dados.diaId !== original.diaId) mudou.diaId = dados.diaId;
  if (tabelaComoTexto(dados.pontosColocacao) !== tabelaComoTexto(original.pontosColocacao)) {
    mudou.pontosColocacao = dados.pontosColocacao;
  }
  return mudou;
}
