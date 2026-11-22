import type { components } from './schema';

export type Schemas = components['schemas'];

const BASE = '/api/v1';
const CHAVE_TOKEN = 'eventscore.token';

// "Manter conectado" decide onde o token fica: localStorage sobrevive ao fechar o navegador.
/** Primeiro token não vazio. Valor vazio ou só com espaços (ex.: editado no DevTools) não conta como token. */
export const primeiroToken = (...valores: (string | null)[]) =>
  valores.find((v) => v?.trim()) ?? null;

export const token = {
  ler: () =>
    primeiroToken(
      localStorage.getItem(CHAVE_TOKEN),
      sessionStorage.getItem(CHAVE_TOKEN),
    ),
  salvar(valor: string, manter: boolean) {
    // Um só token: sem isso, um antigo guardado com "Manter conectado" teria prioridade sobre o novo.
    (manter ? sessionStorage : localStorage).removeItem(CHAVE_TOKEN);
    (manter ? localStorage : sessionStorage).setItem(CHAVE_TOKEN, valor);
  },
  limpar() {
    localStorage.removeItem(CHAVE_TOKEN);
    sessionStorage.removeItem(CHAVE_TOKEN);
  },
};

/**
 * Id do usuário (`sub`) lido do token, sem validar a assinatura: serve só para separar no navegador
 * o que é de cada usuário (fila de lançamentos), sem depender do GET /auth/me responder.
 */
export function idDoUsuarioNoToken(valor: string | null): number | undefined {
  const parte = valor?.split('.')[1];
  if (!parte) return undefined;
  try {
    const base64 = parte
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parte.length / 4) * 4, '=');
    const sub = (JSON.parse(atob(base64)) as { sub?: unknown }).sub;
    return typeof sub === 'number' && Number.isSafeInteger(sub) && sub > 0
      ? sub
      : undefined;
  } catch {
    return undefined;
  }
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Erro no formato do NestJS: message é texto ou lista (ValidationPipe).
export function mensagemDeErro(status: number, corpo: unknown): string {
  const message = (corpo as { message?: unknown } | null)?.message;
  // Rota que o back-end ainda não publicou: o Nest responde "Cannot GET /api/v1/...", que não diz nada a quem usa a tela.
  if (
    status === 404 &&
    typeof message === 'string' &&
    /^Cannot (GET|POST|PUT|PATCH|DELETE) \//.test(message)
  ) {
    return 'Esta função ainda não está disponível no servidor.';
  }
  if (Array.isArray(message)) return message.join('\n');
  if (typeof message === 'string' && message) return message;
  return `Erro ${status} ao falar com o servidor.`;
}

/** Lê o nome do arquivo do Content-Disposition (filename*=UTF-8''... ou filename="..."). */
export function nomeDoArquivo(
  disposicao: string | null,
  padrao: string,
): string {
  const utf8 = disposicao?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) return decodeURIComponent(utf8.trim());
  return disposicao?.match(/filename="?([^";]+)"?/i)?.[1]?.trim() || padrao;
}

/**
 * Baixa um arquivo da API com o token no cabeçalho, nunca por link aberto: o relatório final tem nome e
 * matrícula de aluno (RNF03). O nome vem do Content-Disposition, que a API expõe no CORS.
 */
export async function baixar(
  caminho: string,
  nomePadrao: string,
): Promise<void> {
  const resposta = await requisitar(caminho, {});
  const url = URL.createObjectURL(await resposta.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeDoArquivo(
    resposta.headers.get('Content-Disposition'),
    nomePadrao,
  );
  link.click();
  URL.revokeObjectURL(url);
}

export async function api<T>(
  caminho: string,
  init: RequestInit = {},
): Promise<T> {
  const resposta = await requisitar(caminho, init);
  const texto = await resposta.text();
  return (texto ? JSON.parse(texto) : undefined) as T;
}

export type EventoCliente = {
  eventType:
    | 'ROUTE_CHANGE'
    | 'ACTION'
    | 'MODAL_OPEN'
    | 'MODAL_CLOSE'
    | 'FORM_SUBMIT'
    | 'JS_ERROR'
    | 'API_FAILURE'
    | 'TAB_VISIBILITY'
    | 'IDLE';
  rota?: string;
  acao?: string;
  visivel?: boolean;
};

/** Envia somente metadados sem valores de campos, corpos, tokens ou mensagens de erro. */
export function registrarTelemetria(evento: EventoCliente): void {
  const atual = token.ler();
  if (!atual || typeof fetch === 'undefined') return;
  try {
    void fetch(`${BASE}/telemetry/client`, {
      method: 'POST',
      keepalive: true,
      headers: {
        Authorization: `Bearer ${atual}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(evento),
    }).catch(() => undefined);
  } catch {
    // Instrumentação nunca interrompe o fluxo de uso.
  }
}

async function requisitar(
  caminho: string,
  init: RequestInit,
): Promise<Response> {
  const headers = new Headers(init.headers);
  const atual = token.ler();
  if (atual) headers.set('Authorization', `Bearer ${atual}`);
  if (init.body && !(init.body instanceof FormData))
    headers.set('Content-Type', 'application/json');

  let resposta: Response;
  try {
    resposta = await fetch(BASE + caminho, { ...init, headers });
  } catch {
    if (!caminho.startsWith('/telemetry/client'))
      registrarTelemetria({
        eventType: 'API_FAILURE',
        rota: normalizarRota(caminho),
      });
    throw new ApiError(0, 'Sem conexão com o servidor. Tente de novo.');
  }

  if (resposta.status === 401 && caminho !== '/auth/login') {
    token.limpar();
    window.location.assign('/login');
  }
  if (!resposta.ok) {
    if (!caminho.startsWith('/telemetry/client'))
      registrarTelemetria({
        eventType: 'API_FAILURE',
        rota: normalizarRota(caminho),
      });
    const corpo = await resposta.json().catch(() => null);
    throw new ApiError(resposta.status, mensagemDeErro(resposta.status, corpo));
  }
  return resposta;
}

function normalizarRota(caminho: string) {
  return caminho
    .split('?')[0]
    .replace(/\b\d+\b/g, ':id')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':uuid')
    .slice(0, 255);
}
