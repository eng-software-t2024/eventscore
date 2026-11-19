# Sprint 06 — Registro de implementação

Registro do que foi implementado no backend durante a Sprint 06. Este documento é
atualizado a cada onda entregue; as tarefas seguem a numeração do Taiga.

- **Período:** 05 a 15/11/2026 · Homologação em 16/11/2026
- **História de referência:** US05 · Cadastro e consulta de grupos (RF03)
- **Branch:** `feat/US05-cadastro-e-consulta-de-grupos`
- **Responsável:** Lucas · **Revisor:** Ikki

## Convenções aplicadas

- Funções, métodos, variáveis e constantes em inglês. Propriedades de DTOs e
  parâmetros de rota seguem o contrato OpenAPI T06 (`nome`, `cor`,
  `quantidadeParticipantes`, `eventoId`, `grupoId`).
- Toda implementação acompanhada de testes unitários (`*.spec.ts`).
- Detalhes em [`CONTRIBUTING.md`](../CONTRIBUTING.md).

---

## Onda 1 — T21, T22 e T25 (05 a 07/11)

Módulo de grupos criado com DTOs, regras de negócio e persistência. Endpoints
(T23) e testes e2e (T24) ficam para a Onda 2.

### T21 — Módulo e DTOs

| Arquivo | Conteúdo |
|---|---|
| `src/modules/grupos/grupos.module.ts` | `GruposModule` (controller + service) |
| `src/modules/grupos/grupos.controller.ts` | `@Controller('eventos/:eventoId/grupos')` com `@ApiTags('Grupos')` e `@ApiBearerAuth()` (skeleton) |
| `src/modules/grupos/dto/criar-grupo.dto.ts` | `CriarGrupoDto`: `nome` (1–50) e `cor` (`#RRGGBB`) |
| `src/modules/grupos/dto/atualizar-grupo.dto.ts` | `AtualizarGrupoDto` (`PartialType`, campos opcionais) |
| `src/modules/grupos/dto/grupo-resumo.dto.ts` | `GrupoResumoDto`: `id`, `nome`, `cor`, `quantidadeParticipantes` |

### T22 — Regras de negócio

Implementadas em `src/modules/grupos/grupos.service.ts`:

| Método | Regra |
|---|---|
| `list(eventId)` | valida evento existente (404) e lista com contagem de participantes |
| `findById(eventId, groupId)` | valida isolamento por evento (404) |
| `create(eventId, dto)` | valida evento; duplicidade (`P2002`) vira 409 no filtro global |
| `update(eventId, groupId, dto)` | valida vínculo; bloqueio pós-resultado (`P2003`) vira 409 no filtro global |
| `remove(eventId, groupId)` | recusa exclusão com participantes (409); bloqueio pós-resultado no filtro global |

Decisões registradas em [`docs/adr/0002-bloqueio-grupos-apos-resultado.md`](adr/0002-bloqueio-grupos-apos-resultado.md).

### T25 — Persistência

- Sem migração nova: os models `Evento`, `Grupo` e `Participante` vieram no merge
  da T03 (migrações V1–V11).
- O serviço usa o `PrismaService` global com a chave composta `{ id, eventoId }`
  para garantir o isolamento por evento.

### Testes unitários (Onda 1)

| Arquivo | Cobertura |
|---|---|
| `grupos.service.spec.ts` | regras de 404/409 e fluxos de list/create/update/remove |
| `dto/criar-grupo.dto.spec.ts` | validação dos campos `nome` e `cor` (contrato) |
| `grupos.module.spec.ts` | wiring do módulo sem acesso ao banco |

---

## Onda 2 — T23 e T24 (08 e 09/11)

Endpoints HTTP expostos e cobertos por testes unitários e e2e. O controller
deixou de ser skeleton e agora usa o `GruposService`.

### T23 — Endpoints

`src/modules/grupos/grupos.controller.ts`, em `/api/v1/eventos/{eventoId}/grupos`:

| Método | Rota | Status | Descrição |
|---|---|---|---|
| `GET` | `/eventos/{eventoId}/grupos` | 200 | lista (array direto de `GrupoResumoDto`) |
| `POST` | `/eventos/{eventoId}/grupos` | 201 | cria grupo |
| `GET` | `/eventos/{eventoId}/grupos/{grupoId}` | 200 | consulta detalhe |
| `PATCH` | `/eventos/{eventoId}/grupos/{grupoId}` | 200 | atualiza parcialmente |
| `DELETE` | `/eventos/{eventoId}/grupos/{grupoId}` | 204 | exclui |

- Params numéricos validados com `ParseIntPipe` (400 em valor não numérico).
- O serviço agora retorna `GrupoResumoDto` (o `_count.participantes` é mapeado
  para `quantidadeParticipantes` via `toSummary`).

### T24 — Testes

