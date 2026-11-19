# Taiga #245 — Contrato de Desafios (Aprovado e Incorporado na v0.2.0)

Status: **aprovado e incorporado ao contrato oficial** ([openapi-v0.2.yaml](../openapi-v0.2.yaml) e [openapi-v0.1.yaml](../openapi-v0.1.yaml), versão **`v0.2.0`**). Proposta revisada no PR #31 com aceite do frontend (**Luiz Meneses**) e aprovação do backend (**Saylon**). Módulo, DTOs TypeScript, service e endpoints seguem para implementação na #245.

O recorte [desafios-t245.yaml](./desafios-t245.yaml) reúne as cinco operações
de RF05/RF06 e os schemas incorporados à especificação oficial.

## Fontes e limite da proposta

- [PR #30 do frontend](https://github.com/hanrrysantos/event-score/pull/30),
  SHA `15f74ba7aa57a54039c021d739eebb415632707e`:
  `web/mock/openapi-mock.yaml`, `web/src/pages/desafios/regras.ts` e
  `web/src/pages/desafios/Desafios.tsx`.
- `prisma/schema.prisma` e migração V4: nomes e limites das colunas,
  vínculo composto entre desafio/dia/evento e unicidade por dia e evento.
- [ADR 0003](../../adr/0003-divergencias-banco-contrato.md): bloquear com 409
  a exclusão de desafio usado em critério de desempate.
- [Governança de contrato](../README.md): aprovação explícita do frontend
  e revisão do backend antes de implementar o novo contrato.

O mock do frontend é referência de compatibilidade, não comprovação de
aprovação do OpenAPI oficial. Luiz Meneses registrou o
[aceite do frontend no PR #31](https://github.com/hanrrysantos/event-score/pull/31#issuecomment-6882622692)
em 14/11/2026 sobre o commit `357a506`, condicionado a não bloquear o reenvio
do mesmo dia e da mesma tabela após resultados. Esta revisão incorpora a
condição no documento e no OpenAPI. Ikki ainda deve alinhar a incorporação e
o versionamento do recorte, e Saylon deve concluir a revisão backend antes
da implementação dos DTOs.

## Interface proposta

| Operação | Resposta | Formato |
| --- | --- | --- |
| GET `/eventos/{eventoId}/desafios` | 200 | Array de desafios; `[]` em evento existente sem desafios. |
| POST `/eventos/{eventoId}/desafios` | 201 | Desafio criado com tabela de pontos. |
| GET `/eventos/{eventoId}/desafios/{desafioId}` | 200 | Desafio e sua tabela de pontos. |
| PATCH `/eventos/{eventoId}/desafios/{desafioId}` | 200 | Desafio atualizado parcialmente. |
| DELETE `/eventos/{eventoId}/desafios/{desafioId}` | 204 | Sem corpo. |

Prefixo `/api/v1`, Bearer JWT do administrador e envelope de erro seguem
o contrato já aprovado. Evento, dia ou desafio fora do contexto retornam 404;
não revelar um recurso de outro evento. Não expor tipos Prisma nos DTOs.

O corpo de criação continua com os campos enviados pela tela:

```json
{
  "nome": "Hackathon",
  "descricao": "Desenvolvimento em equipe",
  "diaId": 2,
  "pontosColocacao": [
    { "colocacao": 1, "pontos": 100 },
    { "colocacao": 2, "pontos": 80 }
  ]
}
```

Os exemplos com duas colocações pressupõem dois grupos no evento. Nome,
dia e tabela são obrigatórios na criação. Descrição é opcional, com retorno
padronizado como string vazia quando o banco guarda null. O dia da URL de
eventos e `diaId` precisam pertencer ao mesmo evento.

No banco, nome tem no máximo 100 caracteres e descrição 255. Na criação e
no PATCH, se nome for informado, o backend remove espaços externos com
`trim()`, exige que o valor normalizado tenha de 1 a 100 caracteres e persiste
esse valor. `"   "`, `"\t\n"` e outros nomes que ficam vazios após `trim()`
retornam 400 mesmo que a tela já valide o campo. No OpenAPI, `minLength: 1`
é combinado com `pattern: '\S'` nos dois schemas de entrada: exige pelo
menos um caractere não branco. No PATCH, nome ausente preserva o existente
e null continua inválido. Números fracionários e campos desconhecidos são
recusados. Pontos são inteiros não negativos; não há peso nem critério de
avaliação no payload.

## Decisões para aprovação

1. **PATCH parcial.** A tela envia o formulário completo, mas o mock reutiliza
   um schema sem obrigatoriedade explícita. A proposta separa criação e PATCH:
   campo ausente preserva valor, descrição vazia limpa o texto e null é recusado.
   Se a tabela mudar, ela é substituída inteira em uma transação; reenviar
   o mesmo conteúdo não exige substituir os registros.
2. **Tabela de pontos.** Exigir um grupo ou mais e uma linha por grupo,
   colocações únicas e contíguas de 1 a N, sem impor ordem aos valores dos
   pontos. Array vazio e tipos inválidos dão 400; quantidade incompatível com
   grupos e colocações repetidas/com lacunas dão 422. Se o total de grupos
   mudar antes dos lançamentos, a próxima edição revalida a tabela resultante.
3. **Alteração após resultados.** Recusar com 409 somente mudança efetiva
   de dia ou do conteúdo da tabela quando já houver resultado; permitir nome
   e descrição. Comparar `diaId` com o ID persistido e a tabela pelos pares
   `(colocacao, pontos)`, ignorando a ordem do array. A simples presença de
   `diaId` ou `pontosColocacao` no corpo não caracteriza alteração. Reenviar os
   valores já gravados é permitido, inclusive junto de nome/descrição novos.
   Se for necessário alterar pontuação depois de lançar resultados, precisamos
   definir o histórico e o recálculo com a auditoria compartilhada. A condição
   de reenvio vem do aceite do frontend; a implementação ainda está pendente.
4. **Exclusão com vínculos.** Critério de desempate já exige 409 pelo ADR.
   A proposta também recusa exclusão com resultado, preservando o histórico.
   Desafio sem vínculos impeditivos remove apenas seus pontos e o próprio
   cadastro, na mesma transação. Não apagar resultado em cascata.
5. **Normalização e ordenação.** Confirmar descrição sempre textual, limites
   reais do banco, ordenação dos desafios por número do dia/ID e dos pontos
   por colocação. Nome repetido no mesmo dia/evento retorna 409 conforme V4.

Exemplos para a implementação, considerando um desafio com `diaId: 2`,
resultado lançado e tabela `[{ colocacao: 1, pontos: 100 }, { colocacao: 2, pontos: 80 }]`:

| PATCH recebido | Resultado esperado |
| --- | --- |
| `{ "nome": "Hackathon final", "diaId": 2 }` | 200; nome atualizado, dia preservado. |
| `{ "descricao": "Nova descrição", "pontosColocacao": [{ "colocacao": 2, "pontos": 80 }, { "colocacao": 1, "pontos": 100 }] }` | 200; descrição atualizada, mesmo conteúdo da tabela. |
| `{ "diaId": 3 }` (outro dia válido do mesmo evento) | 409; mudança efetiva de dia. |
| `{ "pontosColocacao": [{ "colocacao": 1, "pontos": 101 }, { "colocacao": 2, "pontos": 80 }] }` | 409; mudança efetiva de pontos. |
| `{ "nome": "   " }` | 400; nome vazio após normalização. |

## Validação desta revisão

- OpenAPI e referências ao contrato existente aprovados em
  `swagger-cli@4 validate`.
- 18 verificações com Ajv nos dois schemas de entrada: nomes vazios,
  espaços, tabulações, quebras de linha, espaços Unicode, null, limites
  de comprimento e nomes válidos com espaços externos.
- Quatro exemplos de resposta do mock continuam válidos em `DesafioDto`.
- PATCH documentado com reenvio de valores iguais e comparação da tabela
  por conteúdo, e não pela presença dos campos. Os exemplos de comportamento
  acima ficam como casos de aceite para a futura implementação #246/#248;
  não representam testes executados de endpoints ainda inexistentes.

## O que cada task entrega

| Task | Próxima implementação após o aceite | Dependências |
| --- | --- | --- |
| #245 | Módulo exportável e DTOs alinhados ao contrato aprovado; testes de validação e Swagger. | Este recorte aprovado e incorporado ao contrato oficial. |
| #246 | Regras e persistência transacional; isolamento por evento; dependências de exclusão. | #245 mesclada e decisões acima aprovadas. |
| #247 | Endpoints protegidos pelo guard global existente. | #246 mesclada, autenticação e contrato aprovado. |
| #248 | HTTP, PostgreSQL, autenticação, tabelas e vínculos reais. | #247 mesclada e banco exclusivo de testes. |

Resultados de desafios e auditoria de lançamentos pertencem à #223, não
ao cadastro desta proposta. Não há mudança de schema ou migração prevista.

## Critério de liberação da tela

A tela de desafios do PR #30 carrega desafios, dias e grupos em conjunto
(`Promise.all`). Sua integração real depende também das rotas de dias e
grupos, hoje em PRs #13 e #29. A implementação das regras de desafios pode
usar os dados oficiais já persistidos e fixtures de teste sem esperar o
merge desses controllers; a tela completa precisa das três APIs.

## Taiga e revisão

- US #202: em andamento pela definição do contrato.
- #245: em andamento, aguardando revisão do contrato; não concluída.
- #246 a #248: novas, aguardando suas dependências.
- #223: ainda depende de desafios, grupos, configuração e auditoria.

Aprovações esperadas: frontend explícito (Luiz Meneses), backend conforme o
fluxo da equipe (revisor de Gustavo: Saylon) e alinhamento com Ikki para
publicação. O merge segue CI verde, uma aprovação válida e merge commit;
o aceite do frontend sobre o contrato também precisa ficar registrado.
