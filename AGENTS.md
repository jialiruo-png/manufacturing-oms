# AGENTS.md

This file provides guidance when working with this repository.

## Project Overview

Manufacturing OMS (Order Management System) — a reference implementation for small/mid-sized manufacturing enterprises (originally delivered to a customer, now released as a portfolio / template project). Production stack:

- frontend: React 18 + Vite static build
- backend: Express + TypeScript running with PM2
- database: Aliyun RDS PostgreSQL through Prisma
- server: Aliyun ECS with Nginx proxying `/api/*`

## Commands

### Local development

```bash
./start.sh
```

Backend runs on `127.0.0.1:3001`; frontend dev server runs on `localhost:5173`.

### Backend

```bash
cd backend
npm run dev
npm run build
npm run db:deploy
npm run db:studio
```

### Frontend

```bash
cd frontend
npm run dev
npm run build
```

### Schema Changes

Use Prisma migrations for schema changes:

```bash
cd backend
npm run db:migrate
npm run db:deploy
```

Do not use `db push` against production.

## Change Log

After completing code, deployment, or documentation changes, append a Chinese update entry to `update1.md`. Use the same three-field format as `update.md`: `目的`、`操作`、`预期效果`. `update.md` is kept as the historical archive and should no longer receive routine new entries.

## Deployment

See `DEPLOYMENT.md`. The current production runtime is Aliyun ECS.

## Architecture

### Backend (`backend/`)

Express + TypeScript. `src/index.ts` starts the HTTP server for PM2/Node. `src/app.ts` creates the Express app, configures CORS and mounts API routes.

Routes:

| File | Prefix | Key behaviour |
|------|--------|---------------|
| `orders.ts` | `/api/orders` | List, create, update, workflow actions |
| `materials.ts` | `/api/materials` | Update material status, urgency, expected date and notes |
| `inventory.ts` | `/api/inventory` | Inventory CRUD and stock adjustment |
| `customers.ts` | `/api/customers` | Customer CRUD and communication logs |
| `products.ts` | `/api/products` | Product list and creation |
| `dashboard.ts` | `/api/dashboard` | KPIs, recent orders, risk orders and monthly stats |
| `excel.ts` | `/api/excel` | Upload preview and import |
| `users.ts` | `/api/users` | Registration, login, approval and account management |

### Frontend (`frontend/`)

React 18 + Vite + Ant Design. The app is a tab-based SPA managed in `App.tsx`.

Key files:

- `src/App.tsx`: login state, role access, tab switching
- `src/api.ts`: axios API wrappers
- `src/types.ts`: shared frontend types
- `src/pages/`: role-specific views
- `src/components/ui.tsx`: shared UI components

### Database

Database is PostgreSQL through Prisma. Production uses Aliyun RDS PostgreSQL. Required variables:

```bash
DATABASE_URL
DATABASE_URL_UNPOOLED
```

Committed Prisma migrations are the source of truth for schema updates.

## Environment

Do not commit real `.env` files. Use `.env.example` as the template.

Important variables:

- `DATABASE_URL`
- `DATABASE_URL_UNPOOLED`
- `FRONTEND_ORIGIN`
- `HOST`
- `PORT`
- `ANTHROPIC_API_KEY` optional
