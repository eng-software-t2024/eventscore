import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api, ApiError, idDoUsuarioNoToken, token, type Schemas } from '../../api/client';
import { useLayout } from '../../components/Layout';
import { iniciais } from '../../texto';
import {
  aplicarPendentes,
  diaInicial,
  filtrar,
  gravarPendentes,
  guardarAoFalhar,
  lerPendentes,
  marcacaoAntiga,
  resumo,
  type Alvo,
  type Marcacao,
  type Pendentes,
  type Presenca,
} from './presencas.ts';
import './Frequencia.css';

type Dia = Schemas['DiaEventoDto'];
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
  // Do token, para as pendências não dependerem do GET /auth/me responder (como nos Lançamentos).
  const [usuarioId] = useState(() => idDoUsuarioNoToken(token.ler()));
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
  // Relógio da tela, atualizado a cada minuto: uma marcação pode passar de 2 h com a página aberta.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const relogio = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(relogio);
  }, []);

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
    // Resposta de um dia que já foi trocado é ignorada: chegando depois da do dia novo, ela deixaria a
    // tela em "Carregando" e mostraria as pendências do dia errado.
    let atual = true;
    api<{ dados: Presenca[] }>(`/eventos/${eventoId}/dias/${diaId}/presencas`)
      .then((r) => {
        if (!atual) return;
        const guardadas = usuarioId ? lerPendentes({ eventoId, usuarioId, diaId }) : {};
        setPendentes(guardadas);
        setLista({ diaId, dados: aplicarPendentes(r.dados, guardadas) });
      })
      .catch((e: Error) => atual && setErro(e.message));
    return () => {
      atual = false;
    };
  }, [eventoId, usuarioId, diaId]);

  // Evento, usuário e dia na tela agora. Um envio guarda para qual dia ele foi feito: se a pessoa trocar de
  // dia enquanto ele está a caminho, o resultado mexe só nas pendências e na lista daquele dia.
  const naTela = useRef<Alvo>(undefined);
  useEffect(() => {
    naTela.current = eventoId && usuarioId && diaId ? { eventoId, usuarioId, diaId } : undefined;
  }, [eventoId, usuarioId, diaId]);
  const estaNaTela = (alvo: Pick<Alvo, 'eventoId' | 'diaId'>) => naTela.current?.eventoId === alvo.eventoId && naTela.current?.diaId === alvo.diaId;

  // Lê e grava as pendências do dia do envio (não as da tela); a tela só muda se ainda for esse dia.
  const atualizarPendentes = useCallback((alvo: Alvo, mudar: (atual: Pendentes) => Pendentes) => {
    const novo = mudar(lerPendentes(alvo));
    gravarPendentes(alvo, novo);
    if (estaNaTela(alvo)) setPendentes(novo);
  }, []);

  // Marcações a caminho (`diaId:participanteId`): o reenvio não manda outra da mesma pessoa junto, para um
  // valor antigo não chegar depois do novo.
  const emEnvio = useRef(new Set<string>());

  /**
   * Envia uma marcação; devolve a falha, ou `undefined` se foi salva. Sem usuário (token ilegível) não há
   * fila onde guardar: a falha desfaz a marcação. No reenvio, a marcação mantém a hora em que foi guardada.
   */
  const enviar = useCallback(
    async (alvo: Pick<Alvo, 'eventoId' | 'diaId'> & { usuarioId?: number }, participanteId: number, marcacao: Marcacao): Promise<unknown> => {
      const { presente } = marcacao;
      const fila = alvo.usuarioId ? { ...alvo, usuarioId: alvo.usuarioId } : undefined;
      const chave = `${alvo.diaId}:${participanteId}`;
      emEnvio.current.add(chave);
      setSalvando((s) => new Set(s).add(participanteId));
      try {
        await api(`/eventos/${alvo.eventoId}/dias/${alvo.diaId}/presencas/${participanteId}`, {
          method: 'PUT',
          body: JSON.stringify({ presente }),
        });
        if (fila) atualizarPendentes(fila, (atual) => sem(atual, participanteId));
        return undefined;
      } catch (e) {
        if (fila && guardarAoFalhar(e)) {
          atualizarPendentes(fila, (atual) => ({ ...atual, [participanteId]: marcacao }));
          // Sem conexão o aviso de pendentes já explica; com o servidor respondendo erro, mostra o motivo.
          const semConexao = e instanceof ApiError && e.status === 0;
          if (!semConexao && estaNaTela(alvo)) setErro(`${(e as Error).message} A marcação ficou guardada e será reenviada.`);
        } else {
          // Recusa da API (ex.: participante de outro evento): desfaz a marcação e mostra o motivo.
          if (fila) atualizarPendentes(fila, (atual) => sem(atual, participanteId));
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
  // pendências do dia a cada passo, então sai sempre o valor mais novo de cada pessoa. As guardadas há
  // mais de 2 h só saem pelo botão (`incluirAntigas`).
  const reenviando = useRef(false);
  const reenviar = useCallback(
    async (incluirAntigas: boolean) => {
      const alvo = naTela.current;
      if (!alvo || reenviando.current) return;
      reenviando.current = true;
      try {
        const tentados = new Set<number>();
        for (;;) {
          // Trocou de dia: para; o dia novo tem a própria vez.
          if (!estaNaTela(alvo)) break;
          const guardadas = lerPendentes(alvo);
          const id = Object.keys(guardadas)
            .map(Number)
            .find(
              (i) =>
                !tentados.has(i) && !emEnvio.current.has(`${alvo.diaId}:${i}`) && (incluirAntigas || !marcacaoAntiga(guardadas[i], Date.now())),
            );
          if (id === undefined) break;
          tentados.add(id);
          const falha = await enviar(alvo, id, guardadas[id]);
          // Sem conexão ou sessão expirada, as outras falhariam do mesmo jeito (e o 401 já leva ao login).
          if (falha instanceof ApiError && (falha.status === 0 || falha.status === 401)) break;
        }
      } finally {
        reenviando.current = false;
      }
    },
    [enviar],
  );

  // Com algo pendente, reenvia sozinho ao abrir o dia, quando a conexão volta, quando a aba fica visível e
  // a cada 30 s (com o servidor fora do ar o navegador continua online, e só o intervalo tenta de novo).
  const temPendentes = Object.keys(pendentes).length > 0;
  useEffect(() => {
    if (!temPendentes) return;
    const tentar = () => void reenviar(false);
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

  const qtdAntigas = Object.values(pendentes).filter((m) => marcacaoAntiga(m, agora)).length;

  // Só o botão limpa a mensagem (a tentativa automática não apaga o motivo de uma recusa) e só ele leva as
  // marcações antigas, depois de confirmar.
  function reenviarAgora() {
    if (
      qtdAntigas > 0 &&
      !window.confirm('Há marcações guardadas há mais de 2 horas. Reenviá-las pode desfazer correções feitas depois em outro computador. Reenviar mesmo assim?')
    )
      return;
    setErro('');
    void reenviar(true);
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
    void enviar({ eventoId, usuarioId, diaId }, p.participanteId, { presente, criadoEm: new Date().toISOString() });
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
            {qtdAntigas > 0 && (
              <strong>
                {' '}
                {qtdAntigas === 1
                  ? '1 delas está guardada há mais de 2 horas e não sai sozinha'
                  : `${qtdAntigas} delas estão guardadas há mais de 2 horas e não saem sozinhas`}
                : confira antes de usar "Reenviar agora".
              </strong>
            )}
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
                        {p.participanteId in pendentes && (
                          <small className="nao-salvo">{marcacaoAntiga(pendentes[p.participanteId], agora) ? 'não salvo · antigo' : 'não salvo'}</small>
                        )}
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
