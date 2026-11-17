export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(
      typeof body === 'object' && body && 'message' in body
        ? String(body.message)
        : 'Não foi possível concluir a operação.',
    );
    this.name = 'ApiError';
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown };

export async function apiRequest<T>(
  path: string,
  token: string | undefined,
  options: RequestOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL || '/api/v1'}${path}`,
    {
      ...options,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      headers,
    },
  );
  const text = await response.text();
  const body = text ? safelyParse(text) : undefined;
  if (!response.ok) throw new ApiError(response.status, body);
  return body as T;
}

function safelyParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
