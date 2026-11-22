import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, api, token } from '../../api/client';
import { parametrosTelemetria } from './telemetry-query';
import './GestaoMaster.css';

type User = {
  id: number;
  nome: string;
  email: string;
  perfil: 'ADMIN' | 'MASTER';
  ativo: boolean;
  referencias: Record<string, number>;
  podeExcluir: boolean;
};
type Session = {
  id: string;
  usuarioId: number;
  issuedAt: string;
  lastActivityAt: string;
  expiresAt: string;
  endedAt: string | null;
  endReason: string | null;
  ip: string | null;
  userAgent: string | null;
  usuario: { nome: string; email: string };
};
type Telemetry = {
  id: string;
  usuarioId: number | null;
  occurredAt: string;
  source: string;
  eventType: string;
  method: string | null;
  route: string | null;
  status: number | null;
  durationMs: number | null;
  outcome: string;
  correlationId: string | null;
  ip: string | null;
  userAgent: string | null;
  details: Record<string, unknown>;
  usuario: { nome: string; email: string } | null;
};
type Audit = {
  id: string;
  actorUserId: number;
  targetUserId: number | null;
  action: string;
  occurredAt: string;
  correlationId: string | null;
  details: Record<string, unknown>;
  actor: { nome: string; email: string };
};
type Period = {
  id: string;
  status: 'OPEN' | 'CLOSED';
  startedAt: string;
  endedAt: string | null;
  purgeAfter: string | null;
};
type Tab = 'usuarios' | 'sessoes' | 'telemetria' | 'auditoria';

