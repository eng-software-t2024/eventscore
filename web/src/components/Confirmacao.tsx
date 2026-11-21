import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

export type OpcoesConfirmacao = {
  titulo: string;
  mensagem: string;
  /** Texto do botão de confirmar (padrão: "Confirmar"). */
  confirmar?: string;
  /** Ação que não pode ser desfeita (excluir, remover, descartar): botão em vermelho. */
  perigo?: boolean;
};

function Dialogo({ opcoes, responder }: { opcoes: OpcoesConfirmacao; responder: (ok: boolean) => void }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const cancelar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    dialogo.current?.showModal();
    // Foco no "Cancelar": Enter sem querer não exclui nada.
    cancelar.current?.focus();
  }, []);

  return (
    <dialog
      ref={dialogo}
      className="modal confirmacao"
      aria-labelledby="confirmacao-titulo"
      aria-describedby="confirmacao-mensagem"
      onCancel={(e) => {
        e.preventDefault();
        responder(false);
      }}
    >
      <header className="modal-topo">
        <h2 id="confirmacao-titulo">{opcoes.titulo}</h2>
      </header>
      <div className="modal-corpo">
        <p id="confirmacao-mensagem">{opcoes.mensagem}</p>
        <div className="modal-acoes">
          <button ref={cancelar} type="button" className="btn btn-cinza" onClick={() => responder(false)}>
            Cancelar
          </button>
          <button type="button" className={`btn${opcoes.perigo ? ' btn-perigo' : ''}`} onClick={() => responder(true)}>
            {opcoes.confirmar ?? 'Confirmar'}
          </button>
        </div>
      </div>
    </dialog>
  );
}

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
    raiz.render(<Dialogo opcoes={opcoes} responder={responder} />);
  });
}
