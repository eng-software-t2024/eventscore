# Gestão MASTER e telemetria

Esta entrega adiciona a gestão de usuários ao EventScore sem alterar os
perfis ADMIN existentes. A conta MASTER é criada separadamente pelo comando
interativo `npm run db:master`; o script pede a senha duas vezes sem eco,
valida o mínimo de 12 caracteres e recusa alterar uma conta existente. Em
produção, o procedimento exige também `MASTER_BOOTSTRAP_APPROVED=true` no
ambiente do comando. As variáveis `MASTER_NOME` e `MASTER_EMAIL` identificam
a conta; nenhuma senha vai em argumento, arquivo ou log.

## Acesso e sessões

O JWT mantém expiração absoluta de uma hora e não tem renovação nesta entrega.
Cada login cria uma sessão persistida com `jti`, usuário, emissão, última
atividade, expiração, IP e user-agent. Uma sessão termina no logout, ao ser
revogada, ao atingir sua expiração absoluta ou após 15 minutos sem atividade.
O guard verifica a sessão persistida a cada chamada protegida e o frontend
envia uma atualização de atividade a cada minuto enquanto autenticado.
Falha da dependência de sessões impede autenticação protegida; não há
fallback para JWT sem sessão.

## Telemetria e retenção

O backend registra login bem-sucedido/falho, logout, expiração/revogação,
chamadas HTTP (método, rota normalizada, status, duração, resultado, usuário,
UTC, correlation ID, IP e user-agent) e ações de gestão. O cliente registra
mudança de rota, ações semânticas marcadas na interface, abertura/fechamento
de diálogos, envio de formulário sem valores, falhas JavaScript/API,
visibilidade da aba e inatividade. Corpos, credenciais, tokens e valores de
formulário não são persistidos na telemetria.

O período detalhado deve ser fechado no fim do teste pelo painel MASTER. O
fechamento define expurgo para 30 dias depois; o processo periódico remove
eventos e o período vencido. Sessões encerradas têm expurgo individual 30
dias após logout, expiração ou revogação. A auditoria administrativa é uma
tabela append-only separada e não participa desse expurgo. O mecanismo roda
no processo da API; não substitui backup nem política externa de retenção.

## Painel e API

`/gestao` exige MASTER no frontend e todas as rotas `/api/v1/management/*`
exigem MASTER no backend. ADMIN autenticado recebe 403. O painel contém
usuários, sessões, telemetria, filtros, linha do tempo, exportação CSV e
auditoria administrativa. Usuários criados pelo painel são ADMIN. Edição
preserva o perfil; redefinição de senha e desativação revogam sessões.
Exclusão só é permitida sem referências de negócio, sessões ou telemetria;
os registros de auditoria administrativa permanecem preservados.

Rotas: `GET/POST /management/users`, `PATCH/DELETE /management/users/:id`,
`POST /management/users/:id/password`, `GET /management/sessions`,
`POST /management/sessions/:id/revoke`, `GET /management/telemetry/events`,
`GET /management/telemetry/users/:id/timeline`,
`GET /management/telemetry/export.csv`, `GET /management/telemetry/period`,
`POST /management/telemetry/period/close` e `GET /management/audit`. O cliente
envia somente eventos minimizados para `POST /telemetry/client`.

## Ordem de implantação e rollback

1. Fazer backup do banco e validar a restauração fora de produção.
2. Aplicar a migration V13 pelo papel de migrations e conferir histórico,
   constraint de perfil, tabelas, índices e trigger append-only.
3. Publicar backend e frontend compatíveis na mesma janela; não criar a
   conta MASTER antes de a API com V13 estar saudável.
4. Criar MASTER pelo prompt oculto, validar acesso MASTER e confirmar 403
   para ADMIN.
5. Encerrar o período de telemetria ao concluir os testes; não remover
   auditoria de negócio nem auditoria administrativa.

Se a publicação falhar antes da migration, manter as imagens atuais. Se
falhar depois da migration, preservar o banco migrado, colocar as rotas de
gestão fora de uso e restaurar somente imagens/configuração compatíveis;
não se deve apontar código antigo para um banco novo sem validar a
compatibilidade. Restore do backup só pode ocorrer após decisão explícita e
avaliação de escritas posteriores; esta entrega não autoriza rollback de
banco em produção.

## Validação desta implementação

Os testes automatizados cobrem autorização MASTER/ADMIN, sessões, retenção,
telemetria sem conteúdo sensível, gestão e auditoria. O teste E2E usa apenas
PostgreSQL descartável com migrations oficiais. Não criar a conta MASTER
real nem contas temporárias de produção durante a validação local.
