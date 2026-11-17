import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createLocalJWKSet,
  jwtVerify,
  type JSONWebKeySet,
  type JWTPayload,
} from 'jose';
import type { Env } from '../config/env.js';

@Injectable()
export class AuthService {
  private readonly issuer?: string;
  private readonly audience?: string;
  private readonly keySet?: ReturnType<typeof createLocalJWKSet>;
  private readonly secret?: Uint8Array;

  constructor(config: ConfigService<Env, true>) {
    this.issuer = config.get('SUPABASE_JWT_ISSUER', { infer: true });
    this.audience = config.get('SUPABASE_JWT_AUDIENCE', { infer: true });
    const keys = config.get('SUPABASE_JWT_KEYS', { infer: true });
    if (keys) {
      try {
        const parsed = JSON.parse(keys) as
          JSONWebKeySet | JSONWebKeySet['keys'];
        const jwks = Array.isArray(parsed) ? { keys: parsed } : parsed;
        if (!Array.isArray(jwks.keys) || jwks.keys.length === 0)
          throw new Error('JWKS vazio');
        this.keySet = createLocalJWKSet(jwks);
      } catch {
        throw new Error('SUPABASE_JWT_KEYS não contém um JWKS válido');
      }
    }
    const secret = config.get('SUPABASE_JWT_SECRET', { infer: true });
    if (!this.keySet && secret) this.secret = new TextEncoder().encode(secret);
  }

  async verify(token: string): Promise<JWTPayload> {
    try {
      const key = this.keySet ?? this.secret;
      if (!key || !this.issuer || !this.audience)
        throw new Error('Configuração JWT ausente');
      const { payload } = await jwtVerify(token, key, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: this.keySet ? ['ES256', 'HS256'] : ['HS256'],
      });
      if (typeof payload.sub !== 'string' || payload.sub.length === 0)
        throw new Error('JWT sem subject');
      return payload;
    } catch {
      throw new UnauthorizedException('Token inválido ou ausente');
    }
  }
}
