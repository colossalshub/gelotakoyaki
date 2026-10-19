# Architecture

One Next.js application serves the pages and the inventory rules. PostgreSQL holds the data. There is no separate service, queue, or cache cluster.

## Why this shape

Gelos Takoyaki has two branches and a small staff. A single Node process and one Postgres database is enough, cheap to run, and simple to back up. The phone UI talks to that server. Basic operations do not require a public cloud, but they do require the server to be reachable. Offline entry with later sync is not implemented, because a silent overwrite of stock movements would hide the discrepancies the owner is trying to find.

Prisma 6 is used instead of a newer release candidate so migrations and the query API stay on a stable line.

## Request path

1. The browser sends a session cookie.
2. A server action or route loads the user and branch grants from the database.
3. Permission checks run in the server function. Hiding a button is not the control.
4. The change is validated with decimal quantities, then written in one database transaction.
5. Inserting a movement updates the balance through a trigger. If the transaction rolls back, the balance rolls back with it.

Concurrent movements lock the balance row with `SELECT … FOR UPDATE` before they check the negative-stock rule. Document numbers are allocated with a single `INSERT … ON CONFLICT` so two receipts cannot take the same number.

## Immutability

`stock_movements` cannot be updated or deleted. Receipts, waste, usage, and openings are posted once. A correction is a new reversal row. Stock counts store the snapshot they used and point at the one adjustment they posted.

## Security

- Passwords are hashed with bcrypt. Production uses 12 rounds.
- Sessions are random tokens. Only the SHA-256 hash is stored.
- Login attempts are limited to 8 per email and address in 15 minutes.
- Server actions rely on Next.js origin checks. CSV downloads reject `Sec-Fetch-Site: cross-site`.
- CSV cells that start with `=`, `+`, `-`, `@`, or a tab are prefixed so a spreadsheet does not treat them as formulas.
- Errors shown to staff do not include stack traces. Unexpected failures are logged on the server.
- Exports select report columns only. Password hashes and session tokens are not in those queries.

## What each folder does

- `src/domain` — pure calculations and permission rules, covered by unit tests.
- `src/server` — transactions, authorization, and reports.
- `src/actions` — form handlers.
- `src/app` — pages.
- `tests/integration` — the stock scenarios against PostgreSQL.
