import { createRoot } from 'react-dom/client';
import DialogoConfirmacao, { type OpcoesConfirmacao } from './DialogoConfirmacao';

export type { OpcoesConfirmacao };

/**
 * Confirmação no estilo do sistema, no lugar do window.confirm do navegador ("localhost diz...").
 * Resolve true se a pessoa confirmar; Cancelar e Esc resolvem false. Ao fechar, o foco volta para onde estava.
 */
export function confirmar(opcoes: OpcoesConfirmacao): Promise<boolean> {
  return new Promise((resolve) => {
    const focoAnterior = document.activeElement as HTMLElement | null;
    const recipiente = document.createElement('div');
    document.body.appendChild(recipiente);
    const raiz = createRoot(recipiente);
    const responder = (ok: boolean) => {
      raiz.unmount();
      recipiente.remove();
      focoAnterior?.focus();
      resolve(ok);
    };
    raiz.render(<DialogoConfirmacao opcoes={opcoes} responder={responder} />);
  });
}