| Arquivo | Tipo | Cobertura |
|---|---|---|
| `grupos.service.spec.ts` | unitário | regras 404/409 e mapeamento do resumo |
| `dto/criar-grupo.dto.spec.ts` | unitário | validação `nome`/`cor` |
| `grupos.module.spec.ts` | unitário | wiring sem banco |
| `test/grupos-persistencia.e2e-spec.ts` | integração (banco real) | criar/listar/consultar/atualizar/excluir, 404, isolamento, 409 |
| `test/grupos-acesso.e2e-spec.ts` | e2e HTTP | 401 (guard), fluxo CRUD, 400, 404, 409 (duplicidade) |

### Adaptação à T15 e T09 (após merge do guard)

- O `401` passou a ser aplicado pelo guard global (`JwtAuthGuard` via `APP_GUARD`):
  o controller declara `@ApiBearerAuth()` e `@ApiUnauthorizedResponse`, sem
  `@UseGuards` explícito.
- O mapeamento de erros do Prisma (`P2002`/`P2003`, incluindo o bloqueio RF03)
  saiu do `GruposService` e ficou centralizado no `HttpExceptionFilter` (T09).

---

## Onda 3 — #203 Participantes (RF04)

Módulo de participantes com listagem paginada (com filtros) e importação em duas
etapas (prévia e confirmação) a partir de CSV ou XLSX, alinhado ao contrato
front x API v0.3.

### Fluxo de importação (RF04)

| Método | Rota | Status | Descrição |
|---|---|---|---|
| `GET` | `/eventos/{eventoId}/participantes` | 200 | listagem (envelope `dados`/`paginacao`/`resumo`), filtros `?grupoId=`, `?turma=`, `?busca=` |
| `POST` | `/eventos/{eventoId}/participantes/importacao/previa` | 200 | prévia (não persiste): `totalLinhas`, `linhasValidas`, `linhasComErro`, `linhas[]` |
| `POST` | `/eventos/{eventoId}/participantes/importacao` | 201 | grava tudo após validação; com erro responde **422** com as linhas e não grava |

- Arquivo **CSV** (UTF-8, vírgula ou ponto e vírgula) ou **XLSX**, com colunas
  `nome,matricula,turma,grupo`; `grupo` é o **nome** do grupo.
- Cada linha da prévia traz `{ linha, nome, matricula, turma, grupo, status, motivoErro }`
  com `status` `VALIDO`/`ERRO` e `motivoErro` `null` nas válidas.
- Validações: `nome` (obrigatório, ≤150), `matricula` (obrigatória, ≤20, única por
  evento e no arquivo), `turma` (obrigatória, ≤10), `grupo` (obrigatório e existente
  no evento); linha em branco é erro.
- Upload limitado a **5 MB** via `FileInterceptor` (multer).
- Parsing com `csv-parse` e `exceljs` (dependências novas).

### Arquivos

| Arquivo | Conteúdo |
|---|---|
| `src/modules/participantes/participantes.module.ts` | `ParticipantesModule` |
| `src/modules/participantes/participantes.controller.ts` | rotas de listagem e importação |
| `src/modules/participantes/participantes.service.ts` | regras, `parseCsv`/`parseXlsx` e `validateRows` |
| `src/modules/participantes/dto/participante-resumo.dto.ts` | `ParticipanteResumoDto` (`grupo` + `grupoId`) |
| `src/modules/participantes/dto/importacao.dto.ts` | prévia, confirmação e linha |
| `src/modules/participantes/dto/listar-participantes-query.dto.ts` | filtros de listagem |

### Ajustes após revisão

- Rotas da importação seguem o contrato (`/importacao/previa` e `/importacao`).
- Prévia com todas as linhas (`status`/`motivoErro`) e confirmação sem gravação parcial.
- Filtros `grupoId`/`turma`/`busca`; campo `grupo` no resumo.
- CSV com vírgula/ponto-e-vírgula e XLSX; limite de 5 MB; linha em branco vira erro.
- Filtro global passa a preservar campos extras (ex.: `linhas` no 422) e a tratar
  arquivo acima do limite.

### Testes

| Arquivo | Tipo | Cobertura |
|---|---|---|
| `participantes.service.spec.ts` | unitário | listagem/filtros, prévia, validações, confirmação/422 |
| `participantes.module.spec.ts` | unitário | wiring sem banco |
| `test/participantes-persistencia.e2e-spec.ts` | integração | listar/importar, duplicidade, grupo inexistente, 422 |
| `test/participantes-acesso.e2e-spec.ts` | e2e HTTP | 401, upload multipart, XLSX, limite de 5 MB, 422, 400, 404, filtros |
| `test/grupos-acesso.e2e-spec.ts` | e2e HTTP | trigger RF03 real no PostgreSQL para POST/PATCH/DELETE |

Cobertura local após a revisão: 226 testes unitários e 46 testes e2e aprovados.

---

## Onda 4 — #206 parte 2: bônus e penalidades

