import { ApiError } from './client.ts';

/**
 * O que fazer quando um envio falha:
 * - `conexao`: não chegou ao servidor (status 0); fica na fila e a tentativa para.
 * - `recusado`: erro 4xx que não passa sozinho (400, 403, 404, 409, 413, 422...); sai da fila e a mensagem aparece.
 * - `depois`: sessão expirada (401), tempo esgotado (408), excesso de requisições (429) ou servidor
 *   com problema (5xx); fica na fila para tentar de novo.
 */
const PASSAM_SOZINHOS = new Set([401, 408, 429]);

export function tipoDeFalha(erro: unknown): 'conexao' | 'recusado' | 'depois' {
  if (!(erro instanceof ApiError)) return 'depois';
  if (erro.status === 0) return 'conexao';
  if (erro.status >= 400 && erro.status < 500 && !PASSAM_SOZINHOS.has(erro.status)) return 'recusado';
  return 'depois';
}
