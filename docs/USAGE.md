# Owner and staff guide

## First week

1. Sign in with the owner account created on the server.
2. Open Settings → Branches and rename Branch 1 and Branch 2.
3. Add suppliers if you want them on receipts. This is optional.
4. Add each real ingredient and supply under Settings → Items, or import a CSV. Importing items does not add stock.
5. Set the base unit to the unit you count in. If you buy in kilograms and count in grams, set both units. Do not invent a weight for a liquid.
6. Count what is actually in each branch.
7. Open Opening stock and post that count once, with a cost if you know it. Leave the cost blank if you do not. The screen will say the value is incomplete instead of guessing.
8. Add recipes only for products you will enter sales for. Put the quantities you really use. A demonstration recipe is not the shop's recipe until you replace it.
9. Add managers and staff under Settings → People. Give each person a long temporary password and tell them to change it under Account. Turn on receiving or counting only for people who do that work.

After opening stock, record what happens:

- A delivery is Receive stock. Stock increases when you post it.
- Food you cooked without a sales entry is Record usage.
- Anything thrown away is Waste.
- Stock sent to the other branch is a transfer. The other branch must confirm what arrived.
- A physical count is Stock counts. Someone other than the counter reviews it, then finalizes it.

## Sales

Enter servings under Sales, or import a CSV with `external_id`, `sold_at`, `branch_code`, `menu_sku`, and `quantity`. Times without a zone are Manila time.

That posts theoretical consumption from the recipe. It does not also record waste. If you both post the sale and record the same ingredients as usage, the stock is reduced twice.

Importing a file again does not reduce stock again for an external id that was already posted. Unknown products are listed and skipped.

## When the count does not match

Open the count and choose Evidence. You will see the book quantity at the snapshot, the count, receipts, transfers, waste, recipe consumption, recorded usage, and who entered those records. Pick a reason such as unrecorded usage, spoilage, or unknown. Unknown means it is unknown.

## What to buy

Replenishment shows `target − available − stock already on the way`. A transfer that has not left the other branch is not treated as incoming. The page does not send an order.

## Reports

Reports can be filtered by branch and date, then downloaded as CSV. Open them in a spreadsheet. Values that could look like formulas are stored as text.
