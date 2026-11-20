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

/**
 * Envio guardado há mais tempo que isso não é reenviado sozinho: pode sobrescrever uma correção feita
 * depois (em outro computador, ou por outra pessoa). Só sai pelo botão "Reenviar agora".
 */
export const LIMITE_REENVIO_AUTOMATICO_MS = 2 * 60 * 60 * 1000;
export const guardadoHaMuito = (criadoEm: string, agora: number) => agora - Date.parse(criadoEm) > LIMITE_REENVIO_AUTOMATICO_MS;

/**
 * Falhas que valem para todos os envios, não só para o que falhou: sem conexão, sessão expirada, excesso
 * de requisições e servidor fora do ar ou sobrecarregado. O reenvio para em vez de tentar cada envio
 * guardado (com o servidor fora do ar, seriam dezenas de requisições a cada tentativa).
 */
const PARAM_O_REENVIO = new Set([0, 401, 429, 502, 503, 504]);
export const paraOReenvio = (erro: unknown) => erro instanceof ApiError && PARAM_O_REENVIO.has(erro.status);
