import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api, ApiError, type Schemas } from '../../api/client';
import { useLayout } from '../../components/Layout';
import { iniciais } from '../../texto';
import { aplicarPendentes, diaInicial, filtrar, gravarPendentes, guardarAoFalhar, lerPendentes, resumo, type Pendentes, type Presenca } from './presencas.ts';
import './Frequencia.css';

type Dia = Schemas['DiaEventoDto'];
type Alvo = { eventoId: number; diaId: number };
const formatarData = (data: string) => data.split('-').reverse().join('/');
const doisDigitos = (n: number) => String(n).padStart(2, '0');
const sem = (mapa: Pendentes, id: number) => {
  const copia = { ...mapa };
  delete copia[id];
  return copia;
};

// Cada marcação grava na hora (PUT idempotente), então o botão "Salvar frequência" e a coluna
// "Horário" do mock saíram. Não há marcação em lote: o RF07 proíbe.
export default function Frequencia() {
  const { eventoAtivo } = useLayout();
  const eventoId = eventoAtivo?.id;
  const [dias, setDias] = useState<Dia[]>();
  const [diaId, setDiaId] = useState<number>();
  // A lista guarda de qual dia ela é; ao trocar de dia, a anterior deixa de valer até a nova chegar.
  const [lista, setLista] = useState<{ diaId: number; dados: Presenca[] }>();
  const dados = lista && lista.diaId === diaId ? lista.dados : undefined;
  const [pendentes, setPendentes] = useState<Pendentes>({});
  const [salvando, setSalvando] = useState<Set<number>>(new Set());
  const [grupoId, setGrupoId] = useState('');
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!eventoId) return;
    api<Dia[]>(`/eventos/${eventoId}/dias`)
      .then((lista) => {
        const ordenados = [...lista].sort((a, b) => a.numeroDia - b.numeroDia);
        setDias(ordenados);
        setDiaId(diaInicial(ordenados, new Date().toLocaleDateString('sv-SE'))?.id);
      })
      .catch((e: Error) => setErro(e.message));
  }, [eventoId]);

  useEffect(() => {
    if (!eventoId || !diaId) return;
    api<{ dados: Presenca[] }>(`/eventos/${eventoId}/dias/${diaId}/presencas`)
      .then((r) => {
        const guardadas = lerPendentes(eventoId, diaId);
        setPendentes(guardadas);
        setLista({ diaId, dados: aplicarPendentes(r.dados, guardadas) });
      })
      .catch((e: Error) => setErro(e.message));
  }, [eventoId, diaId]);

  // Evento e dia na tela agora. Um envio guarda para qual dia ele foi feito: se a pessoa trocar de dia
  // enquanto ele está a caminho, o resultado mexe só nas pendências e na lista daquele dia.
  const naTela = useRef<Alvo>(undefined);
  useEffect(() => {
    naTela.current = eventoId && diaId ? { eventoId, diaId } : undefined;
  }, [eventoId, diaId]);
  const estaNaTela = (alvo: Alvo) => naTela.current?.eventoId === alvo.eventoId && naTela.current?.diaId === alvo.diaId;

  // Lê e grava as pendências do dia do envio (não as da tela); a tela só muda se ainda for esse dia.
  const atualizarPendentes = useCallback((alvo: Alvo, mudar: (atual: Pendentes) => Pendentes) => {
    const novo = mudar(lerPendentes(alvo.eventoId, alvo.diaId));
    gravarPendentes(alvo.eventoId, alvo.diaId, novo);
    if (estaNaTela(alvo)) setPendentes(novo);
  }, []);

  // Marcações a caminho (`diaId:participanteId`): o reenvio não manda outra da mesma pessoa junto, para um
  // valor antigo não chegar depois do novo.
  const emEnvio = useRef(new Set<string>());

  /** Envia uma marcação; devolve a falha, ou `undefined` se foi salva. */
  const enviar = useCallback(
    async (alvo: Alvo, participanteId: number, presente: boolean): Promise<unknown> => {
      const chave = `${alvo.diaId}:${participanteId}`;
      emEnvio.current.add(chave);
      setSalvando((s) => new Set(s).add(participanteId));
      try {
        await api(`/eventos/${alvo.eventoId}/dias/${alvo.diaId}/presencas/${participanteId}`, {
          method: 'PUT',
          body: JSON.stringify({ presente }),
        });
        atualizarPendentes(alvo, (atual) => sem(atual, participanteId));
        return undefined;
      } catch (e) {
        if (guardarAoFalhar(e)) {
          atualizarPendentes(alvo, (atual) => ({ ...atual, [participanteId]: presente }));
          // Sem conexão o aviso de pendentes já explica; com o servidor respondendo erro, mostra o motivo.
          const semConexao = e instanceof ApiError && e.status === 0;
          if (!semConexao && estaNaTela(alvo)) setErro(`${(e as Error).message} A marcação ficou guardada e será reenviada.`);
        } else {
          // Recusa da API (ex.: participante de outro evento): desfaz a marcação e mostra o motivo.
          atualizarPendentes(alvo, (atual) => sem(atual, participanteId));
          setLista((l) =>
            l && l.diaId === alvo.diaId
              ? { ...l, dados: l.dados.map((p) => (p.participanteId === participanteId ? { ...p, presente: !presente } : p)) }
              : l,
          );
          if (estaNaTela(alvo)) setErro((e as Error).message);
        }
        return e;
      } finally {
        emEnvio.current.delete(chave);
        setSalvando((s) => {
          const novo = new Set(s);
          novo.delete(participanteId);
          return novo;
        });
      }
    },
    [atualizarPendentes],
  );

  // Um reenvio por vez: o intervalo, a volta da conexão e o botão podem disparar juntos. Ele relê as
  // pendências do dia a cada passo, então sai sempre o valor mais novo de cada pessoa.
  const reenviando = useRef(false);
  const reenviar = useCallback(async () => {
    const alvo = naTela.current;
    if (!alvo || reenviando.current) return;
    reenviando.current = true;
    try {
      const tentados = new Set<number>();
      for (;;) {
        // Trocou de dia: para; o dia novo tem a própria vez.
        if (!estaNaTela(alvo)) break;
        const guardadas = lerPendentes(alvo.eventoId, alvo.diaId);
        const id = Object.keys(guardadas)
          .map(Number)
          .find((i) => !tentados.has(i) && !emEnvio.current.has(`${alvo.diaId}:${i}`));
        if (id === undefined) break;
        tentados.add(id);
        const falha = await enviar(alvo, id, guardadas[id]);
        // Sem conexão ou sessão expirada, as outras falhariam do mesmo jeito (e o 401 já leva ao login).
        if (falha instanceof ApiError && (falha.status === 0 || falha.status === 401)) break;
      }
    } finally {
      reenviando.current = false;
    }
  }, [enviar]);

  // Com algo pendente, reenvia sozinho ao abrir o dia, quando a conexão volta, quando a aba fica visível e
  // a cada 30 s (com o servidor fora do ar o navegador continua online, e só o intervalo tenta de novo).
  const temPendentes = Object.keys(pendentes).length > 0;
  useEffect(() => {
    if (!temPendentes) return;
    const tentar = () => void reenviar();
    const aoVoltarParaAba = () => {
      if (document.visibilityState === 'visible') tentar();
    };
    const primeira = setTimeout(tentar, 0);
    const intervalo = setInterval(tentar, 30_000);
    window.addEventListener('online', tentar);
    document.addEventListener('visibilitychange', aoVoltarParaAba);
    return () => {
      clearTimeout(primeira);
      clearInterval(intervalo);
      window.removeEventListener('online', tentar);
      document.removeEventListener('visibilitychange', aoVoltarParaAba);
    };
  }, [temPendentes, reenviar, diaId]);

  // Só o botão limpa a mensagem: a tentativa automática não apaga o motivo de uma recusa que está na tela.
  function reenviarAgora() {
    setErro('');
    void reenviar();
  }

  if (eventoAtivo === undefined) return <p className="cartao">Carregando...</p>;
  if (eventoAtivo === null) {
    return (
      <p className="cartao">
        Nenhum evento ativo. Ative um evento na aba <Link to="/evento">Evento</Link> para registrar a frequência.
      </p>
    );
  }

  function marcar(p: Presenca, presente: boolean) {
    setErro('');
    if (!eventoId || !diaId) return;
    setLista((l) => l && { ...l, dados: l.dados.map((x) => (x.participanteId === p.participanteId ? { ...x, presente } : x)) });
    void enviar({ eventoId, diaId }, p.participanteId, presente);
  }

  const grupos = [...new Map((dados ?? []).map((p) => [p.grupoId, p.grupo])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const visiveis = dados ? filtrar(dados, grupoId, busca) : [];
  const contagem = resumo(visiveis);
  const pct = (n: number) => `${contagem.total ? (n / contagem.total) * 100 : 0}%`;
  const qtdPendentes = Object.keys(pendentes).length;

  return (
    <>
      <header className="hero">
        <div>
          <h1>Frequência diária</h1>
          <p>Marque quem esteve presente em cada dia. Cada marcação é salva na hora.</p>
        </div>
      </header>

      <div className="filtros-frequencia">
        <label className="campo">
          Dia
          <select value={diaId ?? ''} onChange={(e) => setDiaId(Number(e.target.value))} disabled={!dias?.length}>
            {dias?.map((d) => (
              <option key={d.id} value={d.id}>
                Dia {doisDigitos(d.numeroDia)} · {formatarData(d.data)}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          Grupo
          <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
            <option value="">Todos</option>
            {grupos.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          Buscar aluno
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou matrícula" />
        </label>
      </div>

      {dias?.length === 0 && (
        <p className="cartao">
          O evento ainda não tem dias cadastrados. Cadastre-os na aba <Link to="/evento">Evento</Link>.
        </p>
      )}

      {qtdPendentes > 0 && (
        <div className="cartao pendentes" role="status">
          <span>
            {qtdPendentes === 1 ? '1 marcação ainda não foi salva' : `${qtdPendentes} marcações ainda não foram salvas`}: a conexão caiu ou o
            servidor não respondeu. Elas ficam guardadas neste navegador e são reenviadas sozinhas.
          </span>
          <button className="btn" onClick={reenviarAgora} disabled={salvando.size > 0}>
            Reenviar agora
          </button>
        </div>
      )}

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      <div className="contagem contagem-3">
        <div className="cartao">
          <small>Total</small>
          <strong>{doisDigitos(contagem.total)}</strong>
        </div>
        <div className="cartao">
          <small>Presentes</small>
          <strong className="contagem-ok">{doisDigitos(contagem.presentes)}</strong>
          <span className="barra">
            <span style={{ width: pct(contagem.presentes) }} />
          </span>
        </div>
        <div className="cartao">
          <small>Ausentes</small>
          <strong className="contagem-erro">{doisDigitos(contagem.ausentes)}</strong>
          <span className="barra barra-erro">
            <span style={{ width: pct(contagem.ausentes) }} />
          </span>
        </div>
      </div>

      <section className="cartao tabela-cartao" aria-busy={!dados}>
        {!dados && diaId && <p className="dica">Carregando a lista do dia...</p>}
        {dados && visiveis.length === 0 && <p className="dica">Nenhum participante encontrado.</p>}
        {visiveis.length > 0 && (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Matrícula</th>
                  <th>Aluno</th>
                  <th>Grupo</th>
                  <th>Presente</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((p) => (
                  <tr key={p.participanteId}>
                    <td>{p.matricula}</td>
                    <td>
                      <span className="pessoa">
                        <span className="avatar" aria-hidden="true">
                          {iniciais(p.nome)}
                        </span>
                        {p.nome}
                      </span>
                    </td>
                    <td>{p.grupo}</td>
                    <td>
                      <label className="presenca">
                        <input
                          type="checkbox"
                          checked={p.presente}
                          disabled={salvando.has(p.participanteId)}
                          onChange={(e) => marcar(p, e.target.checked)}
                          aria-label={`Presença de ${p.nome}`}
                        />
                        {p.participanteId in pendentes && <small className="nao-salvo">não salvo</small>}
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
