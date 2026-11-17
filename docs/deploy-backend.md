# Deploy do backend EventScore

Este procedimento publica somente o backend. O PostgreSQL `eventscore-db` permanece na stack Supabase existente e não é recriado por este Compose.

## Pré-requisitos

- Docker e Docker Compose no servidor.
- Rede Docker externa `eventscore_default` existente.
- Container `eventscore-db` saudável.
- Node 24 é usado dentro do build; Node local não é necessário para o deploy.
- Arquivo `deploy/.runtime.env` criado no servidor com modo `0600`.

## Variáveis obrigatórias

O arquivo de runtime deve conter, sem versionar valores:

- `NODE_ENV=production`
- `PORT=3000`
- `DATABASE_URL` apontando para o banco dedicado `eventscore`
- `SUPABASE_JWT_ISSUER`
- `SUPABASE_JWT_AUDIENCE`
- `SUPABASE_JWT_KEYS` ou `SUPABASE_JWT_SECRET`

As chaves devem corresponder ao Supabase Auth do projeto EventScore. Não usar credenciais do banco `postgres`, `_supabase` ou do Deefy.

## Build e execução

No diretório `deploy/`:

```bash
docker compose -f compose.backend.yaml config
docker compose -f compose.backend.yaml build api
docker compose -f compose.backend.yaml up -d --no-build api
```

O build executa `npm ci`, gera o Prisma Client depois de copiar o código e compila a aplicação. O container executa somente `node dist/main.js`; não aplica migrations, seeds ou `db push`.

O backend fica publicado apenas em `127.0.0.1:13000`, na rede `eventscore_default`, com healthcheck em `/health`. O banco externo não é declarado como serviço nem movido de stack. `on-failure:5` evita loop infinito durante indisponibilidade do banco.

## Validação pós-deploy

```bash
curl --fail http://127.0.0.1:13000/health
curl -i http://127.0.0.1:13000/api/v1/eventos/0/dias
curl --fail http://127.0.0.1:13000/api/docs-json
docker inspect eventscore-backend --format '{{.State.Status}} {{.State.Health.Status}}'
```

A rota de dias deve retornar `401` sem Bearer válido. Não criar dados de teste em produção.

## Rollback

Identifique a imagem anterior antes de substituir o container. Para voltar somente a aplicação, restaure o Compose/imagem anterior e execute:

```bash
docker compose -f compose.backend.yaml up -d --no-build api
```

Rollback de aplicação não desfaz alterações de banco. Nesta rotina não há alteração de banco.
