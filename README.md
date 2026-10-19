# Gelos Inventory

Inventory control for Gelos Takoyaki. Two branches can share one catalog and keep separate, auditable stock ledgers. The system is meant to show what should be on hand, what was counted, and every movement in between.

It does not ship with real recipes, supplier records, or stock quantities. Starter branches are named Branch 1 and Branch 2 so they can be renamed.

## Stack

- Next.js and TypeScript
- PostgreSQL
- Prisma migrations
- Server-side sessions and role checks

Details and tradeoffs are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Requirements

- Node.js 22
- PostgreSQL 16

## Local setup

```bash
sudo -u postgres psql -c "CREATE ROLE gelos LOGIN PASSWORD 'gelos_local_dev' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE gelos_inventory OWNER gelos;"
sudo -u postgres psql -c "CREATE DATABASE gelos_test OWNER gelos;"
cp .env.example .env
openssl rand -base64 48
```

Put the random string in `SESSION_SECRET`. The database password in `.env.example` is for a local development database only. Use a different password if the machine is shared, and never reuse it in production.

```bash
npm install
npx prisma migrate deploy
npm run bootstrap
OWNER_NAME="Your Name" OWNER_EMAIL="you@example.com" OWNER_PASSWORD="a-long-secret" npm run create-owner
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) and sign in. There is no default owner password in the repository.

`npm run bootstrap` is safe to run again. It only adds missing units, categories, starter branches, and the default policy. It does not create stock.

## Production

```bash
npm run build
npm start
```

Before production:

- Set a long `SESSION_SECRET` from a secret store.
- Use a PostgreSQL role that is not the local development password.
- Serve the app over HTTPS so the session cookie is marked secure.
- Run `npx prisma migrate deploy`, then `npm run bootstrap`, then `npm run create-owner` with a password that is not written into git.
- Do not point the app at a database that already holds live stock and then import that stock again.

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run reconcile
```

Tests use the `gelos_test` database and refuse to run against any other database name.

## Guides

- [Product specification](docs/PRODUCT_SPEC.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Database and migrations](docs/DATABASE.md)
- [How quantities are calculated](docs/INVENTORY_CALCULATIONS.md)
- [Owner and staff guide](docs/USAGE.md)
- [Assumptions](docs/ASSUMPTIONS.md)
- [Acceptance report](docs/ACCEPTANCE.md)
