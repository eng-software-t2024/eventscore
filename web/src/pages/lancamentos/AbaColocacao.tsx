import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client';
import type { Desafio } from '../desafios/regras.ts';
import { ListaHistorico, PontoCor, type Grupo } from './comum';
import { aplicarColocacoesPendentes } from './pendentes.ts';
import { corpoColocacoes, pontosDaColocacao, validarColocacoes, type Auditoria, type Resultado } from './regras.ts';
import type { EnviosPendentes } from './useEnviosPendentes.ts';

type Linha = { id: number | null; grupoId: number; colocacao: number | null; ausente: boolean };

/** Aba 1 (RF08, RF09): colocação de cada grupo no desafio, salva de uma vez com PUT idempotente. */
export default function AbaColocacao({ eventoId, grupos, envios }: { eventoId: number; grupos: Grupo[]; envios: EnviosPendentes }) {
  const base = `/eventos/${eventoId}`;
  const caminhoResultados = (id: number) => `${base}/desafios/${id}/resultados`;
  const [desafios, setDesafios] = useState<Desafio[]>();
  const [desafioId, setDesafioId] = useState<number>();
  const [linhas, setLinhas] = useState<{ desafioId: number; dados: Linha[] }>();
  const [historico, setHistorico] = useState<{ id: number; itens?: Auditoria[] }>();
  const [erro, setErro] = useState('');
  const [salvo, setSalvo] = useState<'salvo' | 'guardado'>();
  const [salvando, setSalvando] = useState(false);
  // Envio deste desafio que está na fila. A fila nunca recarrega o formulário (apagaria o que está sendo
  // digitado); quando o envio sai dela, só os ids das linhas são atualizados, para o "Histórico".
  const pendenteId = desafioId ? envios.pendentes[caminhoResultados(desafioId)]?.id : undefined;
  const guardadosRef = useRef(envios.guardados);
  useEffect(() => {
    guardadosRef.current = envios.guardados;
  }, [envios.guardados]);

  useEffect(() => {
    api<Desafio[]>(`${base}/desafios`)
      .then((lista) => {
        setDesafios(lista);
        setDesafioId((atual) => atual ?? lista[0]?.id);
      })
      .catch((e: Error) => setErro(e.message));
  }, [base]);

  useEffect(() => {
    if (!desafioId) return;
    const caminho = `${base}/desafios/${desafioId}/resultados`;
    // Resposta de uma carga que já foi substituída (trocou o desafio) é ignorada.
    let atual = true;
    api<Resultado[]>(caminho)
      .then((resultados) => {
        if (!atual) return;
        setErro('');
        setLinhas({
          desafioId,
          // Uma linha por grupo do evento, mesmo que a API ainda não tenha resultado para ele.
          dados: aplicarColocacoesPendentes(
            grupos.map((g) => {
              const r = resultados.find((x) => x.grupoId === g.id);
              return { id: r?.id ?? null, grupoId: g.id, colocacao: r?.colocacao ?? null, ausente: r?.ausente ?? false };
            }),
            // O que ficou guardado sem conexão aparece por cima do que veio da API.
            guardadosRef.current()[caminho],
          ),
        });
      })
      .catch((e: Error) => atual && setErro(e.message));
    return () => {
      atual = false;
    };
  }, [base, desafioId, grupos]);

  // O envio deste desafio saiu da fila (enviado ou recusado): busca só os ids, sem tocar nas colocações.
  const pendenteAnterior = useRef(pendenteId);
  useEffect(() => {
    const saiu = pendenteAnterior.current !== undefined && pendenteId === undefined;
    pendenteAnterior.current = pendenteId;
    if (!saiu || !desafioId) return;
    let atual = true;
    api<Resultado[]>(`${base}/desafios/${desafioId}/resultados`)
      .then((resultados) => {
        if (!atual) return;
        setLinhas((l) =>
          l?.desafioId === desafioId
            ? { ...l, dados: l.dados.map((x) => ({ ...x, id: resultados.find((r) => r.grupoId === x.grupoId)?.id ?? x.id })) }
            : l,
        );
      })
      // Só os ids do "Histórico": se falhar, eles chegam na próxima carga do desafio.
      .catch(() => {});
    return () => {
      atual = false;
    };
  }, [base, desafioId, pendenteId]);

  const desafio = desafios?.find((d) => d.id === desafioId);
  const dados = linhas?.desafioId === desafioId ? linhas?.dados : undefined;
  const nome = (id: number) => grupos.find((g) => g.id === id)?.nome ?? `grupo ${id}`;
  const maximo = Math.max(1, ...(desafio?.pontosColocacao.map((p) => p.pontos) ?? []));

  function mudar(grupoId: number, valor: string) {
    setSalvo(undefined);
    setLinhas(
      (l) =>
        l && {
          ...l,
          dados: l.dados.map((x) =>
            x.grupoId !== grupoId ? x : valor === 'ausente' ? { ...x, ausente: true, colocacao: null } : { ...x, ausente: false, colocacao: valor ? Number(valor) : null },
          ),
        },
    );
  }

  async function salvar() {
    if (!dados || !desafioId) return;
    const problema = validarColocacoes(dados, nome);
    if (problema) return setErro(problema);
    setErro('');
    setSalvando(true);
    const caminho = caminhoResultados(desafioId);
    const corpo = corpoColocacoes(dados);
    try {
      // Passa pela fila: se a conexão cair, o envio fica guardado e sai em ordem depois (RNF04).
      const resultado = await envios.enviar({ caminho, corpo, descricao: `colocações de ${desafio?.nome ?? 'um desafio'}` });
      if (resultado.status === 'recusado') return setErro(resultado.erro.message);
      if (resultado.status === 'erro-servidor')
        return setErro(`${resultado.erro.message} As colocações ficaram guardadas neste navegador e serão reenviadas.`);
      if (resultado.status === 'substituido') return;
      // Ao sair da fila, a tela recarrega os resultados (efeito acima), e os ids novos ativam o "Histórico".
      setSalvo(resultado.status);
    } finally {
      setSalvando(false);
    }
  }

  async function verHistorico(id: number) {
    if (historico?.id === id) return setHistorico(undefined);
    setHistorico({ id });
    try {
      const itens = await api<Auditoria[]>(`/auditoria?entidade=RESULTADO_DESAFIO&registroId=${id}`);
      setHistorico({ id, itens });
    } catch (e) {
      setHistorico(undefined);
      setErro((e as Error).message);
    }
  }

  if (desafios?.length === 0) {
    return (
      <p className="cartao">
        Nenhum desafio cadastrado. Cadastre-os na aba <Link to="/desafios">Desafios</Link>.
      </p>
    );
  }

  return (
    <>
      <section className="cartao">
        <label className="campo">
          Desafio
          <select className="seletor" value={desafioId ?? ''} onChange={(e) => setDesafioId(Number(e.target.value))}>
            {desafios?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>
        </label>
      </section>

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      {salvo === 'salvo' && (
        <p className="sucesso" role="status">
          Colocações salvas. A classificação já considera este lançamento.
        </p>
      )}
      {salvo === 'guardado' && pendenteId && (
        <p className="aviso" role="status">
          Sem conexão com o servidor: as colocações ficaram guardadas neste navegador e serão enviadas quando a conexão voltar.
        </p>
      )}

      <section className="cartao tabela-cartao" aria-busy={!dados}>
        {!dados && <p className="dica">Carregando...</p>}
        {dados && (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Equipe</th>
                  <th>Colocação</th>
                  <th>Pontos</th>
                  <th>
                    <span className="sr-only">Histórico</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {dados.map((l) => {
                  const grupo = grupos.find((g) => g.id === l.grupoId);
                  const pontos = l.ausente ? null : pontosDaColocacao(l.colocacao, desafio?.pontosColocacao ?? []);
                  return (
                    <Fragment key={l.grupoId}>
                      <tr>
                        <td>
                          <span className="pessoa">
                            <PontoCor cor={grupo?.cor ?? '#999999'} />
                            {grupo?.nome}
                          </span>
                        </td>
                        <td>
                          <select
                            className={`seletor-colocacao${l.ausente ? ' ausente' : ''}`}
                            value={l.ausente ? 'ausente' : (l.colocacao ?? '')}
                            onChange={(e) => mudar(l.grupoId, e.target.value)}
                            aria-label={`Colocação de ${grupo?.nome}`}
                          >
                            <option value="">—</option>
                            {grupos.map((_, i) => (
                              <option key={i} value={i + 1}>
                                {i + 1}º
                              </option>
                            ))}
                            <option value="ausente">Ausente</option>
                          </select>
                        </td>
                        <td>
                          {pontos === null || l.colocacao === null ? (
                            '—'
                          ) : (
                            <span className="pontos-barra">
                              <strong>{pontos}</strong>
                              <span className="barra">
                                <span style={{ width: `${(pontos / maximo) * 100}%` }} />
                              </span>
                            </span>
                          )}
                        </td>
                        <td>
                          {l.id !== null && (
                            <button type="button" className="btn btn-contorno btn-pequeno" onClick={() => verHistorico(l.id!)} aria-expanded={historico?.id === l.id}>
                              Histórico
                            </button>
                          )}
                        </td>
                      </tr>
                      {historico?.id === l.id && l.id !== null && (
                        <tr className="historico">
                          <td colSpan={4}>
                            <ListaHistorico itens={historico.itens} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="rodape-acao">
          <small>Grupo ausente recebe 0 ponto e não ocupa colocação (RF09).</small>
          <button className="btn" onClick={salvar} disabled={!dados || salvando}>
            {salvando ? 'Salvando...' : 'Salvar colocações'}
          </button>
        </div>
      </section>
    </>
  );
}
