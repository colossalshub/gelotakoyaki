# Product specification

Gelos Inventory answers seven questions for a two-branch takoyaki shop:

1. What should each branch have?
2. What was physically counted?
3. What movements happened between those measurements?
4. Which items, branches, and periods are short most often?
5. What did waste and unexplained variances cost, when a cost is known?
6. What should be bought or moved next?
7. Which records need a person to look at them?

It does not accuse staff. A shortage is a variance until a person reviews the receipts, transfers, waste, recipes, and counts around it.

## Roles

- **Owner** sees every branch, manages people, the catalog, recipes, and policy, and can approve counts.
- **Branch manager** runs the branches they are assigned. They approve a count or a transfer write-off only if that permission is turned on.
- **Staff** see only their branches. Receiving, counting, transfers, and sales are separate switches. They cannot approve adjustments or open financial reports.

## Workflows

- Opening stock, supplier receipts, partial receipts, damaged or rejected deliveries, and supplier returns.
- Purchase orders. Stock increases only when a receipt is posted.
- Actual usage and returns to stock.
- Waste with a reason.
- Transfers: request, dispatch, in transit, partial receipt, and a written-off remainder.
- Stock counts: draft, submitted, reviewed, finalized. One adjustment per finalized variance.
- Recipes with effective dates, manual sales, and CSV import that will not deduct the same external id twice.
- Reports and replenishment suggestions. Nothing is ordered automatically.

## States

Draft documents do not change stock. Posted documents do. Posted documents are not edited. A reversal is a new ledger row.
