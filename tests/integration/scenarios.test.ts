import { beforeEach, describe, expect, it } from "vitest";
import { D } from "@/domain/decimal";
import { inTransitQuantity } from "@/domain/transfers";
import { prisma } from "@/server/db";
import { getBalance, postMovement, reconcileItem } from "@/server/ledger";
import { postOpening } from "@/server/opening";
import { postReceiptNow } from "@/server/receiving";
import { postUsage } from "@/server/usage";
import { postWaste } from "@/server/waste";
import { createTransfer, dispatchTransfer, receiveTransfer, requestTransfer } from "@/server/transfers";
import { createCount, finalizeCount, recordCount, reviewCount, submitCount } from "@/server/counts";
import { activateRecipeRevision, createMenuItem, saveRecipeRevision } from "@/server/recipes";
import { postSale, postSalesBatch, stageSalesCsv } from "@/server/sales";
import { replenishmentForBranch } from "@/server/replenishment";
import { investigateItem } from "@/server/investigate";
import { saveBranchStocking } from "@/server/catalog";
import { branchByCode, createItem, makeUser, resetDatabase, unitByCode } from "./fixture";

beforeEach(async () => {
  await resetDatabase();
});

describe("critical inventory scenarios", () => {
  it("reconciles opening, receiving, usage, and waste, then a shortage count", async () => {
    const owner = await makeUser({ email: "owner@test.local", name: "Owner", role: "OWNER" });
    const reviewer = await makeUser({ email: "reviewer@test.local", name: "Reviewer", role: "OWNER" });
    const branch = await branchByCode("B1");
    const pc = await unitByCode("pc");
    const item = await createItem({ sku: "SKEWER" });

    await postOpening(owner, {
      branchId: branch.id,
      idempotencyKey: "open-1",
      lines: [{ itemId: item.id, quantity: "100", unitId: pc.id }],
    });
    await postReceiptNow(owner, {
      branchId: branch.id,
      idempotencyKey: "rcv-1",
      lines: [{ itemId: item.id, quantity: "50", unitId: pc.id, unitCost: "2" }],
    });
    await postUsage(owner, {
      branchId: branch.id,
      kind: "ACTUAL",
      idempotencyKey: "use-1",
      lines: [{ itemId: item.id, quantity: "30", unitId: pc.id }],
    });
    await postWaste(owner, {
      branchId: branch.id,
      idempotencyKey: "waste-1",
      lines: [{ itemId: item.id, quantity: "5", unitId: pc.id, reason: "DROPPED" }],
    });

    expect((await getBalance(branch.id, item.id)).eq(115)).toBe(true);
    expect((await reconcileItem(branch.id, item.id)).ok).toBe(true);

    const count = await createCount(owner, { branchId: branch.id, itemIds: [item.id] });
    await recordCount(owner, count.id, [{ itemId: item.id, countedQty: "110", reasonCode: "UNKNOWN" }]);
    await submitCount(owner, count.id);
    await reviewCount(reviewer, count.id);
    await finalizeCount(reviewer, count.id, "fin-1");
    const line = await prisma.stockCountLine.findFirstOrThrow({ where: { countId: count.id } });
    expect(D(line.expectedQty).eq(115)).toBe(true);
    expect(D(line.countedQty!).eq(110)).toBe(true);
    expect(D(line.varianceQty!).eq(-5)).toBe(true);
    expect((await getBalance(branch.id, item.id)).eq(110)).toBe(true);
    expect((await reconcileItem(branch.id, item.id)).ok).toBe(true);
  });

  it("converts 2 kg to 2000 g a single time", async () => {
    const owner = await makeUser({ email: "owner@test.local", name: "Owner", role: "OWNER" });
    const branch = await branchByCode("B1");
    const kg = await unitByCode("kg");
    const item = await createItem({ sku: "FLOUR", base: "g", purchase: "kg", factor: "1000" });
    await postReceiptNow(owner, {
      branchId: branch.id,
      idempotencyKey: "kg-1",
      lines: [{ itemId: item.id, quantity: "2", unitId: kg.id, unitCost: "80" }],
    });
    const movement = await prisma.stockMovement.findFirstOrThrow({ where: { itemId: item.id } });
    expect(D(movement.quantityDelta).eq(2000)).toBe(true);
    expect(D(movement.enteredQuantity!).eq(2)).toBe(true);
    expect((await getBalance(branch.id, item.id)).eq(2000)).toBe(true);
    expect((await reconcileItem(branch.id, item.id)).ok).toBe(true);
  });

  it("keeps in-transit stock at neither branch and ignores a repeated receipt", async () => {
    const owner = await makeUser({ email: "owner@test.local", name: "Owner", role: "OWNER" });
    const source = await branchByCode("B1");
    const dest = await branchByCode("B2");
    const pc = await unitByCode("pc");
    const item = await createItem({ sku: "BOX" });
    await postOpening(owner, {
      branchId: source.id,
      idempotencyKey: "open-box",
      lines: [{ itemId: item.id, quantity: "100", unitId: pc.id }],
    });
    const transfer = await createTransfer(owner, {
      sourceBranchId: source.id,
      destBranchId: dest.id,
      lines: [{ itemId: item.id, quantity: "20", unitId: pc.id }],
    });
    await requestTransfer(owner, transfer.id);
    await dispatchTransfer(owner, transfer.id, "dispatch-1");
    expect((await getBalance(source.id, item.id)).eq(80)).toBe(true);
    expect((await getBalance(dest.id, item.id)).eq(0)).toBe(true);
    const dispatchedLine = await prisma.stockTransferLine.findFirstOrThrow({ where: { transferId: transfer.id } });
    expect(inTransitQuantity(dispatchedLine).eq(20)).toBe(true);

    await receiveTransfer(owner, {
      transferId: transfer.id,
      idempotencyKey: "recv-1",
      lines: [{ lineId: dispatchedLine.id, receivedQty: "18" }],
    });
    await receiveTransfer(owner, {
      transferId: transfer.id,
      idempotencyKey: "recv-1",
      lines: [{ lineId: dispatchedLine.id, receivedQty: "18" }],
    });

    expect((await getBalance(dest.id, item.id)).eq(18)).toBe(true);
    const after = await prisma.stockTransferLine.findFirstOrThrow({ where: { id: dispatchedLine.id } });
    expect(D(after.receivedQty).eq(18)).toBe(true);
    expect(inTransitQuantity(after).eq(2)).toBe(true);
    expect(await prisma.transferReceipt.count()).toBe(1);
    expect((await reconcileItem(source.id, item.id)).ok).toBe(true);
    expect((await reconcileItem(dest.id, item.id)).ok).toBe(true);
  });

  it("posts recipe consumption once and keeps it distinct from actual usage", async () => {
    const owner = await makeUser({ email: "owner@test.local", name: "Owner", role: "OWNER" });
    const branch = await branchByCode("B1");
    const gram = await unitByCode("g");
    const item = await createItem({ sku: "FILLING", base: "g" });
    await postOpening(owner, {
      branchId: branch.id,
      idempotencyKey: "open-filling",
      lines: [{ itemId: item.id, quantity: "1000", unitId: gram.id, unitCost: "0.5" }],
    });
    const menu = await createMenuItem(owner, { sku: "TAKO-DEMO", name: "Demonstration serving" });
    const revision = await saveRecipeRevision(owner, {
      menuItemId: menu.id,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      notes: "Test recipe only. Not a real Gelos recipe.",
      lines: [{ itemId: item.id, quantity: "15", unitId: gram.id, yieldFactor: "1" }],
    });
    await activateRecipeRevision(owner, revision.id);
    await postSale(owner, {
      branchId: branch.id,
      menuItemId: menu.id,
      quantity: "20",
      soldAt: new Date("2026-02-01T04:00:00.000Z"),
      source: "MANUAL",
      externalId: "sale-20",
    });
    await postSale(owner, {
      branchId: branch.id,
      menuItemId: menu.id,
      quantity: "20",
      soldAt: new Date("2026-02-01T04:00:00.000Z"),
      source: "MANUAL",
      externalId: "sale-20",
    });
    const theoretical = await prisma.stockMovement.findMany({
      where: { itemId: item.id, movementType: "SALE_CONSUMPTION" },
    });
    expect(theoretical).toHaveLength(1);
    expect(D(theoretical[0].quantityDelta).eq(-300)).toBe(true);
    await postUsage(owner, {
      branchId: branch.id,
      kind: "ACTUAL",
      idempotencyKey: "actual-1",
      lines: [{ itemId: item.id, quantity: "10", unitId: gram.id }],
    });
    expect(await prisma.stockMovement.count({ where: { movementType: "SALE_CONSUMPTION" } })).toBe(1);
    expect(await prisma.stockMovement.count({ where: { movementType: "ACTUAL_USAGE" } })).toBe(1);
    expect((await getBalance(branch.id, item.id)).eq(690)).toBe(true);
  });

  it("finalizes a stock count into exactly one adjustment", async () => {
    const counter = await makeUser({ email: "counter@test.local", name: "Counter", role: "OWNER" });
    const reviewer = await makeUser({ email: "reviewer@test.local", name: "Reviewer", role: "OWNER" });
    const branch = await branchByCode("B1");
    const pc = await unitByCode("pc");
    const item = await createItem({ sku: "CUP" });
    await postOpening(counter, {
      branchId: branch.id,
      idempotencyKey: "open-cup",
      lines: [{ itemId: item.id, quantity: "50", unitId: pc.id, unitCost: "3" }],
    });
    const count = await createCount(counter, { branchId: branch.id, itemIds: [item.id] });
    await recordCount(counter, count.id, [{ itemId: item.id, countedQty: "43", reasonCode: "UNRECORDED_USAGE" }]);
    await submitCount(counter, count.id);
    await reviewCount(reviewer, count.id);
    await finalizeCount(reviewer, count.id, "fin-cup");
    await finalizeCount(reviewer, count.id, "fin-cup-again");
    const line = await prisma.stockCountLine.findFirstOrThrow({ where: { countId: count.id } });
    expect(D(line.expectedQty).eq(50)).toBe(true);
    expect(D(line.varianceQty!).eq(-7)).toBe(true);
    expect(line.adjustmentMovementId).toBeTruthy();
    expect(await prisma.stockMovement.count({ where: { movementType: "ADJUSTMENT" } })).toBe(1);
    expect((await getBalance(branch.id, item.id)).eq(43)).toBe(true);
    const original = await prisma.stockMovement.findUniqueOrThrow({ where: { id: line.adjustmentMovementId! } });
    expect(D(original.quantityDelta).eq(-7)).toBe(true);
  });

  it("rejects cross-branch access for a staff member", async () => {
    const branchA = await branchByCode("B1");
    const branchB = await branchByCode("B2");
    const staff = await makeUser({
      email: "staff-a@test.local",
      name: "Staff A",
      role: "STAFF",
      branches: [
        {
          branchId: branchA.id,
          canReceive: false,
          canCount: false,
          canWaste: true,
          canTransferRequest: false,
          canTransferDispatch: false,
          canTransferReceive: false,
          canRecordUsage: true,
          canRecordSales: false,
          canApproveAdjustments: false,
        },
      ],
    });
    const item = await createItem({ sku: "SAUCE" });
    const pc = await unitByCode("pc");
    await expect(
      postWaste(staff, {
        branchId: branchB.id,
        idempotencyKey: "nope",
        lines: [{ itemId: item.id, quantity: "1", unitId: pc.id, reason: "OTHER" }],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(investigateItem(staff, { branchId: branchB.id, itemId: item.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await prisma.stockMovement.count()).toBe(0);
  });

  it("lets only one of two competing issues succeed", async () => {
    const owner = await makeUser({ email: "owner@test.local", name: "Owner", role: "OWNER" });
    const branch = await branchByCode("B1");
    const pc = await unitByCode("pc");
    const item = await createItem({ sku: "NAPKIN" });
    await postOpening(owner, {
      branchId: branch.id,
      idempotencyKey: "open-napkin",
      lines: [{ itemId: item.id, quantity: "100", unitId: pc.id }],
    });
    const results = await Promise.allSettled([
      postUsage(owner, {
        branchId: branch.id,
        kind: "ACTUAL",
        idempotencyKey: "race-a",
        lines: [{ itemId: item.id, quantity: "80", unitId: pc.id }],
      }),
      postUsage(owner, {
        branchId: branch.id,
        kind: "ACTUAL",
        idempotencyKey: "race-b",
        lines: [{ itemId: item.id, quantity: "80", unitId: pc.id }],
      }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") {
      expect(rejected.reason).toMatchObject({ code: "NEGATIVE_STOCK" });
    }
    expect((await getBalance(branch.id, item.id)).eq(20)).toBe(true);
    expect((await reconcileItem(branch.id, item.id)).ok).toBe(true);
  });

  it("posts one receipt when the same idempotency key is submitted twice", async () => {
    const owner = await makeUser({ email: "owner@test.local", name: "Owner", role: "OWNER" });
    const branch = await branchByCode("B1");
    const pc = await unitByCode("pc");
    const item = await createItem({ sku: "TRAY" });
    const input = {
      branchId: branch.id,
      idempotencyKey: "same-receipt",
      lines: [{ itemId: item.id, quantity: "50", unitId: pc.id }],
    };
    await postReceiptNow(owner, input);
    await postReceiptNow(owner, input);
    expect(await prisma.stockMovement.count({ where: { movementType: "SUPPLIER_RECEIPT" } })).toBe(1);
    expect((await getBalance(branch.id, item.id)).eq(50)).toBe(true);
  });

  it("rolls back a failed movement and refuses to rewrite history", async () => {
    const owner = await makeUser({ email: "owner@test.local", name: "Owner", role: "OWNER" });
    const branch = await branchByCode("B1");
    const pc = await unitByCode("pc");
    const item = await createItem({ sku: "EGG" });
    await postOpening(owner, {
      branchId: branch.id,
      idempotencyKey: "open-egg",
      lines: [{ itemId: item.id, quantity: "10", unitId: pc.id }],
    });
    const before = await prisma.stockMovement.count();
    await expect(
      prisma.$transaction(async (tx) => {
        await postMovement(
          {
            branchId: branch.id,
            itemId: item.id,
            quantityDelta: D(4),
            unitId: pc.id,
            movementType: "ADJUSTMENT",
            userId: owner.id,
            idempotencyKey: "will-rollback",
          },
          tx,
        );
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await prisma.stockMovement.count()).toBe(before);
    expect((await getBalance(branch.id, item.id)).eq(10)).toBe(true);
    const original = await prisma.stockMovement.findFirstOrThrow();
    await expect(
      prisma.stockMovement.update({ where: { id: original.id }, data: { notes: "changed" } }),
    ).rejects.toThrow(/immutable/i);
    expect(D((await prisma.stockMovement.findUniqueOrThrow({ where: { id: original.id } })).quantityDelta).eq(10)).toBe(true);
  });

  it("suggests replenishment from target, available stock, and dispatched incoming only", async () => {
    const owner = await makeUser({ email: "owner@test.local", name: "Owner", role: "OWNER" });
    const source = await branchByCode("B1");
    const dest = await branchByCode("B2");
    const pc = await unitByCode("pc");
    const item = await createItem({ sku: "LID", target: "30" });
    await postOpening(owner, {
      branchId: source.id,
      idempotencyKey: "open-lid",
      lines: [{ itemId: item.id, quantity: "100", unitId: pc.id }],
    });
    const pending = await createTransfer(owner, {
      sourceBranchId: source.id,
      destBranchId: dest.id,
      lines: [{ itemId: item.id, quantity: "50", unitId: pc.id }],
    });
    await requestTransfer(owner, pending.id);
    await saveBranchStocking(owner, { branchId: dest.id, itemId: item.id, reorderPoint: "10", targetLevel: "30" });
    let suggestion = await replenishmentForBranch(dest.id);
    expect(suggestion[0]?.incoming.eq(0)).toBe(true);
    expect(suggestion[0]?.suggested.eq(30)).toBe(true);

    const transfer = await createTransfer(owner, {
      sourceBranchId: source.id,
      destBranchId: dest.id,
      lines: [{ itemId: item.id, quantity: "20", unitId: pc.id }],
    });
    await requestTransfer(owner, transfer.id);
    await dispatchTransfer(owner, transfer.id, "lid-dispatch");
    const line = await prisma.stockTransferLine.findFirstOrThrow({ where: { transferId: transfer.id } });
    await receiveTransfer(owner, {
      transferId: transfer.id,
      idempotencyKey: "lid-recv",
      lines: [{ lineId: line.id, receivedQty: "18" }],
    });
    suggestion = await replenishmentForBranch(dest.id);
    const row = suggestion.find((entry) => entry.itemId === item.id);
    expect(row?.available.eq(18)).toBe(true);
    expect(row?.incoming.eq(2)).toBe(true);
    expect(row?.suggested.eq(10)).toBe(true);
    expect(row?.explanation).toContain("incoming 2");
  });

  it("does not deduct inventory when the same sales file is imported twice", async () => {
    const owner = await makeUser({ email: "owner@test.local", name: "Owner", role: "OWNER" });
    const branch = await branchByCode("B1");
    const gram = await unitByCode("g");
    const item = await createItem({ sku: "BATTER", base: "g" });
    await postOpening(owner, {
      branchId: branch.id,
      idempotencyKey: "open-batter",
      lines: [{ itemId: item.id, quantity: "1000", unitId: gram.id }],
    });
    const menu = await createMenuItem(owner, { sku: "TAKO-CSV", name: "CSV demonstration serving" });
    const revision = await saveRecipeRevision(owner, {
      menuItemId: menu.id,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      lines: [{ itemId: item.id, quantity: "15", unitId: gram.id }],
    });
    await activateRecipeRevision(owner, revision.id);
    const csv = [
      "external_id,sold_at,branch_code,menu_sku,quantity",
      "pos-1,2026-02-02 12:00,B1,TAKO-CSV,20",
      "pos-1,2026-02-02 12:00,B1,TAKO-CSV,20",
      "pos-2,2026-02-02 13:00,B9,TAKO-CSV,4",
    ].join("\n");
    const staged = await stageSalesCsv(owner, csv, "sales.csv");
    expect(staged.rows.find((row) => row.externalId === "pos-2")?.status).toBe("FLAGGED");
    const duplicateInFile = staged.rows.filter((row) => row.externalId === "pos-1");
    expect(duplicateInFile.some((row) => row.status === "FLAGGED")).toBe(true);
    expect(duplicateInFile.some((row) => row.status === "VALID")).toBe(true);
    await postSalesBatch(owner, staged.id);
    await postSalesBatch(owner, staged.id);
    const second = await stageSalesCsv(owner, csv, "sales-again.csv");
    await postSalesBatch(owner, second.id);
    expect(await prisma.sale.count()).toBe(1);
    expect(await prisma.stockMovement.count({ where: { movementType: "SALE_CONSUMPTION" } })).toBe(1);
    expect((await getBalance(branch.id, item.id)).eq(700)).toBe(true);
  });

  it("keeps branch balances isolated", async () => {
    const owner = await makeUser({ email: "owner@test.local", name: "Owner", role: "OWNER" });
    const branchA = await branchByCode("B1");
    const branchB = await branchByCode("B2");
    const pc = await unitByCode("pc");
    const item = await createItem({ sku: "FORK" });
    await postOpening(owner, {
      branchId: branchA.id,
      idempotencyKey: "open-a",
      lines: [{ itemId: item.id, quantity: "8", unitId: pc.id }],
    });
    expect((await getBalance(branchA.id, item.id)).eq(8)).toBe(true);
    expect((await getBalance(branchB.id, item.id)).eq(0)).toBe(true);
  });
});
