# Acceptance report

Verified on 19 October 2026 in this workspace. The app was not deployed to a public host.

## What was implemented

A single Next.js application with PostgreSQL, role-based access, and an append-only stock ledger. Both starter branches are configurable. Receiving, usage, waste, transfers, counts, recipes, sales import, replenishment, and CSV reports are in the product. Photo upload, offline sync, and a POS connection are not.

## Tests

`npm test` — 28 passed, 0 failed.

- 16 unit tests: unit conversion, decimal totals, variance, weighted average, replenishment, permissions, CSV formula protection, Manila dates, passwords.
- 12 integration tests on `gelos_test`:
  - 100 + 50 − 30 − 5 = 115, then a count of 110 posts a variance of −5 and the ledger still matches.
  - 2 kg is stored as 2,000 g once.
  - Dispatching 20 leaves 80 at the source and 0 available at the destination. Receiving 18 once leaves 2 in transit. Repeating the receipt does not add another 18.
  - 20 servings × 15 g posts −300 g once, separate from a later actual-usage movement.
  - A count of 43 against 50 posts one −7 adjustment. Finalizing again does not post another.
  - A Branch A staff call against Branch B is rejected and writes no movement.
  - Two simultaneous uses of 80 from 100: one succeeds, one is rejected for insufficient stock, balance is 20.
  - The same receipt key posts one movement.
  - A thrown transaction leaves the balance unchanged. Updating a movement is rejected by the database.
  - Replenishment ignores a transfer that has only been requested, and subtracts dispatched-but-unreceived quantity.
  - Importing the same sales file twice deducts the recipe once. An unknown branch is flagged.
  - A receipt at one branch does not change the other branch.

`npm run typecheck` passed. `npm run lint` passed. `npm run build` passed (Next.js 16.4.2).

## Browser

Headless Chrome signed in, confirmed the catalog saved an item, posted an opening balance of 100 pieces, and showed that balance on the inventory page. A narrow viewport showed the bottom navigation.

A desktop browser then opened the same inventory row, the item ledger (+100 pc, value ₱200.00 from a ₱2.00 cost), the dashboard disclosures for missing sales and counts, and dark mode. The dark dashboard remained readable: light text on charcoal cards.

The local development database used for that check contains one labeled test item, Test skewer. It is not a Gelos recipe or a real count. Recreate the database, or reverse the opening document, before entering real stock.

## Acceptance criteria

Passed:

- Two branches in one system, with server-side branch checks.
- Posted movements are traceable and balances match the ledger.
- Receiving, usage, waste, and adjustments.
- Transfers with dispatch, in transit, partial receipt, and a place to explain the remainder.
- Counts identify shortages and do not double-post.
- Recipe consumption is configurable and is not the same record as actual usage.
- Duplicate sales imports do not deduct twice.
- Reorder math uses dispatched incoming stock only.
- Missing cost and missing sales are labeled, not invented.
- Corrections are reversals. Movement rows cannot be edited.
- Owner and staff pages for the daily tasks, including a phone navigation bar.
- Reports filter and export.
- Migrations, tests, lint, types, and the production build.

Not done, and not marked passed:

- Offline entry on a phone.
- Photo evidence.
- A live POS integration. CSV and manual sales are the path.
- A public deployment. Nothing was deployed from this workspace.

## Before real use

1. Create the owner with `npm run create-owner` and a password that is not committed.
2. Rename the branches.
3. Replace the test item if this development database is the one you keep, or start from an empty migrated database.
4. Post opening stock from a physical count once.
5. Put the app behind HTTPS and set `SESSION_SECRET`.
