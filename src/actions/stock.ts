"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/actions/types";
import { WASTE_REASONS } from "@/domain/constants";
import { requireActor } from "@/server/current";
import { AppError } from "@/server/errors";
import { publicErrorMessage, rethrowNavigation } from "@/server/errors";
import { postOpening } from "@/server/opening";
import { postReceiptNow, reverseReceipt } from "@/server/receiving";
import { postUsage } from "@/server/usage";
import { postWaste } from "@/server/waste";
import {
  createTransfer,
  dispatchTransfer,
  receiveTransfer,
  requestTransfer,
  resolveTransferDiscrepancy,
} from "@/server/transfers";
import { createCount, finalizeCount, recordCount, reviewCount, submitCount } from "@/server/counts";
import { createPurchaseOrder, markPurchaseOrderOrdered } from "@/server/purchasing";

async function postingActor() {
  const current = await requireActor();
  if (current.mustChangePassword) {
    throw new AppError("Change your password before posting stock.");
  }
  return current;
}

function lines(formData: FormData) {
  const parsed = JSON.parse(String(formData.get("lines") ?? "[]"));
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Add at least one line before posting.");
  }
  return parsed as Array<Record<string, string>>;
}

function done(path: string) {
  revalidatePath("/", "layout");
  redirect(path);
}

export async function openingAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await postingActor();
  try {
    await postOpening(actor, {
      branchId: String(formData.get("branchId") ?? ""),
      idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      acknowledgeExisting: formData.get("acknowledgeExisting") === "on",
      lines: lines(formData).map((line) => ({
        itemId: line.itemId,
        quantity: line.quantity,
        unitId: line.unitId,
        unitCost: line.unitCost,
      })),
    });
  } catch (error) {
    rethrowNavigation(error);
    return { error: publicErrorMessage(error) };
  }
  done("/inventory?notice=opening");
  return {};
}

export async function receiptAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await postingActor();
  try {
    await postReceiptNow(actor, {
      branchId: String(formData.get("branchId") ?? ""),
      supplierId: String(formData.get("supplierId") ?? "") || null,
      invoiceRef: String(formData.get("invoiceRef") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
      lines: lines(formData).map((line) => ({
        itemId: line.itemId,
        quantity: line.quantity,
        unitId: line.unitId,
        unitCost: line.unitCost,
        damaged: line.damaged,
        rejected: line.rejected,
        lotCode: line.lotCode,
        expiryDate: line.expiryDate,
      })),
    });
  } catch (error) {
    rethrowNavigation(error);
    return { error: publicErrorMessage(error) };
  }
  done("/receive?notice=posted");
  return {};
}

export async function reverseReceiptAction(formData: FormData) {
  const actor = await postingActor();
  const id = String(formData.get("id") ?? "");
  try {
    await reverseReceipt(actor, id, String(formData.get("reason") ?? ""));
  } catch (error) {
    rethrowNavigation(error);
    redirect(`/receive/${id}?error=${encodeURIComponent(publicErrorMessage(error))}`);
  }
  done(`/receive/${id}?notice=reversed`);
}

export async function usageAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await postingActor();
  const kind = formData.get("kind") === "RETURN" ? "RETURN" : "ACTUAL";
  try {
    await postUsage(actor, {
      branchId: String(formData.get("branchId") ?? ""),
      kind,
      notes: String(formData.get("notes") ?? ""),
      idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
      lines: lines(formData).map((line) => ({
        itemId: line.itemId,
        quantity: line.quantity,
        unitId: line.unitId,
        notes: line.notes,
      })),
    });
  } catch (error) {
    rethrowNavigation(error);
    return { error: publicErrorMessage(error) };
  }
  done(kind === "RETURN" ? "/usage?notice=returned" : "/usage?notice=used");
  return {};
}

export async function wasteAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await postingActor();
  try {
    await postWaste(actor, {
      branchId: String(formData.get("branchId") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
      lines: lines(formData).map((line) => ({
        itemId: line.itemId,
        quantity: line.quantity,
        unitId: line.unitId,
        reason: line.reason || "OTHER",
        notes: line.notes,
        lotCode: line.lotCode,
      })).map((line) => ({ ...line, reason: line.reason })),
    });
  } catch (error) {
    rethrowNavigation(error);
    return { error: publicErrorMessage(error) };
  }
  done("/waste?notice=posted");
  return {};
}

export async function transferCreateAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await postingActor();
  try {
    const transfer = await createTransfer(actor, {
      sourceBranchId: String(formData.get("branchId") ?? ""),
      destBranchId: String(formData.get("destBranchId") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      lines: lines(formData).map((line) => ({ itemId: line.itemId, quantity: line.quantity, unitId: line.unitId })),
    });
    await requestTransfer(actor, transfer.id);
    revalidatePath("/", "layout");
    redirect(`/transfers/${transfer.id}?notice=requested`);
  } catch (error) {
    rethrowNavigation(error);
    return { error: publicErrorMessage(error) };
  }
}

