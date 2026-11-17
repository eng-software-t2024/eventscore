import { describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from './api';

describe('apiRequest', () => {
  it('sends the Supabase token and parses responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify([{ id: 1 }]), { status: 200 }),
        ),
    );
    await expect(apiRequest('/eventos/1/dias', 'jwt')).resolves.toEqual([
      { id: 1 },
    ]);
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/eventos/1/dias',
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    const headers = (vi.mocked(fetch).mock.calls[0][1] as RequestInit)
      .headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer jwt');
  });

  it('normalizes 401 as ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'unauthorized' }), {
          status: 401,
        }),
      ),
    );
    await expect(apiRequest('/eventos/1/dias', 'bad')).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});
