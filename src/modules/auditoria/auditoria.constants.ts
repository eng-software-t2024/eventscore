/**
 * Lançamentos que gravam histórico (RF18). A lista é fechada para que todos
 * os módulos usem o mesmo nome ao gravar e o front use o mesmo ao consultar.
 */
export const AUDITED_ENTITIES = [
  'RESULTADO_DESAFIO',
  'BONIFICACAO_GRUPO',
  'PENALIDADE',
  'DESEMPATE_MANUAL',
  'APURACAO',
] as const;

export type AuditedEntity = (typeof AUDITED_ENTITIES)[number];

/** Valores aceitos pelo CHECK de `auditoria.operacao` (migração V7). */
export const AUDIT_OPERATIONS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'RECALCULO',
] as const;

export type AuditOperation = (typeof AUDIT_OPERATIONS)[number];
