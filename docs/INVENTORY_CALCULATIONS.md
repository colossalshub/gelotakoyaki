# Inventory calculations

All stock quantities and money use decimal arithmetic, rounded half up to 6 places. JavaScript binary floating point is not used for these totals.

## Book quantity

For one item at one branch:

```
book quantity = opening + receipts + transfer in + production + returns to stock
              + count adjustments + reversals
              − usage − recipe consumption − waste − supplier returns − transfer out
```

The cached balance is updated by a database trigger when a movement is inserted. `npm run reconcile` checks that the cache equals the sum of movements.

Available stock is the book quantity. Stock that has been dispatched and not yet received is not available at either branch. It is in transit on the transfer.

## Units

If the entered unit is the item's base unit, the base quantity is the entered quantity.

If both units measure the same thing (mass, volume, or count), the quantity is converted with the unit factors. Two kilograms in, two thousand grams stored, once.

If the purchase unit is a different family, the item's explicit factor is the only conversion. One litre is not assumed to weigh one kilogram.

## Receiving

Accepted quantity = delivered − damaged − rejected.

Only the accepted quantity increases stock. Damaged and rejected quantities stay on the receipt as a record.

Unit cost is the cost per entered unit. The ledger stores the equivalent cost per base unit so the weighted average stays in one unit.

## Weighted average

When stock arrives with a unit cost:

```
new value = old value + accepted base quantity × cost per base unit
average = new value / new quantity
```

Outbound movements remove value at the current average when every inbound quantity so far had a cost.

If any inbound quantity has no cost, valuation for that item is incomplete. The screen says "Cost unknown". It does not invent a number for the missing portion. The dashboard total excludes incomplete items and says how many were excluded.

A reversal applies the opposite of the original value change.

## Counts

```
variance = counted quantity − book quantity at the snapshot
```

A negative variance means less was counted than the books showed.

The snapshot is taken when the count line is created, and can be refreshed only while the count is a draft. Finalizing is refused if stock moved after the snapshot, so the variance is not mixed with later receipts or waste.

Finalizing posts one adjustment equal to the variance. Doing it again does not post another. The original expected quantity, count, and variance stay on the line.

Variance cost = variance × average cost, and only when valuation is complete.

## Transfers

Dispatch decreases the source. Receipt increases the destination by the quantity actually received. Repeating the same receipt key does not add the quantity again.

```
in transit = dispatched − received − damaged − rejected − written off
```

Writing off the remainder records a reason and an approver. It does not add the missing quantity to the destination.

## Recipes and sales

```
theoretical consumption = servings sold × quantity per serving ÷ yield
```

Yield is the usable fraction. 1 means no extra preparation loss. This is an estimate from the recipe revision whose effective dates cover the sale. It is labeled theoretical consumption.

Recorded usage is a different movement. Waste is a third movement. Using more than one of them for the same physical loss counts it more than once.

Importing a sale with the same source and external id does not deduct again. Rows that name an unknown product, branch, or quantity are flagged and are not posted.

## Replenishment

```
suggested = max(0, target − available − eligible incoming)
```

Eligible incoming is quantity already dispatched to this branch and not yet received or written off. A transfer that has only been requested does not count. A purchase order that has not been received does not count.

The suggestion is a list. It does not place an order.
