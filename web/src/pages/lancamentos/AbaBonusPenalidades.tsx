import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client';
import type { Configuracao } from '../configuracao/regras.ts';
import { ListaHistorico, PontoCor, type Grupo } from './comum';
import { tipoDeFalha } from '../../api/falhas.ts';
import { bonusPendente, telaMostraRecusado } from './pendentes.ts';
import { juntarHistoricos, montarBonificacao, montarPenalidade, type Auditoria, type Bonificacao, type Penalidade } from './regras.ts';
import type { EnviosPendentes } from './useEnviosPendentes.ts';

const PENALIDADE_VAZIA = { grupoId: '', pontos: '', descricao: '', justificativa: '' };

/** Aba 2 (RF10, RF11): bonificação por item com teto e penalidade com justificativa. */
export default function AbaBonusPenalidades({ eventoId, grupos, envios }: { eventoId: number; grupos: Grupo[]; envios: EnviosPendentes }) {
  const base = `/eventos/${eventoId}`;
  // Lida por ref: a fila mudar (ou o usuário carregar) não pode recarregar os valores que estão sendo digitados.
  const guardadosRef = useRef(envios.guardados);
  useEffect(() => {
    guardadosRef.current = envios.guardados;
  }, [envios.guardados]);
  const [config, setConfig] = useState<Configuracao>();
  // Valor digitado por grupo e item: grupoId -> itemBonificacaoId -> texto.
  const [bonus, setBonus] = useState<Record<number, Record<number, string>>>({});
  const [penalidades, setPenalidades] = useState<Penalidade[]>();
  const [penalidade, setPenalidade] = useState(PENALIDADE_VAZIA);
  const [editando, setEditando] = useState<Penalidade>();
  const [ocupado, setOcupado] = useState<string>();
  const [aviso, setAviso] = useState<{ tipo: 'erro' | 'sucesso' | 'aviso'; texto: string }>();
  // Histórico aberto (RF18): `bonus-<grupoId>` ou `penalidade-<id>`; sem `itens`, ainda carregando.
  const [historico, setHistorico] = useState<{ chave: string; itens?: (Auditoria & { rotulo?: string })[] }>();

  const carregar = useCallback(() => {
    Promise.all([api<Configuracao>(`${base}/configuracao`), api<Bonificacao[]>(`${base}/bonificacoes`), api<Penalidade[]>(`${base}/penalidades`)])
      .then(([cfg, bonificacoes, pens]) => {
        setConfig(cfg);
        const fila = guardadosRef.current();
        // Por grupo do evento: a API só devolve grupos que já têm bônus, e um bônus guardado sem
        // conexão pode ser de um grupo que ainda não tem. O guardado aparece por cima do que veio da API.
        setBonus(
          Object.fromEntries(
            grupos.map((g) => {
              const daApi = bonificacoes.find((b) => b.grupoId === g.id);
              return [
                g.id,
                bonusPendente(fila[`${base}/bonificacoes/${g.id}`]) ??
                  Object.fromEntries((daApi?.itens ?? []).map((i) => [i.itemBonificacaoId, String(i.valor)])),
              ];
            }),
          ),
        );
        setPenalidades(pens);
      })
      .catch((e: Error) => setAviso({ tipo: 'erro', texto: e.message }));
  }, [base, grupos]);

  useEffect(carregar, [carregar]);

  // RNF04: a API recusou no reenvio automático o bônus de um grupo. Se a linha ainda mostra exatamente o
  // que foi recusado, volta ao que está salvo; o motivo aparece no aviso da fila, acima das abas.
  const recusasTratadas = useRef(new Set<string>());
  useEffect(() => {
    if (!config) return;
    const mostraRecusado = (grupoId: number, valores: Record<number, string> | undefined) => {
      const recusado = envios.recusados[`${base}/bonificacoes/${grupoId}`];
      const naTela = montarBonificacao(valores ?? {}, config.itensBonificacao);
      return !!recusado && 'dados' in naTela && telaMostraRecusado(naTela.dados, recusado);
    };
    const voltar = grupos
      .filter((g) => {
        const recusado = envios.recusados[`${base}/bonificacoes/${g.id}`];
        if (!recusado || recusasTratadas.current.has(recusado.id)) return false;
        recusasTratadas.current.add(recusado.id);
        return mostraRecusado(g.id, bonus[g.id]);
      })
      .map((g) => g.id);
    if (!voltar.length) return;
    api<Bonificacao[]>(`${base}/bonificacoes`)
      .then((bonificacoes) =>
        setBonus((atual) => {
          const novo = { ...atual };
          for (const grupoId of voltar) {
            // O usuário mexeu na linha enquanto a busca acontecia: o que ele digitou fica.
            if (!mostraRecusado(grupoId, atual[grupoId])) continue;
            const daApi = bonificacoes.find((b) => b.grupoId === grupoId);
            novo[grupoId] = Object.fromEntries((daApi?.itens ?? []).map((i) => [i.itemBonificacaoId, String(i.valor)]));
          }
          return novo;
        }),
      )
      // Se falhar, a linha continua com o valor recusado, como antes; a próxima carga da aba corrige.
      .catch(() => {});
  }, [envios.recusados, config, grupos, base, bonus]);

  if (!config) return aviso ? <p className="erro">{aviso.texto}</p> : <p className="cartao">Carregando...</p>;

  const nome = (id: number) => grupos.find((g) => g.id === id)?.nome ?? `grupo ${id}`;
  const totalBonus = (grupoId: number) =>
    config.itensBonificacao.reduce((soma, item) => soma + (Number(bonus[grupoId]?.[item.id ?? -1]) || 0), 0);

  async function registrarBonus(grupoId: number) {
    const resultado = montarBonificacao(bonus[grupoId] ?? {}, config!.itensBonificacao);
    if ('erro' in resultado) return setAviso({ tipo: 'erro', texto: `${nome(grupoId)} · ${resultado.erro}` });
    setOcupado(`bonus-${grupoId}`);
    try {
      // Passa pela fila: se a conexão cair, o envio fica guardado e sai em ordem depois (RNF04).
      const r = await envios.enviar({ caminho: `${base}/bonificacoes/${grupoId}`, corpo: resultado.dados, descricao: `bônus de ${nome(grupoId)}` });
      if (r.status === 'recusado') setAviso({ tipo: 'erro', texto: r.erro.message });
      else if (r.status === 'erro-servidor')
        setAviso({ tipo: 'erro', texto: `${r.erro.message} O bônus de ${nome(grupoId)} ficou guardado neste navegador e será reenviado.` });
      else if (r.status === 'guardado')
        setAviso({ tipo: 'aviso', texto: `Sem conexão com o servidor: o bônus de ${nome(grupoId)} ficou guardado e será enviado quando a conexão voltar.` });
      else if (r.status === 'salvo') {
        setAviso({ tipo: 'sucesso', texto: `Bônus de ${nome(grupoId)} registrado.` });
        // O histórico aberto ficaria sem a alteração que acabou de ser feita.
        fecharHistorico(`bonus-${grupoId}`);
      }
    } finally {
      setOcupado(undefined);
    }
  }

  async function salvarPenalidade(e: FormEvent) {
    e.preventDefault();
    const resultado = montarPenalidade(penalidade, config!.penalidadeMin, config!.penalidadeMax);
    if ('erro' in resultado) return setAviso({ tipo: 'erro', texto: resultado.erro });
    setOcupado('penalidade');
    try {
      const corpo = JSON.stringify(resultado.dados);
      if (editando) await api(`${base}/penalidades/${editando.id}`, { method: 'PATCH', body: corpo });
      else await api(`${base}/penalidades`, { method: 'POST', body: corpo });
      setAviso({ tipo: 'sucesso', texto: editando ? 'Penalidade corrigida.' : `Penalidade aplicada a ${nome(resultado.dados.grupoId)}.` });
      if (editando) fecharHistorico(`penalidade-${editando.id}`);
      cancelarEdicao();
      carregar();
    } catch (err) {
      // Penalidade é POST, que não é idempotente: reenviar sozinho poderia aplicá-la duas vezes.
      const texto = tipoDeFalha(err) === 'conexao'
        ? 'Sem conexão: a penalidade pode não ter sido registrada. O formulário continua preenchido; quando a conexão voltar, confira a lista abaixo antes de enviar de novo.'
        : (err as Error).message;
      setAviso({ tipo: 'erro', texto });
    } finally {
      setOcupado(undefined);
    }
  }

  /** Fecha o histórico de um lançamento, se for o que está aberto. */
  const fecharHistorico = (chave: string) => setHistorico((h) => (h?.chave === chave ? undefined : h));

  /** Abre ou fecha o histórico; a resposta de um histórico que já foi fechado ou trocado é ignorada. */
  async function abrirHistorico(chave: string, buscar: () => Promise<(Auditoria & { rotulo?: string })[]>) {
    if (historico?.chave === chave) return setHistorico(undefined);
    setHistorico({ chave });
    try {
      const itens = await buscar();
      setHistorico((h) => (h?.chave === chave ? { chave, itens } : h));
    } catch (e) {
      setHistorico((h) => (h?.chave === chave ? undefined : h));
      setAviso({ tipo: 'erro', texto: (e as Error).message });
    }
  }

  // Os ids dos itens vêm de uma consulta nova: o bônus pode ter sido salvo agora (ou pela fila) e ganhado id.
  const historicoBonus = (grupoId: number) =>
    abrirHistorico(`bonus-${grupoId}`, async () => {
      const lista = await api<Bonificacao[]>(`${base}/bonificacoes`);
      const itens = lista.find((b) => b.grupoId === grupoId)?.itens ?? [];
      const nomeItem = (id: number) => config!.itensBonificacao.find((i) => i.id === id)?.nome ?? `item ${id}`;
      return juntarHistoricos(
        await Promise.all(
          itens.map(async (i) => ({
            rotulo: nomeItem(i.itemBonificacaoId),
            itens: await api<Auditoria[]>(`/auditoria?entidade=BONIFICACAO_GRUPO&registroId=${i.id}`),
          })),
        ),
      );
    });

  const historicoPenalidade = (id: number) =>
    abrirHistorico(`penalidade-${id}`, () => api<Auditoria[]>(`/auditoria?entidade=PENALIDADE&registroId=${id}`));

  function editar(p: Penalidade) {
    setEditando(p);
    setPenalidade({ grupoId: String(p.grupoId), pontos: String(p.pontos), descricao: p.descricao, justificativa: p.justificativa });
    setAviso(undefined);
  }

  function cancelarEdicao() {
    setEditando(undefined);
    setPenalidade(PENALIDADE_VAZIA);
  }

  async function remover(p: Penalidade) {
    if (!window.confirm(`Remover a penalidade de ${p.pontos} pontos de ${nome(p.grupoId)}?`)) return;
    try {
      await api(`${base}/penalidades/${p.id}`, { method: 'DELETE' });
      if (editando?.id === p.id) cancelarEdicao();
      setAviso({ tipo: 'sucesso', texto: 'Penalidade removida.' });
      carregar();
    } catch (e) {
      setAviso({ tipo: 'erro', texto: (e as Error).message });
    }
  }

  return (
    <>
      {aviso && (
        <p className={aviso.tipo} role={aviso.tipo === 'erro' ? 'alert' : 'status'}>
          {aviso.texto}
        </p>
      )}

      <section className="cartao tabela-cartao">
        <h2 className="titulo-bloco">Bonificação por grupo</h2>
        {config.itensBonificacao.length === 0 ? (
          <p className="dica">
            Nenhum item de bonificação configurado. Cadastre-os em <Link to={`/evento/${eventoId}/configuracao`}>Configuração do evento</Link>.
          </p>
        ) : (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Equipe</th>
                  {config.itensBonificacao.map((item) => (
                    <th key={item.id}>
                      {item.nome} (até {item.teto})
                    </th>
                  ))}
                  <th>Total</th>
                  <th>
                    <span className="sr-only">Ação</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((g) => (
                  <Fragment key={g.id}>
                    <tr>
                      <td>
                        <span className="pessoa">
                          <PontoCor cor={g.cor} />
                          {g.nome}
                        </span>
                      </td>
                      {config.itensBonificacao.map((item) => (
                        <td key={item.id}>
                          <input
                            className="campo-tabela"
                            inputMode="numeric"
                            value={bonus[g.id]?.[item.id ?? -1] ?? ''}
                            onChange={(e) => setBonus({ ...bonus, [g.id]: { ...bonus[g.id], [item.id ?? -1]: e.target.value } })}
                            aria-label={`${item.nome} de ${g.nome}`}
                          />
                        </td>
                      ))}
                      <td>
                        <strong>{totalBonus(g.id)}</strong>
                      </td>
                      <td className="desafio-linha-acoes">
                        <button className="btn btn-pequeno" onClick={() => registrarBonus(g.id)} disabled={ocupado === `bonus-${g.id}`}>
                          Registrar
                        </button>
                        <button
                          type="button"
                          className="btn btn-contorno btn-pequeno"
                          onClick={() => historicoBonus(g.id)}
                          aria-expanded={historico?.chave === `bonus-${g.id}`}
                        >
                          Histórico
                        </button>
                      </td>
                    </tr>
                    {historico?.chave === `bonus-${g.id}` && (
                      <tr className="historico">
                        <td colSpan={config.itensBonificacao.length + 3}>
                          <ListaHistorico itens={historico.itens} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <form className="cartao penalidade-form" onSubmit={salvarPenalidade}>
        <h2 className="titulo-bloco">{editando ? `Corrigir penalidade de ${nome(editando.grupoId)}` : 'Aplicar penalidade'}</h2>
        <p className="dica">
          Entre {config.penalidadeMin} e {config.penalidadeMax} pontos, com justificativa obrigatória.
        </p>
        <div className="linha">
          <label className="campo">
            Equipe
            <select className="seletor" value={penalidade.grupoId} onChange={(e) => setPenalidade({ ...penalidade, grupoId: e.target.value })} required>
              <option value="">Escolha</option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            Pontos
            <input inputMode="numeric" value={penalidade.pontos} onChange={(e) => setPenalidade({ ...penalidade, pontos: e.target.value })} required />
          </label>
        </div>
        <label className="campo">
          Descrição
          <input value={penalidade.descricao} onChange={(e) => setPenalidade({ ...penalidade, descricao: e.target.value })} required placeholder="Ex.: Atraso na entrega" />
        </label>
        <label className="campo">
          Justificativa
          <textarea
            className="area-texto"
            value={penalidade.justificativa}
            onChange={(e) => setPenalidade({ ...penalidade, justificativa: e.target.value })}
            required
            rows={3}
          />
        </label>
        <div className="desafio-acoes">
          <button className="btn" disabled={ocupado === 'penalidade'}>
            {editando ? 'Salvar correção' : 'Aplicar penalidade'}
          </button>
          {editando && (
            <button type="button" className="btn btn-cinza" onClick={cancelarEdicao}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <section className="cartao tabela-cartao">
        <h2 className="titulo-bloco">Penalidades aplicadas</h2>
        {penalidades?.length === 0 && <p className="dica">Nenhuma penalidade aplicada.</p>}
        {!!penalidades?.length && (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Equipe</th>
                  <th>Pontos</th>
                  <th>Descrição</th>
                  <th>Justificativa</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {penalidades.map((p) => (
                  <Fragment key={p.id}>
                    <tr>
                      <td>{nome(p.grupoId)}</td>
                      <td>−{p.pontos}</td>
                      <td>{p.descricao}</td>
                      <td>{p.justificativa}</td>
                      <td className="desafio-linha-acoes">
                        <button className="btn btn-contorno btn-pequeno" onClick={() => editar(p)}>
                          Corrigir
                        </button>
                        <button
                          type="button"
                          className="btn btn-contorno btn-pequeno"
                          onClick={() => historicoPenalidade(p.id)}
                          aria-expanded={historico?.chave === `penalidade-${p.id}`}
                        >
                          Histórico
                        </button>
                        <button className="btn-excluir" onClick={() => remover(p)} aria-label={`Remover penalidade de ${nome(p.grupoId)}`}>
                          ×
                        </button>
                      </td>
                    </tr>
                    {historico?.chave === `penalidade-${p.id}` && (
                      <tr className="historico">
                        <td colSpan={5}>
                          <ListaHistorico itens={historico.itens} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
