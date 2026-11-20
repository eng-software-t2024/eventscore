import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../../api/client';
import {
  chaveDaFila,
  comPendente,
  envioAntigo,
  gravarPendentes,
  lerPendentes,
  novoId,
  semPendente,
  tipoDeFalha,
  type EnvioPendente,
  type Fila,
  type Pendentes,
} from './pendentes.ts';

export type ResultadoEnvio =
  | { status: 'salvo' }
  /** Sem conexão: ficou na fila. */
  | { status: 'guardado' }
  /** O servidor respondeu com erro que pode passar (401, 5xx): ficou na fila. */
  | { status: 'erro-servidor'; erro: Error }
  /** A API recusou o conteúdo: saiu da fila. */
  | { status: 'recusado'; erro: Error }
  /** Um envio mais novo do mesmo lançamento entrou no lugar deste antes de ele sair. */
  | { status: 'substituido' };

/** O que as abas recebem: todo PUT de lançamento passa pela fila, então envios do mesmo recurso saem em ordem. */
export type EnviosPendentes = {
  pendentes: Pendentes;
  /** Fila atual lida do navegador, para a aba sobrepor ao carregar sem recarregar a cada mudança. */
  guardados: () => Pendentes;
  enviar: (envio: Pick<EnvioPendente, 'caminho' | 'corpo' | 'descricao'>) => Promise<ResultadoEnvio>;
};

/** O que aconteceu com cada envio numa execução da fila. */
type Execucao = { enviados: Set<string>; recusados: Map<string, Error>; adiados: Map<string, Error> };
const execucaoVazia = (): Execucao => ({ enviados: new Set(), recusados: new Map(), adiados: new Map() });

const INTERVALO_TENTATIVA_MS = 30_000;

/**
 * Fila de lançamentos (RNF04), uma por evento e usuário. Uma execução de reenvio por vez, que relê a
 * fila a cada passo: um envio novo do mesmo recurso sai depois do antigo, nunca antes. Com algo
 * pendente, tenta ao abrir a tela, a cada 30 s, quando a conexão volta e quando a aba fica visível;
 * envio guardado há mais de 2 h só sai pelo botão, porque pode sobrescrever uma correção feita depois.
 */
