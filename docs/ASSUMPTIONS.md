# Configuration assumptions

These are defaults. The owner can change them in the application without editing source code, except where noted.

## Business

- Currency is Philippine peso (PHP). Money is stored with up to 6 decimal places internally and shown to 2.
- The business timezone is `Asia/Manila`. Dates entered without a timezone are interpreted in that zone.
- Two starter branches are created: `B1` / Branch 1 and `B2` / Branch 2. They have no address and no stock. Rename them to the real shops.
- The database is not limited to two branches.
- No supplier, recipe, sale, or stock quantity is preloaded. Example names in the interface are configuration, not Gelos Takoyaki's real formula or history.

## Stock policy

- Negative stock is prevented.
- A stock count must be reviewed before it is finalized.
- The person who counted cannot review or finalize that count.
- Damaged or rejected quantities on a transfer receipt require someone with approval permission.
- An item is called a repeated shortage after 2 finalized negative variances in the selected period.
- Expiry warnings look 7 days ahead.
- A branch manager can finalize counts and close transfer discrepancies only when "Can approve adjustments" is turned on for that branch.

## Units

- Seeded units are gram, kilogram, millilitre, litre, and piece.
- Units in the same family convert by their factors. Mass is never treated as volume.
- A purchase unit in a different family requires an explicit factor on the item.

## Consumption

- Sales deduct the recipe that is effective on the sale date. That movement is theoretical consumption.
- Recorded usage is a separate movement. Posting both for the same production deducts twice. The screens say so.
- Recipe yield is an estimate of preparation loss inside the recipe. It is not recorded waste.
- There is no POS connection. Sales are typed or imported from CSV.

## What is not included

- Photo evidence for waste. Notes are the record.
- Offline use on a phone. The shop server must be reachable. There is no silent offline sync.
- Automatic supplier ordering or outbound email.
- A public default administrator password.
