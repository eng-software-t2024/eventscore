# Taiga #223 — Proposta de contrato de colocações da US #206

Status: proposta para revisão do frontend e backend. A #223 continua
em andamento; este recorte não implementa resultados nem conclui a história.

O [OpenAPI da proposta](./resultados-t223.yaml) descreve as duas operações
de colocações por desafio (RF08/RF09), com a gravação de auditoria (RF18).
Não modifica o OpenAPI oficial v0.1 nem publica a versão v0.2. O mock é uma
referência de compatibilidade, não evidência de contrato oficial aprovado.

## Base e escopo

Referência da `main`: `cac73e5d9078a1918f2ebb63a3b4aa9459e97f90`, merge do
PR #34, que disponibilizou `AuditoriaService` e `@CurrentUserId()`.

- Tela: `web/src/pages/lancamentos/AbaColocacao.tsx` e `regras.ts`.
- Mock: `web/mock/openapi-mock.yaml`, caminho `.../desafios/{desafioId}/resultados`.
- [Contrato T06](../../contrato-api-t06.md): PUT idempotente, preservação dos
  IDs para o histórico e erros de domínio com 422.
- Migrações V4 e V5: ausência/colocação, unicidade, vínculos por evento,
  `fn_validar_resultado_desafio` e `vw_resultado_pontuado`.
- [ADR 0004](../../adr/0004-auditoria-lancamentos.md): auditoria transacional,
  imutável e sem anotação adicional para reenvio sem mudança.