export async function dispatchAction(formData: FormData) {
  const actor = await postingActor();
  const id = String(formData.get("id") ?? "");
  try {
    await dispatchTransfer(actor, id, String(formData.get("idempotencyKey") ?? crypto.randomUUID()));
  } catch (error) {
    rethrowNavigation(error);
    redirect(`/transfers/${id}?error=${encodeURIComponent(publicErrorMessage(error))}`);
  }
  done(`/transfers/${id}?notice=dispatched`);
}

export async function receiveTransferAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await postingActor();
  const id = String(formData.get("transferId") ?? "");
  try {
    const parsed = JSON.parse(String(formData.get("lines") ?? "[]")) as Array<Record<string, string>>;
    await receiveTransfer(actor, {
      transferId: id,
      idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
      lines: parsed.map((line) => ({
        lineId: line.lineId,
        receivedQty: line.receivedQty,
        damagedQty: line.damagedQty,
        rejectedQty: line.rejectedQty,
        notes: line.notes,
        reason: line.reason,
      })),
    });
  } catch (error) {
    rethrowNavigation(error);
    return { error: publicErrorMessage(error) };
  }
  done(`/transfers/${id}?notice=received`);
  return {};
}

export async function resolveTransferAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await postingActor();
  const id = String(formData.get("transferId") ?? "");
  try {
    await resolveTransferDiscrepancy(actor, {
      transferId: id,
      lineId: String(formData.get("lineId") ?? ""),
      quantity: String(formData.get("quantity") ?? ""),
      reason: String(formData.get("reason") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    });
  } catch (error) {
    rethrowNavigation(error);
    return { error: publicErrorMessage(error) };
  }
  done(`/transfers/${id}?notice=resolved`);
  return {};
}

export async function countCreateAction(formData: FormData) {
  const actor = await postingActor();
  const itemIds = formData.getAll("itemId").map(String).filter(Boolean);
  try {
    const count = await createCount(actor, {
      branchId: String(formData.get("branchId") ?? ""),
      itemIds,
      notes: String(formData.get("notes") ?? ""),
    });
    revalidatePath("/", "layout");
    redirect(`/counts/${count.id}`);
  } catch (error) {
    rethrowNavigation(error);
    redirect(`/counts/new?error=${encodeURIComponent(publicErrorMessage(error))}`);
  }
}

export async function countRecordAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await postingActor();
  const id = String(formData.get("countId") ?? "");
  try {
    const entries = JSON.parse(String(formData.get("entries") ?? "[]")) as Array<{
      itemId: string;
      countedQty: string;
      reasonCode?: string;
      notes?: string;
    }>;
    await recordCount(actor, id, entries);
    if (formData.get("intent") === "submit") await submitCount(actor, id);
  } catch (error) {
    rethrowNavigation(error);
    return { error: publicErrorMessage(error) };
  }
  done(`/counts/${id}?notice=saved`);
  return {};
}

export async function reviewCountAction(formData: FormData) {
  const actor = await postingActor();
  const id = String(formData.get("countId") ?? "");
  try {
    await reviewCount(actor, id);
  } catch (error) {
    rethrowNavigation(error);
    redirect(`/counts/${id}?error=${encodeURIComponent(publicErrorMessage(error))}`);
  }
  done(`/counts/${id}?notice=reviewed`);
}

export async function finalizeCountAction(formData: FormData) {
  const actor = await postingActor();
  const id = String(formData.get("countId") ?? "");
  try {
    await finalizeCount(actor, id, String(formData.get("finalizeKey") ?? crypto.randomUUID()));
  } catch (error) {
    rethrowNavigation(error);
    redirect(`/counts/${id}?error=${encodeURIComponent(publicErrorMessage(error))}`);
  }
  done(`/counts/${id}?notice=finalized`);
}

export async function purchaseOrderAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await postingActor();
  try {
    const order = await createPurchaseOrder(actor, {
      branchId: String(formData.get("branchId") ?? ""),
      supplierId: String(formData.get("supplierId") ?? "") || null,
      notes: String(formData.get("notes") ?? ""),
      lines: lines(formData).map((line) => ({
        itemId: line.itemId,
        quantity: line.quantity,
        unitId: line.unitId,
        unitCost: line.unitCost,
      })),
    });
    await markPurchaseOrderOrdered(actor, order.id);
    revalidatePath("/", "layout");
    redirect(`/purchase-orders?notice=ordered`);
  } catch (error) {
    rethrowNavigation(error);
    return { error: publicErrorMessage(error) };
  }
}

void WASTE_REASONS;
