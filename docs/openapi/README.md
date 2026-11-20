# EventScore — Especificação OpenAPI e Processo de Evolução de Contrato (US02 / T07 / T10)

Este diretório contém as especificações formais **OpenAPI 3.0.3** da API RESTful do **EventScore (Arena Comp 2026)** e o processo oficial de publicação, versionamento e governança de contratos compartilhados entre as equipes de **Backend** e **Frontend**.

---

## 1. Versão Atual do Contrato: `v0.3.0` (Contrato Completo — Sprints 01 e 02)

A versão **`v0.1.0`** documentou o escopo fechado e aprovado da **Sprint 01 (S1)**, formalizado no documento [docs/contrato-api-t06.md](../contrato-api-t06.md) e alinhado com a versão **v0.3** do contrato do Frontend (aprovada formalmente em 29/10/2026 por **Luiz Meneses** — Frontend Lead).

A versão **`v0.2.0`** consolida **100% da API RESTful do EventScore** (**44 operações em 30 rotas** distribuídas em 12 módulos/tags), incorporando as decisões do [ADR 0003](../adr/0003-divergencias-banco-contrato.md) (migração V12 sem `MAIOR_PRESENCA`), do [ADR 0004](../adr/0004-auditoria-lancamentos.md) (auditoria), o contrato aprovado de **Desafios** (**US #202 / #245**, [PR #31](https://github.com/hanrrysantos/event-score/pull/31)) e todos os endpoints de **Configuração (`#199`)**, **Participantes (`#203`)**, **Frequência (`#205`)**, **Resultados e Lançamentos (`#223` / `#206`)**, **Auditoria (`RF18`)**, **Classificação e Desempates (`#206 pt 3`)**, **Apuração Individual (`#204`)** e **Relatórios (`#207` / `#228` / `#229`)**.

A versão **`v0.3.0`** acrescenta o `id` de cada item de bonificação na resposta de `GET /eventos/{eventoId}/bonificacoes` e de `PUT /eventos/{eventoId}/bonificacoes/{grupoId}` (`BonificacaoItemResumoDto`). É o `registroId` usado em `GET /auditoria?entidade=BONIFICACAO_GRUPO` para o histórico do bônus (RF18, [PR #51](https://github.com/hanrrysantos/event-score/pull/51)). Mudança compatível (seção 3.2): campo novo só na resposta, o corpo do `PUT` não muda. O arquivo continua com o nome `openapi-v0.2.yaml` para não quebrar as referências abaixo.

> **Compatibilidade de Referências (`$ref`) e Scripts:** A especificação oficial `v0.3.0` é publicada em [`docs/openapi/openapi-v0.2.yaml`](./openapi-v0.2.yaml) e mantida **100% idêntica e sincronizada** em [`docs/openapi/openapi-v0.1.yaml`](./openapi-v0.1.yaml), garantindo compatibilidade imediata com os scripts do Frontend (`web/package.json` `api:tipos`), o mock (`web/mock/openapi-mock.yaml`) e os recortes de proposta em `docs/openapi/propostas/`.

### Links de Consumo para o Frontend:
- **Swagger UI Local (Runtime NestJS):** `http://localhost:3000/api/docs` (especificação JSON em `http://localhost:3000/api/docs-json`)
- **OpenAPI Spec Estática (`v0.3.0`):** [`docs/openapi/openapi-v0.2.yaml`](./openapi-v0.2.yaml) (sincronizada em [`docs/openapi/openapi-v0.1.yaml`](./openapi-v0.1.yaml))
- **Mock Local via Prism:** `npx @stoplight/prism-cli mock docs/openapi/openapi-v0.2.yaml -p 4010`

### Registro de Aprovação e Histórico de Versões:
| Versão | Escopo | Aprovações / Alinhamentos | Status |
|---|---|---|---|
| `v0.1.0` | Baseline Sprint 01 (17 operações: Auth, Eventos, Dias e Grupos) | **Luiz Meneses** (Frontend Lead) | Publicado e Aprovado |
| `v0.2.0` | Contrato completo Sprints 01 + 02 (44 operações em 12 módulos), ADR 0003 (V12 sem `MAIOR_PRESENCA`), Participantes (PR #29), Desafios `#245` (PR #31) e Resultados `#223` (PR #35) | **Luiz Meneses** (Frontend Lead — T06, PR #31 e `#223`), **Saylon** (Revisor Backend — PR #31 e PR #35) e **ADR 0003** | Publicado e Consolidado |
| `v0.3.0` | `id` dos itens em `BonificacaoItemResumoDto` (histórico de bônus, RF18 — PR #51) | Revisão do PR #51 (mudança compatível, sem aceite prévio do front) | Publicado |

### Escopo Completo de Endpoints (`v0.3.0` — 44 operações):
| Módulo | Método | Rota | Descrição |
|---|---|---|---|
| **Auth** | `POST` | `/api/v1/auth/login` | Autenticação com e-mail/senha, retornando JWT e `expiraEm` UTC |
| **Auth** | `GET` | `/api/v1/auth/me` | Consulta do perfil do usuário autenticado via Bearer JWT |
| **Eventos** | `GET` | `/api/v1/eventos` | Listagem simples de eventos cadastrados |
| **Eventos** | `GET` | `/api/v1/eventos/ativo` | Consulta do evento atualmente ativo no sistema (RF02) |
| **Eventos** | `GET` | `/api/v1/eventos/{eventoId}` | Detalhes do evento, incluindo indicador `temResultado` |
| **Eventos** | `POST` | `/api/v1/eventos` | Criação de novo evento (inicia inativo) |
| **Eventos** | `PATCH` | `/api/v1/eventos/{eventoId}` | Atualização parcial de dados cadastrais do evento |
| **Eventos** | `POST` | `/api/v1/eventos/{eventoId}/ativar` | Ativação do evento com desativação do anterior (RF02) |
| **Dias** | `GET` | `/api/v1/eventos/{eventoId}/dias` | Listagem cronológica dos dias de competição |
| **Dias** | `POST` | `/api/v1/eventos/{eventoId}/dias` | Cadastro de dia de evento dentro do intervalo oficial |
| **Dias** | `PATCH` | `/api/v1/eventos/{eventoId}/dias/{diaId}` | Atualização da data ou número ordinal do dia |
| **Dias** | `DELETE` | `/api/v1/eventos/{eventoId}/dias/{diaId}` | Exclusão de dia (`409` se houver presenças/desafios; `503` se verificação indisponível) |
| **Grupos** | `GET` | `/api/v1/eventos/{eventoId}/grupos` | Listagem dos grupos do evento com total de participantes |
| **Grupos** | `GET` | `/api/v1/eventos/{eventoId}/grupos/{grupoId}` | Consulta individual de um grupo |
| **Grupos** | `POST` | `/api/v1/eventos/{eventoId}/grupos` | Criação de grupo com nome e cor `#RRGGBB` (inicia com 0 participantes) |
| **Grupos** | `PATCH` | `/api/v1/eventos/{eventoId}/grupos/{grupoId}` | Atualização de grupo (bloqueado por RF03 se houver resultados) |
| **Grupos** | `DELETE` | `/api/v1/eventos/{eventoId}/grupos/{grupoId}` | Exclusão de grupo (`409` por RF03 se houver resultados ou ADR 0003 se houver participantes) |
| **Configuração** | `GET` | `/api/v1/eventos/{eventoId}/configuracao` | Consulta da configuração completa de pontuação e desempate do evento (`#199`) |
| **Configuração** | `PUT` | `/api/v1/eventos/{eventoId}/configuracao` | Substituição idempotente da configuração do evento (`422` se violar regras de faixa/critérios) |
| **Participantes** | `GET` | `/api/v1/eventos/{eventoId}/participantes` | Listagem paginada de participantes com filtros `grupoId`, `turma` e `busca` (`#203`) |
| **Participantes** | `POST` | `/api/v1/eventos/{eventoId}/participantes/importacao/previa` | Validação prévia de planilha `.csv` (`,` ou `;`) ou `.xlsx` até 5 MB sem gravar (RF04) |
| **Participantes** | `POST` | `/api/v1/eventos/{eventoId}/participantes/importacao` | Importação transacional de participantes (`201` se 100% válido; `422` com linhas se houver erro) |
| **Frequência** | `GET` | `/api/v1/eventos/{eventoId}/dias/{diaId}/presencas` | Grade de presença dos participantes no dia com resumo de presentes/ausentes (`#205`) |
| **Frequência** | `PUT` | `/api/v1/eventos/{eventoId}/dias/{diaId}/presencas/{participanteId}` | Registro idempotente de presença individual no dia (RF07) |
| **Desafios** | `GET` | `/api/v1/eventos/{eventoId}/desafios` | Listagem dos desafios do evento com tabela de pontuação ordenada (`#245` / PR #31) |
| **Desafios** | `POST` | `/api/v1/eventos/{eventoId}/desafios` | Criação de desafio e tabela de pontos `1..N` por grupo na mesma transação |
| **Desafios** | `GET` | `/api/v1/eventos/{eventoId}/desafios/{desafioId}` | Consulta individual de desafio no contexto do evento |
| **Desafios** | `PATCH` | `/api/v1/eventos/{eventoId}/desafios/{desafioId}` | Atualização parcial; `409` apenas se `diaId` ou conteúdo de `pontosColocacao` mudarem após resultados |
| **Desafios** | `DELETE` | `/api/v1/eventos/{eventoId}/desafios/{desafioId}` | Exclusão de desafio sem vínculos impeditivos (`409` se houver critério de desempate ou resultado) |
| **Resultados** | `GET` | `/api/v1/eventos/{eventoId}/desafios/{desafioId}/resultados` | Consulta das colocações/ausências dos grupos no desafio (`id: null` se pendente, `#223`) |
| **Resultados** | `PUT` | `/api/v1/eventos/{eventoId}/desafios/{desafioId}/resultados` | Gravação idempotente de todas as colocações do desafio preservando `id` e gerando auditoria |
| **Auditoria** | `GET` | `/api/v1/auditoria` | Histórico cronológico de alterações de um registro (`?entidade=&registroId=`, RF18) |
| **Bonificações** | `GET` | `/api/v1/eventos/{eventoId}/bonificacoes` | Consulta de bonificações atribuídas a cada grupo por item (RF10) |
| **Bonificações** | `PUT` | `/api/v1/eventos/{eventoId}/bonificacoes/{grupoId}` | Registro idempotente de bonificações do grupo (`422` se exceder teto do item) |
| **Penalidades** | `GET` | `/api/v1/eventos/{eventoId}/penalidades` | Listagem de penalidades disciplinares aplicadas no evento (RF11) |
| **Penalidades** | `POST` | `/api/v1/eventos/{eventoId}/penalidades` | Aplicação de penalidade validando a faixa `[penalidadeMin, penalidadeMax]` (`422` fora da faixa) |
| **Penalidades** | `PATCH` | `/api/v1/eventos/{eventoId}/penalidades/{penalidadeId}` | Correção de penalidade lançada com registro em auditoria |
| **Penalidades** | `DELETE` | `/api/v1/eventos/{eventoId}/penalidades/{penalidadeId}` | Exclusão de penalidade lançada (`204`) |
| **Classificação** | `GET` | `/api/v1/eventos/{eventoId}/classificacao` | Classificação geral calculada em tempo real com critérios V12 e empates pendentes (`#206 pt 3`) |
| **Desempates** | `POST` | `/api/v1/eventos/{eventoId}/desempates` | Registro de decisão manual de desempate com justificativa e snapshot de apuração (RF14) |
| **Apuração** | `GET` | `/api/v1/eventos/{eventoId}/apuracao` | Apuração individual de ponto extra paginada (`409` se houver empate pendente, `#204`) |
| **Relatórios** | `GET` | `/api/v1/eventos/{eventoId}/relatorios/parcial` | Download binário (`PDF`/`XLSX`) do relatório parcial por grupo (`#228`, sem bloqueio `409`) |
| **Relatórios** | `GET` | `/api/v1/eventos/{eventoId}/relatorios/final` | Download binário (`PDF`/`XLSX`) do relatório final por participante (`#229`, `409` se empate) |
| **Relatórios** | `GET` | `/api/v1/eventos/{eventoId}/relatorios/final/previa` | Prévia JSON do relatório final agrupada por turma (`#229`, `409` se empate) |

---

## 2. Convenções e Padrões Compartilhados

1. **URL Base e Prefixos:**
   - Servidor local padrão: `http://localhost:3000/api/v1`.
   - Rotas em português, kebab-case, no plural e sem acentuação (ex.: `/itens-bonificacao`).
   - Identificadores de caminho no padrão `{nomeId}` (ex.: `{eventoId}`, `{diaId}`, `{grupoId}`).
2. **Payloads e Atributos:**
   - Comunicação JSON estritamente em `camelCase`.
   - O banco de dados PostgreSQL utiliza `snake_case`, com conversão garantida na camada de serviço.
3. **Formatos de Data e Hora:**
   - Datas puras (sem horário): ISO 8601 estendido `YYYY-MM-DD` (ex.: `2026-11-20`).
   - Datas com horário: ISO 8601 em UTC `YYYY-MM-DDTHH:mm:ssZ` (ex.: `2026-11-23T22:38:00Z`).
4. **Envelopes e Listagens:**
   - Recursos individuais: retornam diretamente o objeto JSON.
   - Listas simples: retornam array direto `[...]`.
   - Listas com metadados/métricas: envelope `{ "dados": [...], "paginacao"?: {...}, "resumo"?: {...} }`.
5. **Segurança:**
   - Sessão via cabeçalho `Authorization: Bearer <token>` em todas as rotas privadas.
   - Apenas a rota `POST /auth/login` é pública (`security: []`).
6. **Formato Padrão de Erros (NestJS):**
   - Erros operacionais e regras de negócio (`401`, `404`, `409`, `422`):
     ```json
     {
       "statusCode": 404,
       "message": "Recurso não encontrado",
       "error": "Not Found"
     }
     ```
   - Erros de validação de formulários/DTOs (`400` disparado pelo `ValidationPipe`):
     ```json
     {
       "statusCode": 400,
       "message": [
         "email deve ser um endereço de e-mail válido",
         "senha não pode estar vazia"
       ],
       "error": "Bad Request"
     }
     ```

---

## 3. Processo de Evolução e Versionamento do Contrato

Adotamos os princípios de **Versionamento Semântico (SemVer)** adaptados para contratos de API REST (`vMAJOR.MINOR.PATCH`), aliados a um fluxo estrito de governança **Contract-First**.

### 3.1. Regra de Governança
Qualquer alteração em **paths**, **parâmetros**, **schemas** ou **status codes** exige obrigatoriamente um **Pull Request (PR) de atualização do contrato** com **revisão e aprovação explícita do Frontend** antes do início ou merge da implementação no Backend.

### 3.2. Classificação de Mudanças
- **Compatíveis (*Non-breaking*):**
  - Adição de novos endpoints e recursos.
  - Adição de campos opcionais em requisições (`requestBody` ou `query`).
  - Adição de novos campos em respostas (`response`).
  - **Ação de versão:** Bump de `MINOR` (ou `PATCH` para ajustes documentais/exemplos sem mudança estrutural).
- **Incompatíveis (*Breaking*):**
  - Remoção ou renomeação de rotas ou campos existentes.
  - Alteração de tipos de dados (ex.: `string` para `number`, ou remoção/renomeação de valores de `enum`).
  - Inclusão de novos campos obrigatórios em requisições existentes.
  - Mudança na semântica de status codes (ex.: alterar retorno de erro ou sucesso esperado pelo cliente).
  - **Ação de versão:** Exige alinhamento prévio (ADR / Workshop), aprovação explícita do **Frontend Lead (Luiz Meneses)** e bump de versão.

### 3.3. Ciclo de Vida das Versões (`0.x.y` vs. `>= 1.0.0`)
- **Fase Inicial de Desenvolvimento (`0.x.y` — Sprints 01 e 02):**
  - **`0.x.0` (MINOR):** Acréscimo de novos módulos (ex.: Sprint 02 com Desafios, Presenças, Bonificações, Configuração) ou ajustes estruturais aprovados previamente entre Backend e Frontend.
  - **`0.x.y` (PATCH):** Correções de documentação, adição de exemplos realistas, refinamentos textuais de mensagens de erro (como a mensagem canônica da RF03 `"os grupos não podem mais ser alterados porque já há resultado lançado"`) ou ajustes sem impacto retrocompatível.
- **Pós-Homologação (`>= 1.0.0`):**
  - **`MAJOR`:** Reservado para mudanças incompatíveis (*breaking changes*).
  - **`MINOR`:** Evoluções retrocompatíveis (*non-breaking*).
  - **`PATCH`:** Correções e esclarecimentos de especificação que não alterem a semântica de dados.

### 3.4. Tabela Comparativa de Mudanças:

| Tipo de Mudança | Exemplo Prático | Classificação | Ação Requerida |
|---|---|---|---|
| Adicionar novo endpoint | `GET /api/v1/eventos/{eventoId}/desafios` | **Compatível (Non-breaking)** | PR de contrato + bump de `MINOR` |
| Adicionar campo opcional no body | `PATCH /eventos/{id}` aceita `descricao?` | **Compatível (Non-breaking)** | PR de contrato + bump de `MINOR` |
| Adicionar campo novo na resposta | `GET /eventos` inclui `totalGrupos` | **Compatível (Non-breaking)** | PR de contrato + bump de `MINOR` |
| Renomear ou remover rota/campo | Renomear `dataInicio` para `inicio` | **Incompatível (Breaking)** | Alinhamento prévio (ADR/Workshop), aprovação do Frontend Lead e bump de versão |
| Novo campo obrigatório em requisição | Tornar `ano` obrigatório no `PATCH` | **Incompatível (Breaking)** | Alinhamento prévio (ADR/Workshop), aprovação do Frontend Lead e bump de versão |
| Alterar tipo ou semântica de status code | Mudar tipo de campo ou código de erro | **Incompatível (Breaking)** | Alinhamento prévio (ADR/Workshop), aprovação do Frontend Lead e bump de versão |

### 3.5. Passo a Passo do Fluxo de Governança:
1. **Identificação da Necessidade:** Qualquer membro do Backend ou Frontend abre o apontamento no canal de integração do projeto.
2. **Alinhamento e Registro (ADR / Workshop):** Mudanças estruturais ou incompatíveis são registradas em ADR (`docs/adr/`) e/ou ata de contrato (`docs/contrato-api-t06.md`).
3. **Atualização do OpenAPI:** O arquivo `docs/openapi/openapi-v0.1.yaml` (ou nova versão) é atualizado em branch dedicada.
4. **Revisão Cruzada Obrigatória (Pull Request):** O PR de alteração do contrato precisa obrigatoriamente de aprovação explícita do **Frontend Lead (Luiz Meneses)** e revisão do Backend antes da implementação no código.

---

## 4. Guia Prático para o Frontend: Mocks e Validação

A especificação OpenAPI v0.1 foi concebida com **exemplos realistas em 100% dos schemas e respostas**, possibilitando ao time de Frontend desenvolver telas e componentes imediatamente, mesmo antes da implementação dos controllers e banco de dados.

### 4.1. Execução de Servidor de Mock com Prism (Recomendado)
O **Stoplight Prism** cria um servidor HTTP local simulando a API real a partir do arquivo OpenAPI, validando cabeçalhos e respondendo com os exemplos declarados.

Para iniciar o servidor de mock sem necessidade de instalação prévia:

```bash
# Executa o mock na porta 4010
npx -y @stoplight/prism-cli mock docs/openapi/openapi-v0.1.yaml -p 4010
```

#### Testando uma chamada mockada:
```bash
# Login mockado
curl -X POST http://localhost:4010/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@arena.com", "senha": "SenhaForte@2026"}'

# Consulta do evento ativo
curl -X GET http://localhost:4010/api/v1/eventos/ativo \
  -H "Authorization: Bearer mock-token"
```

#### Ativando validação rigorosa de requisições:
```bash
# Retorna erro 422 automaticamente caso o frontend envie payloads fora da especificação
npx -y @stoplight/prism-cli mock docs/openapi/openapi-v0.1.yaml -p 4010 --errors
```

---

### 4.2. Visualização Interativa no Swagger UI / Editor
1. **Via Servidor Local (NestJS Runtime):** Com a aplicação rodando (`npm run start:dev`), acesse `http://localhost:3000/api/docs` (ou baixe o JSON dinâmico em `http://localhost:3000/api/docs-json`).
2. **Via Web (Swagger Editor):** Acesse [https://editor.swagger.io](https://editor.swagger.io) e importe o arquivo `docs/openapi/openapi-v0.1.yaml`.
3. **Via VS Code / Antigravity IDE:**
   - Instale a extensão `OpenAPI (Swagger) Editor` ou `Swagger Viewer`.
   - Abra o arquivo `openapi-v0.1.yaml` e pressione `Shift + Alt + P` para visualizar a interface interativa.

---

### 4.3. Geração Automática de Tipos TypeScript e Clientes (Orval / MSW)
O frontend pode gerar tipos TypeScript e funções de fetch / React Query automaticamente a partir do OpenAPI.

#### Exemplo de configuração `orval.config.ts`:
```typescript
import { defineConfig } from 'orval';

export default defineConfig({
  eventScore: {
    input: '../event-score/docs/openapi/openapi-v0.1.yaml',
    output: {
      target: './src/api/generated/endpoints.ts',
      schemas: './src/api/generated/models',
      client: 'react-query',
      mock: true, // Gera handlers para MSW (Mock Service Worker)
    },
  },
});
```

Para gerar os arquivos:
```bash
npx -y orval
```

---

### 4.4. Validação e Linting do Arquivo OpenAPI (Spectral)
Para garantir que futuras alterações no YAML não introduzam violações de sintaxe ou de boas práticas da especificação OpenAPI 3.0:

```bash
npx -y @stoplight/spectral-cli lint docs/openapi/openapi-v0.1.yaml
```

## 5. Propostas de novos recortes

Os arquivos abaixo servem para revisão e alinhamento. Sua presença no
repositório não publica uma nova versão oficial nem comprova implementação
dos endpoints. Aplicam-se as aprovações da seção 3.1.

| Recorte | Documento | OpenAPI proposto |
| --- | --- | --- |
| Cadastro de desafios — #245 | [Decisões e dependências](propostas/desafios-t245.md) | [YAML](propostas/desafios-t245.yaml) |
| Colocações nos desafios — #223 / US #206 | [Decisões e casos de aceite](propostas/resultados-t223.md) | [YAML](propostas/resultados-t223.yaml) |