- [Proposta #245](./desafios-t245.md): tabela de pontos do desafio e bloqueio
  de mudança efetiva de dia/tabela após resultados.

O recorte cobre a parte de Gustavo, #223. Bônus e penalidades (#224),
classificação e desempate (#225), conversão em ponto extra e apuração
permanecem nas respectivas entregas. `GET /auditoria`, consultado pelo botão
Histórico, não faz parte desta proposta: é entregue pela #255 (parte 2).

## Interface para revisão

Prefixo `/api/v1`, autenticação Bearer JWT e erros no envelope NestJS.

| Operação | Resposta | Corpo |
| --- | --- | --- |
| GET `/eventos/{eventoId}/desafios/{desafioId}/resultados` | 200 | Array com uma linha por grupo do evento, em ordem de `grupoId`. |
| PUT no mesmo caminho | 200 | Array completo salvo, com IDs e pontos, na mesma ordem estável. |

As respostas têm schemas separados: GET usa `ResultadosDto`/`ResultadoDto`,
com `id` anulável para representar pendências. PUT usa
`ResultadosSalvosDto`/`ResultadoSalvoDto`, com `id` inteiro obrigatório e não
anulável. `colocacao` continua anulável em ambos para representar ausência.

Entrada do PUT para dois grupos presentes:

```json
[
  { "grupoId": 1, "colocacao": 1, "ausente": false },
  { "grupoId": 2, "colocacao": 2, "ausente": false }
]
```

Resposta com tabela de pontos `1º = 100` e `2º = 80`:

```json
[
  { "id": 11, "grupoId": 1, "colocacao": 1, "ausente": false, "pontos": 100 },
  { "id": 12, "grupoId": 2, "colocacao": 2, "ausente": false, "pontos": 80 }
]
```

O cliente não envia `id`, `pontos`, `usuarioId`, `operacaoId` nem o evento
no corpo. O contexto vem da URL; o autor vem do JWT. Campos extras e tipos
inválidos retornam 400. Não converter strings numéricas ou booleanas.

## Regras propostas

1. **Leitura sem gravação.** GET valida evento e desafio no mesmo contexto e
   inclui grupos ainda não lançados com `id: null`, `colocacao: null`,
   `ausente: false` e `pontos: 0`. Isso representa pendência, não ausência.
   Um desafio válido sem grupos retorna `[]`.
2. **Substituição do conjunto.** PUT exige array não vazio, com exatamente
   uma linha para cada grupo atual do evento. Não permite salvar só o grupo
   alterado. Não muda a composição dos grupos nem cria desafios.
3. **Isolamento.** Evento/desafio inexistente, desafio de outro evento ou
   grupo inexistente/de outro evento retorna 404. Conferir o vínculo real,
   não apenas a existência isolada do ID.
4. **Ausência explícita.** Ausente exige `colocacao: null` e recebe zero.
   Presente exige colocação inteira positiva. A combinação de campos
   incompatível dá 422. Depois de salvar, não há linha pendente.
5. **Sequência dos presentes.** Com P presentes, colocações únicas devem
   formar `1..P`; os ausentes não ocupam posição. Isso vem da função da V5,
   não apenas da validação atual do formulário. Todos ausentes é permitido.
6. **Pontuação do desafio.** Cada colocação utilizada precisa ter pontos
   configurados em `pontos_colocacao`. Ausência e pendência valem zero. A
   conversão de classificação em ponto extra não participa deste cálculo.
7. **Correção e idempotência.** Preservar a chave de cada resultado, mesmo
   ao alternar ausência ou trocar o 1º com o 2º lugar. A ordem de entrada
   não importa. Reenvio igual não cria novos resultados nem histórico.
8. **Atomicidade.** Validar e salvar o conjunto completo e seu histórico na
   mesma transação. Qualquer falha desfaz tudo. Serializar gravações do mesmo
   desafio para não intercalar dois conjuntos concorrentes.

Grupo repetido/omitido, colocação repetida/com lacunas, combinação de ausência
inconsistente e falta de pontuação para uma colocação utilizada retornam 422.
Array vazio, campos ausentes/extras, números fora do intervalo do tipo SQL,
fracionários, strings e null em campos não anuláveis retornam 400.

O schema descreve a estrutura. Cobertura de grupos, combinações de campos,
unicidade e sequência dependem da validação do domínio; não são garantidas
apenas pela validação OpenAPI.

## Gravação e auditoria após o aceite

- Usar o `AuditoriaService.record(tx, ...)` com entidade `RESULTADO_DESAFIO`.
- Obter o usuário por `@CurrentUserId()` e gerar um UUID de operação no
  servidor, compartilhado pelas anotações da requisição.
- Comparar os valores originais e finais de `colocacao` e `ausente` de cada
  resultado. Primeiro lançamento gera INSERT; correção gera UPDATE apenas
  para as linhas alteradas. Reenvio igual não gera anotação.
- Não apagar/recriar resultados para substituir o conjunto: seus IDs ligam
  o botão Histórico às anotações anteriores.
- A unicidade parcial da V4 é imediata: trocar duas posições com dois updates
  diretos pode falhar no primeiro. Planejar a transição dentro da transação,
  preservando IDs, sem expor ou auditar estados intermediários. A estratégia
  precisa de teste real no PostgreSQL, inclusive com rollback.
- A função `fn_validar_resultado_desafio` da V5 não é um trigger automático.
  A implementação deverá validar o conjunto e chamar a função antes do
  commit, mapeando erros de domínio sem expor detalhes SQL.
- Testes que gravarem auditoria usam dados próprios em banco exclusivo de
  testes. Não tentar apagar evento/usuário auditado no teardown (ADR 0004).

Não há mudança de schema/migração prevista para este recorte.

## Decisões pendentes e limites da integração

Estas escolhas ainda precisam de aceite explícito do frontend e alinhamento
de Ikki para incorporação/versionamento do contrato. A revisão de Saylon e o
ajuste solicitado estão registrados abaixo:

- Confirmar o PUT completo, 200 com array, tratamento de ausências e sequência
  `1..P`. A tela hoje impede repetição, mas permite selecionar posições com
  lacunas; deverá apresentar a mensagem 422 ou antecipar essa validação.
- Confirmar os erros 400/404/422 e a distinção entre pendente e ausente no GET.
- `GET /auditoria` é entregue pela #255 (parte 2) e busca o histórico pelo
  ID do resultado; por isso o PUT precisa preservar os IDs. A incorporação ao
  contrato oficial fica com o OpenAPI v0.2.
- Alinhar com o responsável pela #225 como uma correção afeta classificação,
  desempates e eventual apuração já realizada (RNF05). Gravar auditoria com
  `afetaResultado` não implementa sozinho o recálculo/invalidação. Esse ponto
  precisa ser resolvido antes de declarar o fluxo de correção completo.

Não há aceite do frontend registrado para esta proposta. Não iniciar DTOs/controllers
do novo contrato antes desse alinhamento, conforme a
[governança](../README.md#31-regra-de-governança).

## Casos de aceite para a implementação futura

Estes são critérios de teste; não são resultados de endpoints executados.
Use dois grupos no mesmo evento e tabela `1º = 100`, `2º = 80`, salvo indicação.

| Caso | Resultado esperado |
| --- | --- |
| GET antes do primeiro lançamento | 200; duas linhas pendentes; nenhuma gravação. |
| GET em desafio válido sem grupos | 200 com `[]`. |
| PUT com 1º e 2º lugares | 200; IDs preenchidos e pontos 100/80. |
| Um presente em 1º e um ausente com null | 200; pontos 100/0. |
| Todos ausentes, colocações null | 200; pontos zero para todos. |
| Presente com null ou ausente com posição | 422; nada gravado. |
| Dois presentes na mesma posição | 422; nada gravado. |
| Um presente em 2º e outro ausente | 422; sequência deve ser `1..P`. |
| Colocação utilizada sem ponto configurado | 422; nada gravado. |
| Grupo omitido ou repetido | 422; nada gravado. |
| Evento/desafio/grupo inexistente ou vínculo de outro evento | 404; nada gravado. |
| Sem token, token inválido ou expirado | 401. |
| Corpo não array ou array vazio | 400. |
| Campo ausente/extra, string numérica, boolean string, fração, ID zero ou acima de INT | 400. |
| Reenvio igual, inclusive com array invertido | 200; mesmos IDs e nenhuma nova auditoria. |
| Trocar o 1º e o 2º lugar | 200; IDs preservados e auditoria só do estado original/final. |
| Alternar presença e ausência e reenviar | IDs preservados; histórico só na alteração efetiva. |
| Falha na gravação de uma linha ou de auditoria | Rollback de resultados e histórico. |
| Duas gravações simultâneas do mesmo desafio | Conjunto final íntegro; sem mistura de requisições. |
| Correção após classificação/apuração | Cobrir o acordo de recálculo/invalidação com a #225. |

## Ajuste após a revisão do PR #35

Saylon aprovou a proposta e
[observou que o schema compartilhado permitia id null também no PUT](https://github.com/hanrrysantos/event-score/pull/35#pullrequestreview-5929396106).
A resposta 200 do PUT agora referencia schemas próprios com `id` não
anulável, para que os tipos gerados expressem a garantia de persistência.
O GET mantém a representação de resultados pendentes. A validação reproduziu
a aceitação indevida de `id: null` no PUT antes do ajuste e confirmou sua
recusa após a separação dos schemas.

## Validação desta proposta

- OpenAPI 3.0.3 e suas referências aprovados com `swagger-cli@4.0.4`:

  ```bash
  npx --yes @apidevtools/swagger-cli@4.0.4 validate docs/openapi/propostas/resultados-t223.yaml
  ```

- 47 verificações com Ajv dos schemas e exemplos: entradas válidas, limites
  do tipo INT, campos ausentes/extras, tipos inválidos, null, arrays vazios,
  exemplos de resposta e erro, e compatibilidade com os dois retornos de
  resultados presentes no mock atual.
- A resposta do PUT recusa `id` null, ausente ou zero e aceita ausência
  persistida com `id` preenchido e `colocacao` null. A resposta do GET
  continua aceitando as linhas pendentes do exemplo.
- As combinações de ausência e posição que exigem 422 foram conferidas como
  responsabilidade do domínio, distinta da validação estrutural do schema.
- Nenhum endpoint, transação, auditoria ou recálculo foi executado nesta
  etapa. Os testes da tabela anterior ficam para a implementação aprovada.

## Dependências, frontend e Taiga

| Item | Situação nesta base |
| --- | --- |
| Auth, eventos, grupos e schema de resultados | Integrados na `main`. |
| Gravação da auditoria e usuário autenticado | Integrados pelo PR #34. |
| Consulta do histórico (`GET /auditoria`) | Entregue pela #255 (parte 2). |
| Contrato desta proposta | Pendente de revisão/aceite e incorporação oficial. |
| Cadastro/consulta de desafios (#245–#248) | Proposta #245 mesclada; módulo e endpoints ainda pendentes. |
| Resultados (#223) | Apenas este contrato proposto; sem implementação. |
| Consulta do histórico e integração de recálculo | Alinhamento e respectivas entregas pendentes. |

Após o aceite, o serviço de resultados pode ser testado com desafios e
pontos preparados como fixtures, sem esperar o controller de cadastro de
desafios. A aba real precisa da consulta de desafios, grupos e GET/PUT de
resultados. A tela de cadastro de desafios também depende das rotas de dias.
Configuração de bônus/penalidades não é pré-requisito direto da aba Colocação.

Atualização sugerida para a #223: "Em andamento: proposta de contrato de
colocações preparada. Auditoria liberada pelo PR #34; aguardando aceite do
contrato e definição da integração de histórico/recálculo. API de resultados
ainda não implementada." A US #206 permanece em andamento, incluindo as
partes dos demais responsáveis. Nenhuma alteração automática no Taiga.