export default function GestaoMaster() {
  const [tab, setTab] = useState<Tab>('usuarios');
  const [users, setUsers] = useState<User[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [events, setEvents] = useState<Telemetry[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [period, setPeriod] = useState<Period | null>(null);
  const [search, setSearch] = useState('');
  const [eventType, setEventType] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<'create' | 'edit' | 'password' | null>(
    null,
  );
  const [selected, setSelected] = useState<User | null>(null);
  const [timeline, setTimeline] = useState<Array<
    Record<string, unknown>
  > | null>(null);

  const loadUsers = useCallback(async () => {
    const result = await api<{ dados: User[] }>('/management/users?limite=100');
    setUsers(result.dados);
  }, []);
  const loadTab = useCallback(async () => {
    try {
      if (tab === 'usuarios') await loadUsers();
      if (tab === 'sessoes')
        setSessions(await api<Session[]>('/management/sessions?limite=100'));
      if (tab === 'telemetria') {
        setEvents(
          await api<Telemetry[]>(
            `/management/telemetry/events?${parametrosTelemetria(eventType)}`,
          ),
        );
        setPeriod(await api<Period>('/management/telemetry/period'));
      }
      if (tab === 'auditoria')
        setAudit(await api<Audit[]>('/management/audit?limite=100'));
    } catch (e) {
      setError(message(e));
    }
  }, [eventType, loadUsers, tab]);

  useEffect(() => {
    // The effect starts an async request; state updates happen only after it resolves.
    // oxlint does not infer that loadTab's state setters follow awaited API calls.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTab();
  }, [loadTab]);

  async function executar(action: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(ok);
      await loadTab();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function criar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    await executar(
      () =>
        api('/management/users', {
          method: 'POST',
          body: JSON.stringify({
            nome: data.get('nome'),
            email: data.get('email'),
            senha: data.get('senha'),
          }),
        }),
      'Conta ADMIN criada.',
    );
    setDialog(null);
  }
  async function editar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const data = new FormData(e.currentTarget);
    await executar(
      () =>
        api(`/management/users/${selected.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            nome: data.get('nome'),
            email: data.get('email'),
            ativo: data.get('ativo') === 'on',
          }),
        }),
      'Usuário atualizado.',
    );
    setDialog(null);
  }
  async function redefinir(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const data = new FormData(e.currentTarget);
    await executar(
      () =>
        api(`/management/users/${selected.id}/password`, {
          method: 'POST',
          body: JSON.stringify({ senha: data.get('senha') }),
        }),
      'Senha redefinida; sessões anteriores revogadas.',
    );
    setDialog(null);
  }

  async function abrirLinhaDoTempo(user: User) {
    setSelected(user);
    setTimeline(null);
    setError('');
    try {
      setTimeline(
        await api<Array<Record<string, unknown>>>(
          `/management/telemetry/users/${user.id}/timeline?limite=100`,
        ),
      );
    } catch (e) {
      setError(message(e));
    }
  }

  const filteredUsers = users.filter((user) =>
    `${user.nome} ${user.email}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  const tokenPresente = Boolean(token.ler());

  return (
    <main className="gestao-master">
      <header className="gestao-heading">
        <div>
          <h1>Gestão de acesso</h1>
          <p>Usuários, sessões e telemetria operacional.</p>
        </div>
        {tab === 'usuarios' && (
          <button
            className="btn"
            data-telemetry-action="master.create_user.open"
            onClick={() => setDialog('create')}
          >
            Criar usuário
          </button>
        )}
      </header>
      {!tokenPresente && (
        <p className="gm-alert" role="alert">
          Sessão ausente. Entre novamente como MASTER.
        </p>
      )}
      {error && (
        <p className="gm-alert" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="gm-notice" role="status">
          {notice}
        </p>
      )}
      <nav className="gm-tabs" aria-label="Gestão MASTER">
        {(
          [
            ['usuarios', 'Usuários'],
            ['sessoes', 'Sessões'],
            ['telemetria', 'Telemetria'],
            ['auditoria', 'Auditoria'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? 'ativo' : ''}
            aria-current={tab === id ? 'page' : undefined}
            data-telemetry-action={`master.tab.${id}`}
            onClick={() => {
              setTab(id);
              setTimeline(null);
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'usuarios' && (
        <section aria-labelledby="gm-users-title">
          <div className="gm-tools">
            <h2 id="gm-users-title">Usuários administrativos</h2>
            <label>
              Buscar{' '}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome ou e-mail"
              />
            </label>
          </div>
          <div className="gm-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Perfil</th>
                  <th>Estado</th>
                  <th>Referências</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>{user.nome}</td>
                    <td>{user.email}</td>
                    <td>{user.perfil}</td>
                    <td>
                      <span className={user.ativo ? 'gm-state on' : 'gm-state'}>
                        {user.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td>
                      {Object.values(user.referencias).reduce(
                        (a, b) => a + b,
                        0,
                      )}
                    </td>
                    <td className="gm-actions">
                      <button
                        className="gm-link"
                        data-telemetry-action="master.user.edit"
                        onClick={() => {
                          setSelected(user);
                          setDialog('edit');
                        }}
                      >
                        Editar
                      </button>
                      <button
                        className="gm-link"
                        data-telemetry-action="master.user.password"
                        onClick={() => {
                          setSelected(user);
                          setDialog('password');
                        }}
                      >
                        Redefinir senha
                      </button>
                      <button
                        className="gm-link"
                        data-telemetry-action="master.user.timeline"
                        onClick={() => void abrirLinhaDoTempo(user)}
                      >
                        Linha do tempo
                      </button>
                      <button
                        className="gm-link danger"
                        disabled={!user.podeExcluir || busy}
                        title={
                          !user.podeExcluir
                            ? 'Há referências de negócio, sessões ou telemetria preservadas.'
                            : 'Excluir usuário'
                        }
                        data-telemetry-action="master.user.delete"
                        onClick={() =>
                          window.confirm(
                            `Excluir ${user.nome}? Esta ação não pode ser desfeita.`,
                          ) &&
                          void executar(
                            () =>
                              api(`/management/users/${user.id}`, {
                                method: 'DELETE',
                              }),
                            'Usuário excluído.',
                          )
                        }
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
                {!filteredUsers.length && (
                  <tr>
                    <td colSpan={6}>Nenhum usuário corresponde à busca.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {timeline && (
            <section className="gm-timeline">
              <div className="gm-tools">
                <h2>Linha do tempo · {selected?.nome}</h2>
                <button className="gm-link" onClick={() => setTimeline(null)}>
                  Fechar
                </button>
              </div>
              <ol>
                {timeline.map((item, index) => (
                  <li key={index}>
                    <time>{formatDate(item.occurredAt)}</time>
                    <strong>
                      {String(item.eventType ?? item.action ?? 'Evento')}
                    </strong>
                    <span>{String(item.route ?? item.categoria ?? '')}</span>
                  </li>
                ))}
              </ol>
              {timeline.length === 0 && <p>Sem eventos registrados.</p>}
            </section>
          )}
        </section>
      )}

      {tab === 'sessoes' && (
        <section>
          <div className="gm-tools">
            <h2>Sessões persistidas</h2>
            <button
              className="btn-claro"
              data-telemetry-action="master.sessions.refresh"
              onClick={() => void loadTab()}
            >
              Atualizar
            </button>
          </div>
          <p className="gm-help">
            A sessão expira após 15 minutos sem atividade ou ao completar 1
            hora. Sessões encerradas são mantidas por 30 dias.
          </p>
          <div className="gm-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Início UTC</th>
                  <th>Última atividade</th>
                  <th>Expira</th>
                  <th>Estado</th>
                  <th>IP / navegador</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.usuario.nome}
                      <small>{s.usuario.email}</small>
                    </td>
                    <td>{formatDate(s.issuedAt)}</td>
                    <td>{formatDate(s.lastActivityAt)}</td>
                    <td>{formatDate(s.expiresAt)}</td>
                    <td>{s.endReason ?? 'Ativa'}</td>
                    <td>
                      {s.ip ?? '—'}
                      <small>{s.userAgent ?? '—'}</small>
                    </td>
                    <td>
                      {!s.endedAt && (
                        <button
                          className="gm-link danger"
                          data-telemetry-action="master.session.revoke"
                          onClick={() =>
                            void executar(
                              () =>
                                api(`/management/sessions/${s.id}/revoke`, {
                                  method: 'POST',
                                  body: '{}',
                                }),
                              'Sessão revogada.',
                            )
                          }
                        >
                          Revogar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!sessions.length && (
                  <tr>
                    <td colSpan={7}>Nenhuma sessão registrada.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'telemetria' && (
        <section>
          <div className="gm-tools">
            <div>
              <h2>Telemetria</h2>
              <p className="gm-help">
                Sem senhas, tokens, cookies, corpos ou conteúdo digitado.
              </p>
            </div>
            <label>
              Tipo{' '}
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
              >
                <option value="">Todos</option>
                {[
                  'LOGIN_SUCCEEDED',
                  'LOGIN_FAILED',
                  'LOGOUT',
                  'SESSION_EXPIRED',
                  'API_REQUEST',
                  'ROUTE_CHANGE',
                  'ACTION',
                  'FORM_SUBMIT',
                  'MODAL_OPEN',
                  'MODAL_CLOSE',
                  'JS_ERROR',
                  'API_FAILURE',
                  'TAB_VISIBILITY',
                  'IDLE',
                ].map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <a
              className="btn-claro"
              href="/api/v1/management/telemetry/export.csv?limite=100"
              onClick={(e) => {
                e.preventDefault();
                void baixarCsv();
              }}
            >
              Exportar CSV
            </a>
          </div>
          {period && (
            <div className="gm-period">
              <span>
                Período{' '}
                {period.status === 'OPEN' ? 'em andamento' : 'encerrado'} ·
                iniciado {formatDate(period.startedAt)}
              </span>
              {period.status === 'OPEN' && (
                <button
                  className="gm-link danger"
                  data-telemetry-action="master.telemetry.close_period"
                  onClick={() =>
                    window.confirm(
                      'Encerrar o período e iniciar retenção de 30 dias?',
                    ) &&
                    void executar(
                      () =>
                        api('/management/telemetry/period/close', {
                          method: 'POST',
                          body: '{}',
                        }),
                      'Período encerrado; telemetria será expurgada após 30 dias.',
                    )
                  }
                >
                  Encerrar teste
                </button>
              )}
              {period.purgeAfter && (
                <span>Expurgo previsto: {formatDate(period.purgeAfter)}</span>
              )}
            </div>
          )}
          <div className="gm-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Horário UTC</th>
                  <th>Usuário</th>
                  <th>Evento</th>
                  <th>Rota / ação</th>
                  <th>Resultado</th>
                  <th>HTTP / duração</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDate(e.occurredAt)}</td>
                    <td>{e.usuario?.nome ?? '—'}</td>
                    <td>
                      {e.eventType}
                      <small>{e.source}</small>
                    </td>
                    <td>
                      {e.route ??
                        String(e.details.action ?? e.details.route ?? '—')}
                    </td>
                    <td>{e.outcome}</td>
                    <td>
                      {e.status ?? '—'} /{' '}
                      {e.durationMs == null ? '—' : `${e.durationMs} ms`}
                    </td>
                    <td>{e.ip ?? '—'}</td>
                  </tr>
                ))}
                {!events.length && (
                  <tr>
                    <td colSpan={7}>Sem eventos neste filtro.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'auditoria' && (
        <section>
          <div className="gm-tools">
            <h2>Auditoria administrativa imutável</h2>
            <button
              className="btn-claro"
              data-telemetry-action="master.audit.refresh"
              onClick={() => void loadTab()}
            >
              Atualizar
            </button>
          </div>
          <div className="gm-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Horário UTC</th>
                  <th>Autor</th>
                  <th>Ação</th>
                  <th>Usuário alvo</th>
                  <th>Detalhes mínimos</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td>{formatDate(a.occurredAt)}</td>
                    <td>{a.actor.nome}</td>
                    <td>{a.action}</td>
                    <td>{a.targetUserId ?? '—'}</td>
                    <td>{JSON.stringify(a.details)}</td>
                  </tr>
                ))}
                {!audit.length && (
                  <tr>
                    <td colSpan={5}>Nenhuma ação administrativa registrada.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {dialog && (
        <div
          className="gm-backdrop"
          onMouseDown={(e) => e.target === e.currentTarget && setDialog(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            data-telemetry-modal={`master.${dialog}_user`}
            data-telemetry-open="true"
            className="gm-dialog"
          >
            <button
              className="gm-dialog-close"
              aria-label="Fechar"
              data-telemetry-action="master.dialog.close"
              onClick={() => setDialog(null)}
            >
              ×
            </button>
            {dialog === 'create' && (
              <form data-telemetry-form="master.create_user" onSubmit={criar}>
                <h2>Novo usuário ADMIN</h2>
                <label>
                  Nome
                  <input name="nome" required maxLength={150} />
                </label>
                <label>
                  E-mail
                  <input name="email" type="email" required maxLength={150} />
                </label>
                <label>
                  Senha inicial
                  <input
                    name="senha"
                    type="password"
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                  />
                </label>
                <p className="gm-help">
                  O usuário será criado ativo com perfil ADMIN.
                </p>
                <button className="btn" disabled={busy}>
                  Criar usuário
                </button>
              </form>
            )}
            {dialog === 'edit' && selected && (
              <form data-telemetry-form="master.edit_user" onSubmit={editar}>
                <h2>Editar usuário</h2>
                <label>
                  Nome
                  <input
                    name="nome"
                    required
                    maxLength={150}
                    defaultValue={selected.nome}
                  />
                </label>
                <label>
                  E-mail
                  <input
                    name="email"
                    type="email"
                    required
                    maxLength={150}
                    defaultValue={selected.email}
                  />
                </label>
                <label className="gm-check">
                  <input
                    type="checkbox"
                    name="ativo"
                    defaultChecked={selected.ativo}
                  />{' '}
                  Conta ativa
                </label>
                <p className="gm-help">
                  O perfil não pode ser alterado por esta tela.
                </p>
                <button className="btn" disabled={busy}>
                  Salvar
                </button>
              </form>
            )}
            {dialog === 'password' && selected && (
              <form
                data-telemetry-form="master.reset_password"
                onSubmit={redefinir}
              >
                <h2>Redefinir senha</h2>
                <p>
                  Conta: {selected.email}. As sessões atuais serão revogadas.
                </p>
                <label>
                  Nova senha
                  <input
                    name="senha"
                    type="password"
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                  />
                </label>
                <button className="btn" disabled={busy}>
                  Redefinir
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </main>
  );

  async function baixarCsv() {
    try {
      const response = await fetch(
        `/api/v1/management/telemetry/export.csv?${parametrosTelemetria(eventType)}`,
        { headers: { Authorization: `Bearer ${token.ler()}` } },
      );
      if (!response.ok)
        throw new Error('Não foi possível exportar a telemetria.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = 'eventscore-telemetria.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(message(e));
    }
  }
}

function message(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : 'Não foi possível concluir a operação.';
}
function formatDate(value: unknown) {
  return typeof value === 'string'
    ? new Date(value).toLocaleString('pt-BR', {
        timeZone: 'UTC',
        timeZoneName: 'short',
      })
    : '—';
}
