<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

- Node.js 22 is already on the base image. PostgreSQL 16 is installed by the environment `install` script (`postgresql` and `postgresql-contrib`).
- systemd is not running in this VM. Start the cluster with `sudo pg_ctlcluster 16 main start` and wait until `pg_isready -q` succeeds. The environment `start` script does this on boot.
- Local role `gelos` / password `gelos_local_dev` owns `gelos_inventory`, `gelos_test`, and `gelos_shadow`. These match `.env.example` and are local development credentials only.
- `start` creates `.env` from those URLs when it is missing, and writes a generated `SESSION_SECRET`. Do not commit `.env`.
- `start` runs `npx prisma migrate deploy` and `npm run bootstrap`, then creates a local owner only when `users` is empty: `owner@gelos.local` / `gelos_local_dev`. Sign in at http://127.0.0.1:3000. This account is for the Cloud Agent machine, not production.
- The dev server is `npm run dev -- --hostname 0.0.0.0 --port 3000`. `start` leaves it in the foreground when port 3000 is free. Open http://localhost:3000. Next.js 16 blocks dev resources, including hot reload, when the page is opened as 127.0.0.1, and that reload loop clears in-progress forms.
- Checks from the repo root, with Postgres up: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run reconcile`. Tests refuse any database whose name is not `gelos_test`.

