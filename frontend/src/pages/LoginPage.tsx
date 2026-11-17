import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

export function LoginPage() {
  const { session, configured, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (session) return <Navigate to="/events" replace />;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const message = await signIn(email, password);
    setLoading(false);
    if (message)
      setError('Não foi possível entrar. Confira seu e-mail e senha.');
    else
      void navigate(
        (location.state as { from?: string } | null)?.from || '/events',
      );
  }
  return (
    <main className="login-page">
      <div className="login-panel">
        <div className="brand brand-large">
          <span className="brand-mark">ES</span>
          <span>EventScore</span>
        </div>
        <span className="section-label">Painel de eventos</span>
        <h1>Organize o próximo resultado.</h1>
        <p className="login-copy">
          Entre para acompanhar os dias e manter a agenda do evento em ordem.
        </p>
        {!configured ? (
          <div className="notice notice-error">
            O ambiente ainda não configurou o Supabase Auth.
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="login-form">
            <label>
              E-mail
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="button button-primary button-wide"
              disabled={loading}
            >
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        )}
        <p className="login-footnote">
          A autenticação é feita pelo Supabase Auth do EventScore.
        </p>
      </div>
      <div className="login-aside">
        <span className="aside-code">01 / OPERAR</span>
        <p>
          Uma visão limpa para o trabalho que acontece entre a abertura e o
          último dia.
        </p>
        <span className="aside-rule" />
      </div>
    </main>
  );
}
