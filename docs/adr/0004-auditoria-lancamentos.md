# ADR 0004 — Auditoria compartilhada dos lançamentos

## Status

Aceito em 16/11/2026.

## Contexto

O RF18 exige que toda correção de lançamento fique registrada em histórico,
com data e responsável. As três partes da #206 (colocações, bônus e
penalidades, classificação e desempate) gravam lançamentos, e o contrato com o
front-end prevê o botão "Histórico" (`GET /auditoria?entidade=&registroId=`).

As migrações V7 e V8 já criam as tabelas `auditoria` e `auditoria_detalhe`. A
V8 torna as duas imutáveis (UPDATE, DELETE e TRUNCATE são recusados), e as
chaves para `evento` e `usuario` usam `ON DELETE RESTRICT`.

## Opções consideradas

1. Cada módulo grava a própria auditoria.
2. Triggers no banco gravam a auditoria a cada alteração.
3. Um serviço único no backend, chamado pelos módulos dentro da transação da
   alteração.

## Decisão

Adotamos a terceira opção, com o `AuditoriaService` (`src/modules/auditoria`):

- o serviço recebe a transação de quem chama, para que alteração e histórico
  sejam confirmados ou desfeitos juntos;
- quem chama informa o estado anterior e o novo; o serviço grava só os campos
  que mudaram;
- todo lançamento é auditado desde o primeiro registro (INSERT), não só as
  correções feitas após a apuração; `afeta_resultado` marca o que altera a
  classificação;
- o reenvio dos mesmos valores (PUT idempotente, RNF04) não gera anotação;
- as entidades auditadas formam uma lista fechada: `RESULTADO_DESAFIO`,
  `BONIFICACAO_GRUPO`, `PENALIDADE`, `DESEMPATE_MANUAL` e `APURACAO`;
- o histórico é exibido no formato já usado pelo front: `campo=valor`,
  separados por `; `.

A opção 2 foi descartada porque os triggers não conhecem o usuário autenticado
nem agrupam as alterações de uma mesma requisição.

## Consequências

- Os módulos da #206 injetam o `AuditoriaService` e obtêm o usuário com o
  decorator `@CurrentUserId()`.
- Um evento ou usuário com histórico não pode mais ser excluído. A API não tem
  rota de exclusão de evento; se ela for criada, deve responder 409 com
  mensagem clara.
- Testes e2e que geram auditoria não podem apagar o evento nem o usuário ao
  final. Eles devem criar dados próprios e mantê-los no banco de testes.