export function useEnviosPendentes(eventoId: number | undefined, usuarioId: number | undefined) {
  const fila = useMemo<Fila | undefined>(() => (eventoId && usuarioId ? { eventoId, usuarioId } : undefined), [eventoId, usuarioId]);
  const chave = fila ? chaveDaFila(fila) : undefined;

  const [estado, setEstado] = useState<{ chave?: string; pendentes: Pendentes; falha: string }>({ pendentes: {}, falha: '' });
  const [reenviando, setReenviando] = useState(false);
  const execucoes = useRef(new Map<string, Promise<Execucao>>());
  // Envios feitos pela própria aba: a recusa aparece na aba, não no aviso geral.
  const diretos = useRef(new Set<string>());

  // Trocou o evento ou o usuário: passa a mostrar a fila deles, sem a mensagem da fila anterior.
  if (estado.chave !== chave) setEstado({ chave, pendentes: fila ? lerPendentes(fila) : {}, falha: '' });

  // As atualizações só valem para a fila que está na tela; uma execução de outra fila não mexe nela.
  const mudar = useCallback((alvo: Fila, alterar: (atual: Pendentes) => Pendentes) => {
    const novo = alterar(lerPendentes(alvo));
    gravarPendentes(alvo, novo);
    setEstado((e) => (e.chave === chaveDaFila(alvo) ? { ...e, pendentes: novo } : e));
  }, []);
  const avisar = useCallback((alvo: Fila, falha: string) => {
    setEstado((e) => (e.chave === chaveDaFila(alvo) ? { ...e, falha } : e));
  }, []);

  const reenviar = useCallback(
    (incluirAntigos: boolean): Promise<Execucao> => {
      if (!fila) return Promise.resolve(execucaoVazia());
      const alvo = fila;
      const k = chaveDaFila(alvo);
      // Já está rodando: a execução atual relê a fila e leva o que acabou de entrar.
      const emAndamento = execucoes.current.get(k);
      if (emAndamento) return emAndamento;

      const rodar = async () => {
        const r = execucaoVazia();
        const tentados = new Set<string>();
        let parouSemConexao = false;
        setReenviando(true);
        try {
          for (;;) {
            const agora = Date.now();
            const envio = Object.values(lerPendentes(alvo)).find(
              (e) => !tentados.has(e.id) && (incluirAntigos || diretos.current.has(e.id) || !envioAntigo(e, agora)),
            );
            if (!envio) break;
            tentados.add(envio.id);
            try {
              await api(envio.caminho, { method: 'PUT', body: JSON.stringify(envio.corpo) });
              r.enviados.add(envio.id);
              mudar(alvo, (atual) => semPendente(atual, envio));
            } catch (e) {
              const erro = e as Error;
              const tipo = tipoDeFalha(e);
              if (tipo === 'conexao') {
                parouSemConexao = true;
                avisar(alvo, 'Ainda sem conexão com o servidor. Os lançamentos continuam guardados.');
                break;
              }
              if (tipo === 'recusado') {
                mudar(alvo, (atual) => semPendente(atual, envio));
                r.recusados.set(envio.id, erro);
                if (!diretos.current.has(envio.id)) avisar(alvo, `${envio.descricao} não foi aceito: ${erro.message}`);
                continue;
              }
              // Erro do servidor: este envio fica e os outros seguem, para um envio com problema não travar a fila.
              r.adiados.set(envio.id, erro);
              avisar(alvo, `O servidor não aceitou ${envio.descricao} agora (${erro.message}). Ele continua guardado e será reenviado.`);
              // Sessão expirada: todos falhariam, e o cliente já levou para o login.
              if (e instanceof ApiError && e.status === 401) break;
            }
          }
          const naoAvisados = [...r.recusados.keys()].some((id) => !diretos.current.has(id));
          if (!parouSemConexao && r.adiados.size === 0 && !naoAvisados) avisar(alvo, '');
        } finally {
          setReenviando(false);
          execucoes.current.delete(k);
        }
        return r;
      };

      const execucao = rodar();
      execucoes.current.set(k, execucao);
      return execucao;
    },
    [fila, mudar, avisar],
  );

  const enviar = useCallback(
    async (dados: Pick<EnvioPendente, 'caminho' | 'corpo' | 'descricao'>): Promise<ResultadoEnvio> => {
      if (!fila) {
        // Usuário ainda carregando (GET /auth/me): sem fila, envia direto e mostra o erro como ele vier.
        try {
          await api(dados.caminho, { method: 'PUT', body: JSON.stringify(dados.corpo) });
          return { status: 'salvo' };
        } catch (e) {
          return { status: 'recusado', erro: e as Error };
        }
      }
      const alvo = fila;
      const envio: EnvioPendente = { ...dados, id: novoId(), criadoEm: new Date().toISOString() };
      diretos.current.add(envio.id);
      mudar(alvo, (atual) => comPendente(atual, envio));
      try {
        const rodadas = [await reenviar(false)];
        // A execução em andamento pode ter passado pela fila antes de este envio entrar.
        const tocado = (r: Execucao) => r.enviados.has(envio.id) || r.recusados.has(envio.id) || r.adiados.has(envio.id);
        const naFila = () => lerPendentes(alvo)[envio.caminho]?.id === envio.id;
        if (!tocado(rodadas[0]) && naFila()) rodadas.push(await reenviar(false));

        for (const r of rodadas) {
          if (r.enviados.has(envio.id)) return { status: 'salvo' };
          const recusa = r.recusados.get(envio.id);
          if (recusa) return { status: 'recusado', erro: recusa };
          const adiado = r.adiados.get(envio.id);
          if (adiado) return { status: 'erro-servidor', erro: adiado };
        }
        return naFila() ? { status: 'guardado' } : { status: 'substituido' };
      } finally {
        diretos.current.delete(envio.id);
      }
    },
    [fila, mudar, reenviar],
  );

  const descartar = useCallback((caminho: string) => fila && mudar(fila, (atual) => semPendente(atual, { caminho, id: atual[caminho]?.id ?? '' })), [fila, mudar]);

  const temPendentes = Object.keys(estado.pendentes).length > 0;
  useEffect(() => {
    if (!temPendentes) return;
    const tentar = () => void reenviar(false);
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

  const guardados = useCallback(() => (fila ? lerPendentes(fila) : {}), [fila]);

  return {
    pendentes: estado.pendentes,
    guardados,
    falha: estado.falha,
    reenviando,
    enviar,
    descartar,
    /** Botão "Reenviar agora": inclui os envios antigos, que não saem sozinhos. */
    reenviarTodos: () => void reenviar(true),
  };
}
