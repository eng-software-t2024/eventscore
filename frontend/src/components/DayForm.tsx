import { useState } from 'react';
import type { DiaEventoInput } from '../types';

type Props = {
  initial?: DiaEventoInput;
  submitLabel: string;
  onSubmit: (input: DiaEventoInput) => Promise<void>;
  onCancel?: () => void;
};

export function DayForm({
  initial = { numeroDia: 1, data: '' },
  submitLabel,
  onSubmit,
  onCancel,
}: Props) {
  const [numeroDia, setNumeroDia] = useState(String(initial.numeroDia));
  const [data, setData] = useState(initial.data);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const number = Number(numeroDia);
    if (!Number.isInteger(number) || number < 1) {
      setError('Informe um número de dia inteiro maior ou igual a 1.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      setError('Informe uma data válida.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ numeroDia: number, data });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível salvar o dia.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="day-form" onSubmit={submit}>
      <div className="form-heading">
        <div>
          <span className="section-label">Cadastro</span>
          <h2>
            {submitLabel === 'Salvar alterações' ? 'Editar dia' : 'Novo dia'}
          </h2>
        </div>
      </div>
      <label>
        Número do dia
        <input
          type="number"
          min="1"
          value={numeroDia}
          onChange={(event) => setNumeroDia(event.target.value)}
        />
      </label>
      <label>
        Data
        <input
          type="date"
          value={data}
          onChange={(event) => setData(event.target.value)}
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="button button-primary" disabled={saving}>
          {saving ? 'Salvando…' : submitLabel}
        </button>
        {onCancel && (
          <button
            className="button button-quiet"
            type="button"
            onClick={onCancel}
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
