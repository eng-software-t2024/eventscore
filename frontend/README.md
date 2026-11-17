# EventScore Frontend

Frontend React/Vite/TypeScript do EventScore, com autenticação Supabase e operação dos dias de um evento.

## Estado do MVP

Implementado:

- login, logout e sessão persistente via Supabase Auth;
- rotas autenticadas;
- acesso direto a um evento por ID;
- listagem, criação, edição e remoção de dias;
- loading, erro, vazio e confirmação de remoção;
- consumo das quatro rotas reais de dias da API.

A API atual ainda não expõe listagem, criação ou detalhe de eventos. Por isso, a tela de eventos informa a lacuna e permite abrir um evento já conhecido pelo ID. Nenhum endpoint ausente foi inventado no frontend.

## Setup local

Requer Node 24.

```bash
cp .env.example .env.local
npm ci
npm run dev
```

Variáveis públicas:

- `VITE_SUPABASE_URL`: URL pública da stack Supabase EventScore;
- `VITE_SUPABASE_PUBLISHABLE_KEY`: chave publicável do Supabase;
- `VITE_API_BASE_URL`: normalmente `/api/v1`;
- `VITE_DEV_API_TARGET`: upstream local do backend, padrão `http://127.0.0.1:13000`;
- `VITE_DEV_SUPABASE_TARGET`: upstream do Auth usado pelo proxy de desenvolvimento.

Não colocar `service_role`, segredo JWT, senha de banco ou outro segredo em qualquer variável `VITE_*`.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Container

O build é multi-stage e serve os arquivos estáticos por Nginx com fallback para `index.html`:

```bash
docker compose up -d --build
curl http://127.0.0.1:13100/
```

O Compose não publica o frontend na Internet. A futura publicação deve rotear `/` para este serviço e `/api/v1/` para o backend `127.0.0.1:13000`, sem fazer o Nginx interceptar a API.
