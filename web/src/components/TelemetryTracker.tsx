import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { registrarTelemetria } from '../api/client';

const LIMITE_INATIVIDADE_MS = 15 * 60 * 1000;

export default function TelemetryTracker() {
  const location = useLocation();

  useEffect(() => {
    registrarTelemetria({ eventType: 'ROUTE_CHANGE', rota: location.pathname });
  }, [location.pathname]);

  useEffect(() => {
    let ultimoEvento = Date.now();
    let ultimoRegistroAtividade = 0;
    let ociosoRegistrado = false;
    const atividade = () => {
      ultimoEvento = Date.now();
      ociosoRegistrado = false;
      if (ultimoEvento - ultimoRegistroAtividade >= 60_000) {
        ultimoRegistroAtividade = ultimoEvento;
        registrarTelemetria({
          eventType: 'ACTION',
          rota: location.pathname,
          acao: 'user_activity',
        });
      }
    };
    const click = (event: MouseEvent) => {
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-telemetry-action]')
          : null;
      const action = target?.dataset.telemetryAction;
      if (action && /^[a-zA-Z0-9_.:-]{1,80}$/.test(action)) {
        registrarTelemetria({
          eventType: 'ACTION',
          rota: location.pathname,
          acao: action,
        });
      }
      atividade();
    };
    const submit = (event: Event) => {
      const form =
        event.target instanceof HTMLFormElement ? event.target : null;
      const action = form?.dataset.telemetryForm;
      if (action && /^[a-zA-Z0-9_.:-]{1,80}$/.test(action)) {
        registrarTelemetria({
          eventType: 'FORM_SUBMIT',
          rota: location.pathname,
          acao: action,
        });
      }
      atividade();
    };
    const visibility = () =>
      registrarTelemetria({
        eventType: 'TAB_VISIBILITY',
        rota: location.pathname,
        visivel: document.visibilityState === 'visible',
      });
    const jsError = () =>
      registrarTelemetria({ eventType: 'JS_ERROR', rota: location.pathname });
    const rejection = () =>
      registrarTelemetria({ eventType: 'JS_ERROR', rota: location.pathname });
    const timer = window.setInterval(() => {
      if (
        !ociosoRegistrado &&
        Date.now() - ultimoEvento >= LIMITE_INATIVIDADE_MS
      ) {
        ociosoRegistrado = true;
        registrarTelemetria({ eventType: 'IDLE', rota: location.pathname });
      }
    }, 30_000);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (!(record.target instanceof HTMLElement)) continue;
        const action = record.target.dataset.telemetryModal;
        if (
          action &&
          (record.attributeName === 'open' ||
            record.attributeName === 'data-telemetry-open')
        )
          registrarTelemetria({
            eventType:
              record.target instanceof HTMLDialogElement
                ? record.target.open
                  ? 'MODAL_OPEN'
                  : 'MODAL_CLOSE'
                : record.target.dataset.telemetryOpen === 'true'
                  ? 'MODAL_OPEN'
                  : 'MODAL_CLOSE',
            rota: location.pathname,
            acao: action,
          });
      }
    });
    observer.observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-telemetry-open', 'open'],
    });
    for (const event of ['pointerdown', 'keydown', 'touchstart', 'mousemove'])
      document.addEventListener(event, atividade, { passive: true });
    document.addEventListener('click', click);
    document.addEventListener('submit', submit);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('error', jsError);
    window.addEventListener('unhandledrejection', rejection);
    return () => {
      window.clearInterval(timer);
      observer.disconnect();
      for (const event of ['pointerdown', 'keydown', 'touchstart', 'mousemove'])
        document.removeEventListener(event, atividade);
      document.removeEventListener('click', click);
      document.removeEventListener('submit', submit);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('error', jsError);
      window.removeEventListener('unhandledrejection', rejection);
    };
  }, [location.pathname]);

  return null;
}
