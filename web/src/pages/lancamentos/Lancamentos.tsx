import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../../api/client';
import { useLayout } from '../../components/Layout';
import AbaBonusPenalidades from './AbaBonusPenalidades';
import AbaClassificacao from './AbaClassificacao';
import AbaColocacao from './AbaColocacao';
import type { Grupo } from './comum';
import { useEnviosPendentes } from './useEnviosPendentes.ts';
import './Lancamentos.css';

const ABAS = {
  colocacao: ['Colocação por desafio', 'Registre a colocação de cada equipe no desafio.'],
  bonus: ['Bônus e penalidades', 'Bonificação por item, até o teto, e penalidades com justificativa.'],
  classificacao: ['Classificação e desempate', 'Pontuação total dos grupos e decisão manual quando os critérios não resolvem.'],
} as const;
type Aba = keyof typeof ABAS;

// "Homologar", "Reverter" e o hash do mock saíram: não estão nos requisitos nem no DER (contrato v0.3).
// Corrigir um lançamento é enviar de novo; a API recalcula tudo e grava na auditoria (RNF05, RF18).
export default function Lancamentos() {
  const { eventoAtivo } = useLayout();
  const [params, setParams] = useSearchParams();
  const aba: Aba = (params.get('aba') as Aba) in ABAS ? (params.get('aba') as Aba) : 'colocacao';
  const [grupos, setGrupos] = useState<Grupo[]>();
  const [erro, setErro] = useState('');
  const envios = useEnviosPendentes(eventoAtivo?.id);
  const listaPendentes = Object.values(envios.pendentes);

  useEffect(() => {
    if (!eventoAtivo) return;
    api<Grupo[]>(`/eventos/${eventoAtivo.id}/grupos`)
      .then(setGrupos)
      .catch((e: Error) => setErro(e.message));
  }, [eventoAtivo]);

  if (eventoAtivo === undefined) return <p className="cartao">Carregando...</p>;
  if (eventoAtivo === null) {
    return (
      <p className="cartao">
        Nenhum evento ativo. Ative um evento na aba <Link to="/evento">Evento</Link> para lançar resultados.
      </p>
    );
  }

  return (
    <>
      <header className="hero">
        <div>
          <h1>Lançamento por equipe</h1>
          <p>{ABAS[aba][1]}</p>
        </div>
      </header>

      <div className="abas" role="tablist" aria-label="Tipo de lançamento">
        {(Object.keys(ABAS) as Aba[]).map((chave) => (
          <button
            key={chave}
            role="tab"
            id={`aba-${chave}`}
            aria-selected={aba === chave}
            aria-controls="painel-lancamento"
            onClick={() => setParams({ aba: chave }, { replace: true })}
          >
            {ABAS[chave][0]}
          </button>
        ))}
      </div>

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      {listaPendentes.length > 0 && (
        <div className="cartao pendentes" role="status">
          <p>
            {listaPendentes.length === 1 ? '1 lançamento ainda não foi salvo' : `${listaPendentes.length} lançamentos ainda não foram salvos`} por falta de
            conexão: {listaPendentes.map((p) => p.descricao).join('; ')}. Eles estão guardados neste navegador e são enviados quando a conexão voltar. A
            classificação só passa a considerá-los depois disso.
          </p>
          <button className="btn" onClick={envios.reenviar} disabled={envios.reenviando}>
            {envios.reenviando ? 'Reenviando...' : 'Reenviar agora'}
          </button>
        </div>
      )}
      {envios.falha && (
        <p className="erro" role="alert">
          {envios.falha}
        </p>
      )}
      {grupos?.length === 0 && (
        <p className="cartao">
          O evento ainda não tem grupos. Cadastre-os na aba <Link to="/grupos">Grupos</Link>.
        </p>
      )}

      <div id="painel-lancamento" role="tabpanel" aria-labelledby={`aba-${aba}`} className="painel">
        {grupos && grupos.length > 0 && aba === 'colocacao' && <AbaColocacao eventoId={eventoAtivo.id} grupos={grupos} envios={envios} />}
        {grupos && grupos.length > 0 && aba === 'bonus' && <AbaBonusPenalidades eventoId={eventoAtivo.id} grupos={grupos} envios={envios} />}
        {grupos && grupos.length > 0 && aba === 'classificacao' && <AbaClassificacao eventoId={eventoAtivo.id} />}
      </div>
    </>
  );
}

