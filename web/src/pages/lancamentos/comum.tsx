import type { Schemas } from '../../api/client';
import type { Auditoria } from './regras.ts';

export type Grupo = Schemas['GrupoResumoDto'];

export function PontoCor({ cor }: { cor: string }) {
  return <span className="ponto-cor" style={{ background: cor }} aria-hidden="true" />;
}

const formatarDataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * RF18: alterações de um lançamento com data e responsável. `itens` indefinido é o carregamento;
 * `rotulo` diz de qual parte do lançamento é a linha (o item, no bônus).
 */
export function ListaHistorico({ itens }: { itens?: (Auditoria & { rotulo?: string })[] }) {
  if (!itens) return <>Carregando histórico...</>;
  if (itens.length === 0) return <>Sem alterações registradas.</>;
  return (
    <ul>
      {itens.map((h, i) => (
        <li key={i}>
          {formatarDataHora(h.dataHora)} · {h.usuario} · {h.rotulo && `${h.rotulo} · `}
          {h.operacao}: {h.valorAnterior ?? '—'} → {h.valorNovo ?? '—'}
        </li>
      ))}
    </ul>
  );
}
