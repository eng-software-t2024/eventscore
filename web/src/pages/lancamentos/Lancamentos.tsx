import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../../api/client';
import { useLayout } from '../../components/Layout';
import AbaBonusPenalidades from './AbaBonusPenalidades';
import AbaClassificacao from './AbaClassificacao';
import AbaColocacao from './AbaColocacao';
import type { Grupo } from './comum';
import { comPendente, gravarPendentes, lerPendentes, semConexao, semPendente, type EnvioPendente, type Pendentes } from './pendentes.ts';
import './Lancamentos.css';

/** O que as abas recebem para guardar um envio que não chegou à API (RNF04). */
export type EnviosPendentes = { pendentes: Pendentes; guardar: (envio: EnvioPendente) => void; descartar: (caminho: string) => void };

/**
 * Envios guardados no navegador e reenviados quando a conexão volta. Um envio recusado pela API
 * (por exemplo, 422 porque o cenário mudou) sai da fila e a mensagem aparece, para não travar a fila.
 */
function useEnviosPendentes(eventoId: number | undefined) {
  const [estado, setEstado] = useState<{ eventoId?: number; pendentes: Pendentes }>({ pendentes: {} });
  const [reenviando, setReenviando] = useState(false);
  const [falha, setFalha] = useState('');

  // Evento ativo mudou (ou acabou de carregar): passa a mostrar o que está guardado para ele.
  if (estado.eventoId !== eventoId) setEstado({ eventoId, pendentes: eventoId ? lerPendentes(eventoId) : {} });

  const mudar = useCallback(
    (alterar: (atual: Pendentes) => Pendentes) => {
      if (!eventoId) return;
      // O navegador guarda a fila; a tela só espelha o que foi gravado.
      const novo = alterar(lerPendentes(eventoId));
      gravarPendentes(eventoId, novo);
      setEstado({ eventoId, pendentes: novo });
    },
    [eventoId],
  );

  const guardar = useCallback((envio: EnvioPendente) => mudar((atual) => comPendente(atual, envio)), [mudar]);
  const descartar = useCallback((caminho: string) => mudar((atual) => semPendente(atual, caminho)), [mudar]);

  const reenviar = useCallback(async () => {
    if (!eventoId) return;
    setReenviando(true);
    setFalha('');
    try {
      for (const envio of Object.values(lerPendentes(eventoId))) {
        try {
          await api(envio.caminho, { method: 'PUT', body: JSON.stringify(envio.corpo) });
          descartar(envio.caminho);
        } catch (e) {
          if (semConexao(e)) return setFalha('Ainda sem conexão. Os lançamentos continuam guardados.');
          descartar(envio.caminho);
          setFalha(`${envio.descricao} não foi aceito: ${(e as Error).message}`);
        }
      }
    } finally {
      setReenviando(false);
    }
  }, [eventoId, descartar]);

  // Volta a conexão: reenvia sozinho o que ficou pendente.
  useEffect(() => {
    window.addEventListener('online', reenviar);
    return () => window.removeEventListener('online', reenviar);
  }, [reenviar]);

  return { pendentes: estado.pendentes, guardar, descartar, reenviar, reenviando, falha };
}

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

