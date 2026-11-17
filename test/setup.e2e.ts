process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??=
  process.env.TEST_DATABASE_URL ??
  'postgresql://eventscore:eventscore@127.0.0.1:5432/eventscore_test';
process.env.SUPABASE_JWT_ISSUER ??= 'https://eventscore-e2e.invalid/auth/v1';
process.env.SUPABASE_JWT_AUDIENCE ??= 'authenticated';
process.env.SUPABASE_JWT_SECRET ??=
  'eventscore-e2e-only-secret-not-a-production-credential';
delete process.env.SUPABASE_JWT_KEYS;
