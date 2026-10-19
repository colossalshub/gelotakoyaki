# Database

PostgreSQL is the system of record. Prisma schema lives in `prisma/schema.prisma`. SQL migrations live in `prisma/migrations`.

## Create the databases

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE gelos LOGIN PASSWORD 'choose-a-local-password' CREATEDB;
CREATE DATABASE gelos_inventory OWNER gelos;
CREATE DATABASE gelos_test OWNER gelos;
SQL
```

Set `DATABASE_URL` to `gelos_inventory`. Tests hard-code `gelos_test` and will not run if `DATABASE_URL` does not contain that name.

## Migrate

```bash
npx prisma migrate deploy
```

Use `npm run db:dev` only while changing the schema on a development machine. That command can ask to reset a database. Do not run it against a database that holds real stock.

`npm run bootstrap` inserts units, categories, two starter branches, and the default policy when those rows are missing.

## What the migration enforces

- Foreign keys between branches, items, documents, and movements.
- Unique SKUs, branch codes, menu SKUs, sale source plus external id, and idempotency keys.
- `stock_movements.quantity_delta` cannot be zero.
- Purchase conversion factors and recipe yields must be greater than zero.
- A trigger rejects `UPDATE` and `DELETE` on `stock_movements`.
- An `AFTER INSERT` trigger adds the movement quantity to `inventory_balances` in the same transaction.

Posted documents are not edited. A correction inserts a reversal movement and marks the document reversed.

## Initialize real stock

1. Rename the starter branches.
2. Enter or import the catalog. Catalog import never changes balances.
3. Count the physical stock.
4. Post one opening document per branch for that count, with a unit cost when you know it.
5. From then on, post receipts, usage, waste, transfers, and sales. Do not post the opening count again.

If an item already has a balance, opening stock asks you to confirm that the new quantity is additional.

## Reconcile

```bash
npm run reconcile
```

This compares each cached balance and cost quantity with the sum of posted movements. A mismatch is a defect. Do not "fix" it by editing movement rows. The database will reject that edit.
