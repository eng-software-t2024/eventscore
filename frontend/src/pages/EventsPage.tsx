import { Link } from 'react-router-dom';
import { useState } from 'react';

export function EventsPage() {
  const [eventId, setEventId] = useState('');
  return (
    <section className="page-wrap">
      <div className="page-intro">
        <div>
          <span className="section-label">Workspace</span>
          <h1>Eventos</h1>
          <p>Entre em um evento para administrar sua programação.</p>
        </div>
        <span className="live-dot">Sessão ativa</span>
      </div>
      <div className="empty-workspace">
        <div className="empty-number">—</div>
        <div>
          <h2>A listagem de eventos ainda não está disponível</h2>
          <p>
            A API atual publica somente as rotas de dias. Você pode abrir
            diretamente um evento já conhecido pelo seu ID.
          </p>
          <div className="direct-event">
            <label>
              ID do evento
              <input
                inputMode="numeric"
                placeholder="Ex.: 12"
                value={eventId}
                onChange={(event) =>
                  setEventId(event.target.value.replace(/\D/g, ''))
                }
              />
            </label>
            <Link
              className={`button button-primary ${!eventId ? 'button-disabled' : ''}`}
              to={eventId ? `/events/${eventId}` : '#'}
              aria-disabled={!eventId}
            >
              Abrir evento
            </Link>
          </div>
        </div>
      </div>
      <div className="api-gap">
        <span className="section-label">Próxima integração</span>
        <p>
          Quando o backend publicar listagem, criação e detalhe de eventos, esta
          tela poderá exibir o workspace completo sem mudar o fluxo de dias.
        </p>
      </div>
    </section>
  );
}
