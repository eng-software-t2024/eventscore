# US6: persistência sobre o banco oficial

A US6 usa o `PrismaService` e o client gerado para acessar `evento` e
`dia_evento`. O schema Prisma da aplicação é o mapeamento das tabelas oficiais;
as migrations SQL V1–V12 continuam sendo a fonte de verdade, incluindo CHECKs,
triggers, funções, views e índices que não são expressos pelo Prisma.

## Fluxo de banco

Instalação e evolução do banco devem usar as migrations oficiais, em ordem:

```bash
DATABASE_URL='postgresql://.../eventscore_test' npm run db:deploy
DATABASE_URL='postgresql://.../eventscore_test' npm run db:generate
```

Não há uma migration Prisma paralela da US6 neste branch. A migration mínima
que existia na implementação inicial não foi aplicada nem incorporada à base
oficial; ela foi removida do diff para evitar dois fluxos de criação do schema.

O runtime usa apenas o client Prisma parcial necessário ao módulo de dias, mas
ele opera sobre a base completa criada por V1–V12. Não executar `prisma db push`,
`prisma migrate reset`, `prisma migrate dev` ou SQL destrutivo de
`prisma migrate diff` contra uma base oficial ou compartilhada.

## Reprodução do e2e

O teste exige explicitamente `TEST_DATABASE_URL` e falha antes de conectar ao
banco quando ela não é informada. A URL deve apontar para um banco PostgreSQL
exclusivo de testes, criado fora do ambiente compartilhado:

```bash
TEST_DATABASE_URL='postgresql://.../eventscore_test' \
npm run test:e2e -- test/dias-evento.e2e-spec.ts
```

O teste cria um administrador temporário por persistência local e login HTTP,
limpa os próprios dados ao final e não depende de credenciais externas. Use um
PostgreSQL descartável criado exclusivamente com as migrations oficiais do
repositório (V1–V12). Credenciais e URLs devem permanecer no ambiente local ou
no gerenciador de segredos; não são versionadas. `DATABASE_URL` não substitui
`TEST_DATABASE_URL` para executar essa suíte.

## Exclusão segura

O DELETE verifica `presenca` e `desafio` antes de excluir. Retorna `409` quando
há dependência e `503` somente quando as estruturas oficiais necessárias para a
verificação não estão disponíveis. Outros erros de banco não são convertidos
em `503` e não têm seus detalhes expostos na resposta HTTP.

## Limitações e dependências

As rotas usam o guard JWT integrado à aplicação. A suíte valida login HTTP com
usuário temporário persistido e não cria credenciais de produção.
