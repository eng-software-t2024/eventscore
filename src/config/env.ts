import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    SUPABASE_JWT_ISSUER: z.url().optional(),
    SUPABASE_JWT_AUDIENCE: z.string().min(1).optional(),
    SUPABASE_JWT_KEYS: z.string().min(1).optional(),
    SUPABASE_JWT_SECRET: z.string().min(1).optional(),
  })
  .superRefine((config, context) => {
    if (config.NODE_ENV !== 'production') return;
    if (!config.SUPABASE_JWT_ISSUER) {
      context.addIssue({
        code: 'custom',
        path: ['SUPABASE_JWT_ISSUER'],
        message: 'SUPABASE_JWT_ISSUER é obrigatória em produção',
      });
    }
    if (!config.SUPABASE_JWT_AUDIENCE) {
      context.addIssue({
        code: 'custom',
        path: ['SUPABASE_JWT_AUDIENCE'],
        message: 'SUPABASE_JWT_AUDIENCE é obrigatória em produção',
      });
    }
    if (!config.SUPABASE_JWT_KEYS && !config.SUPABASE_JWT_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['SUPABASE_JWT_KEYS'],
        message:
          'SUPABASE_JWT_KEYS ou SUPABASE_JWT_SECRET é obrigatório em produção',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    throw new Error(
      `Variáveis de ambiente inválidas:\n${z.prettifyError(result.error)}`,
    );
  }

  return result.data;
}