Módulo `src/modules/bonificacoes-penalidades/` para lançamento de bônus por grupo
e penalidades, usando as tabelas e triggers da migração V9.

### Rotas

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/eventos/{eventoId}/bonificacoes` | lista bônus lançados |
| `PUT` | `/eventos/{eventoId}/bonificacoes/{grupoId}` | substitui bônus do grupo de forma idempotente |
| `GET` | `/eventos/{eventoId}/penalidades` | lista penalidades |
| `POST` | `/eventos/{eventoId}/penalidades` | cria penalidade |
| `PATCH` | `/eventos/{eventoId}/penalidades/{penalidadeId}` | atualiza penalidade |
| `DELETE` | `/eventos/{eventoId}/penalidades/{penalidadeId}` | exclui penalidade (204) |

- Bônus validado contra o teto do `item_bonificacao` e contra o evento do grupo.
- Penalidade exige justificativa e respeita `penalidadeMin`/`penalidadeMax` do evento.
- Faixa de penalidade ainda é validada no backend, conforme ADR 0003; não foi criada
  migração nova.
- Os itens de bonificação e seus tetos continuam pertencendo à configuração do evento
  (#199); a #206 apenas lança os valores por grupo.

### Testes da Onda 4

- Unitários para teto, faixa, evento/grupo e CRUD.
- E2E com PostgreSQL real para JWT, bônus, penalidades e respostas `422`/`204`.
- Cobertura atual após a revisão da PR: 512 testes unitários e 114 testes e2e.

### Ajustes após revisão da PR #45

- `PUT /bonificacoes/{grupoId}` recebe **array JSON direto** de
  `{ itemBonificacaoId, valor }`, validado por `ParseArrayPipe` (corrige `400` do
  front e evita `500` com `valor` inválido).
- Atualização de bônus ficou **idempotente** e auditada por diferença (INSERT/UPDATE/
  DELETE só quando muda; reenvio igual não grava nem audita), preservando o
  `id_bonificacao_grupo`.
- `justificativa` (e `descricao`) das penalidades são normalizadas com `@Transform`,
  barrando texto só com espaços com `400`.
- e2e cobre auditoria e reenvio idempotente via `GET /api/v1/auditoria`.

---

## Onda 4 — #206 parte 3: classificação e desempate

Módulo `src/modules/classificacao/`, seguindo o ADR 0003 (item 5): a classificação é
calculada na consulta e só é gravada como apuração quando a comissão registra um
desempate manual.

### Rotas

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/eventos/{eventoId}/classificacao` | classificação calculada na hora (RF12, RF13) |
| `POST` | `/eventos/{eventoId}/desempates` | registra o desempate manual (RF14) |

- Total = desafios lançados pela tabela de pontos + bonificação − penalidade. Os
  critérios configurados são aplicados em ordem; o que eles não separam fica em
  `resumo.empatesPendentes`, com os grupos na mesma posição.
- O `POST /desempates` grava, na mesma transação, uma `apuracao` nova
  (`PROVISORIA`, versão seguinte), a `classificacao_grupo` já decidida, as decisões
  em `desempate_manual` e a auditoria (`APURACAO` e `DESEMPATE_MANUAL`).
- Regras do envio (`422`): todos os desafios do evento precisam estar lançados
  (o desempate decide a classificação final, Regimento Art. 16); precisa haver empate; cada empate vem inteiro e com as
  posições que ocupa; todos os empates pendentes vão juntos. Grupo de outro evento
  responde `404`.
- Um novo envio substitui a decisão anterior dos mesmos grupos (`vigente = false` e
  `id_decisao_anterior`). Reenviar a mesma decisão não grava nada.
- A decisão manual só vale enquanto os grupos continuam empatados com os mesmos
  pontos. Uma correção que desfaz o empate passa a valer; se o mesmo empate voltar
  com os mesmos pontos, a decisão antiga volta a valer.

### Mudança para os relatórios (#207)

O cálculo da classificação saiu de `RelatorioParcialService` e foi para
`ClassificacaoService` (`calculo-classificacao.ts`). O relatório parcial, o relatório
final e a tela usam o mesmo cálculo. A apuração individual (#204) deve partir dele
também.

### Testes

- Unitários do cálculo (soma, critérios, validade da decisão manual) e das regras do
  `POST /desempates`.
- E2E com PostgreSQL real: empate pendente, envios inválidos sem gravar, registro com
  auditoria, reenvio igual, troca da decisão e correção que desfaz o empate.

---

## Pendências

- **#201 Grupos** — história do Taiga que fecha a US05 com o front-end (revisão do
  contrato e integração da tela).
- **#203 Participantes** — integração da tela com o front-end.
- **#206** — integração da tela de lançamentos com o front-end e revisão do contrato
  v0.2 já publicado.
- **Revisão e merge** — abrir PR para a `main` e aprovação do revisor (Ikki).
