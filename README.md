# Financy

Aplicação FullStack para gestão de finanças pessoais. O repositório possui as duas pastas solicitadas: `backend` e `frontend`.

## Como executar

1. Copie `backend/.env.example` para `backend/.env` e `frontend/.env.example` para `frontend/.env`.
2. Execute `npm install` na raiz e `npm run setup`. O comando aplica as migrações versionadas sem pedir para recriar o banco.
3. Execute `npm run dev`.

O cliente abre em `http://localhost:5173` e o endpoint GraphQL é `http://localhost:3333/graphql`.

## Stack

- Backend: TypeScript, Fastify, Mercurius GraphQL, Prisma, SQLite, JWT e CORS.
- Frontend: React, TypeScript, Vite e operações GraphQL via `fetch`.
