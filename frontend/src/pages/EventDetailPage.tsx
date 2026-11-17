import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { ApiError, apiRequest } from '../lib/api';
import type { DiaEvento, DiaEventoInput } from '../types';
import { DayForm } from '../components/DayForm';
import { useState } from 'react';

export function EventDetailPage() {
  const { eventId } = useParams();
  const id = Number(eventId);
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [editing, setEditing] = useState<DiaEvento | null>(null);
  const token = session?.access_token;
  const days = useQuery({
    queryKey: ['event-days', id],
    queryFn: () => apiRequest<DiaEvento[]>(`/eventos/${id}/dias`, token),
    enabled: Boolean(token && Number.isInteger(id) && id > 0),
  });
  const mutation = useMutation({
    mutationFn: ({
      method,
      path,
      body,
    }: {
      method: string;
      path: string;
      body?: DiaEventoInput;
    }) => apiRequest<DiaEvento | void>(path, token, { method, body }),
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ['event-days', id] }),
  });
  const handleError = (cause: unknown) => {
    if (cause instanceof ApiError && cause.status === 401) {
      void signOut();
      void navigate('/login');
    }
    throw cause;
  };
  async function save(input: DiaEventoInput) {
    try {
      await mutation.mutateAsync({
        method: editing ? 'PATCH' : 'POST',
        path: editing
          ? `/eventos/${id}/dias/${editing.id}`
          : `/eventos/${id}/dias`,
        body: input,
      });
      setEditing(null);
    } catch (cause) {
      handleError(cause);
    }
  }
  async function remove(day: DiaEvento) {
    if (!window.confirm(`Remover o dia ${day.numeroDia}?`)) return;
    try {
      await mutation.mutateAsync({
        method: 'DELETE',
        path: `/eventos/${id}/dias/${day.id}`,
      });
    } catch (cause) {
      handleError(cause);
    }
  }
  return (
    <section className="page-wrap">
      <Link className="back-link" to="/events">
        ← Todos os eventos
      </Link>
      <div className="page-intro">
        <div>
          <span className="section-label">Evento #{id}</span>
          <h1>Dias do evento</h1>
          <p>Programação em ordem cronológica.</p>
        </div>
        <span className="count-chip">{days.data?.length ?? 0} dias</span>
      </div>
      {days.isLoading && (
        <div className="screen-state inline">Carregando dias…</div>
      )}
      {days.error && (
        <div className="notice notice-error" role="alert">
          {days.error instanceof Error
            ? days.error.message
            : 'Não foi possível carregar os dias.'}
        </div>
      )}
      {days.data && days.data.length === 0 && (
        <div className="empty-state">
          <h2>Nenhum dia cadastrado</h2>
          <p>Comece adicionando o primeiro dia do evento.</p>
        </div>
      )}
      {days.data && days.data.length > 0 && (
        <div className="days-table">
          <div className="days-table-head">
            <span>Dia</span>
            <span>Data</span>
            <span className="sr-only">Ações</span>
          </div>
          {days.data.map((day) => (
            <div className="day-row" key={day.id}>
              <strong>{String(day.numeroDia).padStart(2, '0')}</strong>
              <time dateTime={day.data}>{formatDate(day.data)}</time>
              <div className="row-actions">
                <button className="text-button" onClick={() => setEditing(day)}>
                  Editar
                </button>
                <button
                  className="text-button text-danger"
                  onClick={() => void remove(day)}
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="form-column">
        <DayForm
          initial={
            editing
              ? { numeroDia: editing.numeroDia, data: editing.data }
              : undefined
          }
          submitLabel={editing ? 'Salvar alterações' : 'Adicionar dia'}
          onSubmit={save}
          onCancel={editing ? () => setEditing(null) : undefined}
        />
      </div>
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}
