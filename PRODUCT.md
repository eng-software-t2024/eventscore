# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: React, Vite, TypeScript, TanStack Query, React Router, Tailwind CSS e Supabase Auth, conforme o brief do frontend.

## Users

Integrantes e responsáveis por eventos que precisam autenticar, consultar eventos e administrar seus dias de programação.

## Product Purpose

O frontend permite operar o EventScore por uma interface web: entrar com Supabase Auth e consultar ou administrar os dias de um evento usando a API NestJS existente.

## Operating Context

Uso autenticado em desktop ou celular, com dados vindos da API EventScore. A sessão deve sobreviver a recarregamentos e expirar de forma segura.

## Capabilities and Constraints

- MVP: login, logout, sessão persistente, rotas protegidas e CRUD de dias.
- A API disponível nesta base expõe as rotas de dias, mas não expõe listagem, criação ou detalhe de eventos.
- O frontend não deve inventar endpoints ausentes nem alterar o backend nesta etapa.
- Chaves públicas do Supabase podem ser usadas no bundle; segredos e service keys nunca entram no frontend.
- Produção deve usar URLs configuradas por ambiente, sem chamadas hardcoded para localhost.

## Brand Commitments

O produto se chama EventScore. A interface deve ser limpa, responsiva e orientada à operação, com linguagem em português.

## Evidence on Hand

- Backend NestJS com prefixo `/api/v1`.
- Supabase Auth do projeto EventScore.
- Endpoints disponíveis para dias: GET, POST, PATCH e DELETE em `/api/v1/eventos/:eventoId/dias`.
- Não há frontend EventScore existente identificado nesta base.

## Product Principles

- Autenticação clara antes de qualquer operação.
- Estado remoto explícito: carregando, vazio, erro e sucesso.
- A interface deve refletir as capacidades reais da API.
- Ações destrutivas exigem confirmação.

## Accessibility & Inclusion

Controles devem ter rótulos visíveis, foco de teclado, mensagens de erro associadas aos campos e contraste suficiente para uso em telas pequenas.
