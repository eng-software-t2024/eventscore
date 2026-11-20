import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { comPendente, gravarPendentes, lerPendentes, novoId, semPendente, tipoDeFalha, type EnvioPendente, type Pendentes } from './pendentes.ts';

export type ResultadoEnvio = { status: 'salvo' } | { status: 'guardado' } | { status: 'recusado'; erro: Error };

/** O que as abas recebem: todo PUT de lançamento passa pela fila, então envios do mesmo recurso saem em ordem. */
export type EnviosPendentes = {
  pendentes: Pendentes;
  enviar: (envio: Omit<EnvioPendente, 'id'>) => Promise<ResultadoEnvio>;
};

const INTERVALO_TENTATIVA_MS = 30_000;

/**
 * Fila de lançamentos (RNF04). Uma execução de reenvio por vez, que relê a fila a cada passo: assim
 * um envio novo do mesmo recurso sai depois do antigo, nunca antes. Com algo pendente, tenta de novo
 * ao abrir a tela, a cada 30 s, quando a conexão volta e quando a aba volta a ficar visível.
 */
export function useEnviosPendentes(eventoId: number | undefined) {
  const [estado, setEstado] = useState<{ eventoId?: number; pendentes: Pendentes }>({ pendentes: {} });
  const [reenviando, setReenviando] = useState(false);
  const [falha, setFalha] = useState('');
  const execucao = useRef<Promise<Map<string, Error>> | null>(null);
  // Envios feitos pela própria aba: a recusa aparece na aba, não no aviso geral.
  const diretos = useRef(new Set<string>());

  // Evento ativo mudou (ou acabou de carregar): passa a mostrar o que está guardado para ele.
  if (estado.eventoId !== eventoId) setEstado({ eventoId, pendentes: eventoId ? lerPendentes(eventoId) : {} });

  const mudar = useCallback(
    (alterar: (atual: Pendentes) => Pendentes) => {
      if (!eventoId) return;
      const novo = alterar(lerPendentes(eventoId));
      gravarPendentes(eventoId, novo);
      setEstado({ eventoId, pendentes: novo });
    },
    [eventoId],
  );

  const reenviar = useCallback((): Promise<Map<string, Error>> => {
    if (!eventoId) return Promise.resolve(new Map());
    // Já está rodando: a execução atual relê a fila e leva o que acabou de entrar.
    if (execucao.current) return execucao.current;

    const rodar = async () => {
      const recusados = new Map<string, Error>();
      const tentados = new Set<string>();
      setReenviando(true);
      try {
        for (;;) {
          const envio = Object.values(lerPendentes(eventoId)).find((e) => !tentados.has(e.id));
          if (!envio) break;
          tentados.add(envio.id);
          try {
            await api(envio.caminho, { method: 'PUT', body: JSON.stringify(envio.corpo) });
            mudar((atual) => semPendente(atual, envio));
          } catch (e) {
            const tipo = tipoDeFalha(e);
            if (tipo === 'conexao') {
              setFalha('Ainda sem conexão com o servidor. Os lançamentos continuam guardados.');
              break;
            }
            if (tipo === 'depois') {
              setFalha(`O servidor não aceitou agora (${(e as Error).message}). Os lançamentos continuam guardados e serão reenviados.`);
              break;
            }
            mudar((atual) => semPendente(atual, envio));
            recusados.set(envio.id, e as Error);
            if (!diretos.current.has(envio.id)) setFalha(`${envio.descricao} não foi aceito: ${(e as Error).message}`);
          }
        }
        if (Object.keys(lerPendentes(eventoId)).length === 0 && recusados.size === 0) setFalha('');
      } finally {
        setReenviando(false);
        execucao.current = null;
      }
      return recusados;
    };

    execucao.current = rodar();
    return execucao.current;
  }, [eventoId, mudar]);

  const enviar = useCallback(
    async (dados: Omit<EnvioPendente, 'id'>): Promise<ResultadoEnvio> => {
      if (!eventoId) return { status: 'guardado' };
      const envio = { ...dados, id: novoId() };
      diretos.current.add(envio.id);
      mudar((atual) => comPendente(atual, envio));
      try {
        // A segunda chamada cobre o caso de a execução em andamento já ter passado pela fila
        // antes de este envio entrar; se ele já saiu, ela não faz nada.
        const primeira = await reenviar();
        const segunda = lerPendentes(eventoId)[envio.caminho]?.id === envio.id ? await reenviar() : new Map<string, Error>();
        const erro = primeira.get(envio.id) ?? segunda.get(envio.id);
        if (erro) return { status: 'recusado', erro };
        return lerPendentes(eventoId)[envio.caminho]?.id === envio.id ? { status: 'guardado' } : { status: 'salvo' };
      } finally {
        diretos.current.delete(envio.id);
      }
    },
    [eventoId, mudar, reenviar],
  );

  const temPendentes = Object.keys(estado.pendentes).length > 0;
  useEffect(() => {
    if (!temPendentes) return;
    const tentar = () => void reenviar();
    const aoVoltarParaAba = () => {
      if (document.visibilityState === 'visible') tentar();
    };
    const primeira = setTimeout(tentar, 0);
    const intervalo = setInterval(tentar, INTERVALO_TENTATIVA_MS);
    window.addEventListener('online', tentar);
    document.addEventListener('visibilitychange', aoVoltarParaAba);
    return () => {
      clearTimeout(primeira);
      clearInterval(intervalo);
      window.removeEventListener('online', tentar);
      document.removeEventListener('visibilitychange', aoVoltarParaAba);
    };
  }, [temPendentes, reenviar]);

  return { pendentes: estado.pendentes, enviar, reenviar: () => void reenviar(), reenviando, falha };
}
