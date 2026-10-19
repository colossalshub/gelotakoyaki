"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/actions/types";
import type { BranchAccess } from "@/domain/permissions";
import { saveBranch, saveBranchStocking, saveCategory, saveItem, saveSupplier, importCatalogCsv } from "@/server/catalog";
import { requireActor } from "@/server/current";
import { publicErrorMessage, rethrowNavigation } from "@/server/errors";
import { activateRecipeRevision, createMenuItem, postPreparation, savePreparationRecipe, saveRecipeRevision } from "@/server/recipes";
import { postSale, postSalesBatch, stageSalesCsv } from "@/server/sales";
import { savePolicy } from "@/server/settings";
import { prisma } from "@/server/db";
import { createStaffUser, updateUserAccess } from "@/server/users";
import { DEFAULT_POLICY } from "@/domain/constants";

function finish(path: string): never {
  revalidatePath("/", "layout");
  redirect(path);
}

export async function itemAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  const id = String(formData.get("id") ?? "");
  try {
    await saveItem(
      actor,
      {
        sku: String(formData.get("sku") ?? ""),
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
        categoryId: String(formData.get("categoryId") ?? ""),
        baseUnitId: String(formData.get("baseUnitId") ?? ""),
        purchaseUnitId: String(formData.get("purchaseUnitId") ?? ""),
        purchaseToBaseFactor: String(formData.get("purchaseToBaseFactor") ?? ""),
        supplierId: String(formData.get("supplierId") ?? "") || null,
        purchaseCost: String(formData.get("purchaseCost") ?? ""),
        defaultReorderPoint: String(formData.get("defaultReorderPoint") ?? ""),
        defaultTargetLevel: String(formData.get("defaultTargetLevel") ?? ""),
        tracksExpiry: formData.get("tracksExpiry") === "on",
        tracksBatch: formData.get("tracksBatch") === "on",
        storageLocation: String(formData.get("storageLocation") ?? ""),
        active: formData.get("active") !== "off",
      },
      id || undefined,
    );
  } catch (error) {
    rethrowNavigation(error);
    return { error: publicErrorMessage(error) };
  }
  finish("/settings/catalog?notice=saved");
}

export async function stockingAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  try {
    await saveBranchStocking(actor, {
      branchId: String(formData.get("branchId") ?? ""),
      itemId: String(formData.get("itemId") ?? ""),
      reorderPoint: String(formData.get("reorderPoint") ?? ""),
      targetLevel: String(formData.get("targetLevel") ?? ""),
      storageLocation: String(formData.get("storageLocation") ?? ""),
    });
  } catch (error) {
    rethrowNavigation(error);
    return { error: publicErrorMessage(error) };
  }
  finish(`/inventory/${String(formData.get("itemId") ?? "")}?notice=levels`);
}

export async function categoryAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  try {
    await saveCategory(actor, {
      id: String(formData.get("id") ?? "") || undefined,
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      active: formData.get("active") !== "off",
    });
  } catch (error) {
    rethrowNavigation(error);
    return { error: publicErrorMessage(error) };
  }
  finish("/settings?notice=category");
}

export async function supplierAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  try {
    await saveSupplier(actor, {
      name: String(formData.get("name") ?? ""),
      contact: String(formData.get("contact") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    });
  } catch (error) {
    rethrowNavigation(error);
    return { error: publicErrorMessage(error) };
  }
  finish("/settings?notice=supplier");
}

export async function branchAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  try {
    await saveBranch(actor, {
      id: String(formData.get("id") ?? "") || undefined,
      code: String(formData.get("code") ?? ""),
      name: String(formData.get("name") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      active: formData.get("active") === "on",
    });
  } catch (error) {
    rethrowNavigation(error);
    return { error: publicErrorMessage(error) };
  }
  finish("/settings/branches?notice=saved");
}

export async function userAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  const branchIds = formData.getAll("branchId").map(String);
  const branches: BranchAccess[] = branchIds.map((branchId) => ({
    branchId,
    canReceive: formData.get(`receive:${branchId}`) === "on",
    canCount: formData.get(`count:${branchId}`) === "on",
    canWaste: formData.get(`waste:${branchId}`) !== "off",
    canTransferRequest: formData.get(`request:${branchId}`) !== "off",
    canTransferDispatch: formData.get(`dispatch:${branchId}`) === "on",
    canTransferReceive: formData.get(`treceive:${branchId}`) === "on",
    canRecordUsage: formData.get(`usage:${branchId}`) !== "off",
    canRecordSales: formData.get(`sales:${branchId}`) === "on",
    canApproveAdjustments: formData.get(`approve:${branchId}`) === "on",
  }));
  try {
    const role = formData.get("role") === "BRANCH_MANAGER" ? "BRANCH_MANAGER" : "STAFF";
    await createStaffUser(actor, {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      role,
      branches,
    });
  } catch (error) {
    rethrowNavigation(error);
    return { error: publicErrorMessage(error) };
  }
  finish("/settings/users?notice=created");
}

export async function userUpdateAction(formData: FormData) {
  const actor = await requireActor();
  const userId = String(formData.get("userId") ?? "");
  const branchIds = formData.getAll("branchId").map(String);
  const branches: BranchAccess[] = branchIds.map((branchId) => ({
    branchId,
    canReceive: formData.get(`receive:${branchId}`) === "on",
    canCount: formData.get(`count:${branchId}`) === "on",
    canWaste: true,
    canTransferRequest: true,
    canTransferDispatch: formData.get(`dispatch:${branchId}`) === "on",
    canTransferReceive: formData.get(`treceive:${branchId}`) === "on",
    canRecordUsage: true,
    canRecordSales: formData.get(`sales:${branchId}`) === "on",
    canApproveAdjustments: formData.get(`approve:${branchId}`) === "on",
  }));
  try {
    const roleValue = String(formData.get("role") ?? "STAFF");
    const role = roleValue === "OWNER" || roleValue === "BRANCH_MANAGER" ? roleValue : "STAFF";
    await updateUserAccess(actor, userId, {
      role,
      active: formData.get("active") === "on",
      branches,
    });
  } catch (error) {
    rethrowNavigation(error);
    redirect(`/settings/users?error=${encodeURIComponent(publicErrorMessage(error))}`);
  }
  finish("/settings/users?notice=updated");
}

export async function policyAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  if (actor.role !== "OWNER") return { error: "Only the owner can change inventory policy." };
  try {
    await prisma.$transaction(async (tx) => {
      await savePolicy(tx, {
        ...DEFAULT_POLICY,
        currency: "PHP",
        timezone: "Asia/Manila",
        preventNegativeStock: formData.get("preventNegativeStock") === "on",
        requireCountApproval: formData.get("requireCountApproval") === "on",
        separateCountDuties: formData.get("separateCountDuties") === "on",
        requireTransferDiscrepancyApproval: formData.get("requireTransferDiscrepancyApproval") === "on",
        repeatedShortageThreshold: Number(formData.get("repeatedShortageThreshold") ?? 2) || 2,
        expiryWarningDays: Number(formData.get("expiryWarningDays") ?? 7) || 7,
      });
    });
  } catch (error) {
    rethrowNavigation(error);
    return { error: publicErrorMessage(error) };
  }
  finish("/settings/policies?notice=saved");
}

export async function catalogImportAction(formData: FormData) {
  const actor = await requireActor();
  try {
    const file = formData.get("file");
    const text = file instanceof File ? await file.text() : String(formData.get("csv") ?? "");
    const result = await importCatalogCsv(actor, text);
    if (result.errors.length) {
      redirect(`/settings/catalog?error=${encodeURIComponent(result.errors.slice(0, 5).join(" "))}`);
    }
  } catch (error) {
    rethrowNavigation(error);
    redirect(`/settings/catalog?error=${encodeURIComponent(publicErrorMessage(error))}`);
  }
  finish("/settings/catalog?notice=imported");
}

export async function menuAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  try {
    const menu = await createMenuItem(actor, {
      sku: String(formData.get("sku") ?? ""),
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
    });
    const raw = JSON.parse(String(formData.get("lines") ?? "[]")) as Array<Record<string, string>>;
    if (raw.length) {
      const revision = await saveRecipeRevision(actor, {
        menuItemId: menu.id,
        effectiveFrom: new Date(),
        notes: "Example quantities are not a real Gelos recipe unless you replace them.",
        lines: raw.map((line) => ({
          itemId: line.itemId,
          quantity: line.quantity,
          unitId: line.unitId,
          yieldFactor: line.yieldFactor || "1",
        })),
      });
      await activateRecipeRevision(actor, revision.id);
    }
  } catch (error) {
    rethrowNavigation(error);
    return { error: publicErrorMessage(error) };
  }
  finish("/recipes?notice=saved");
}

export async function saleAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  try {
    await postSale(actor, {
      branchId: String(formData.get("branchId") ?? ""),
      menuItemId: String(formData.get("menuItemId") ?? ""),
      quantity: String(formData.get("quantity") ?? ""),
      soldAt: new Date(),
      source: "MANUAL",
      externalId: String(formData.get("idempotencyKey") ?? crypto.randomUUID()),
    });
  } catch (error) {
    rethrowNavigation(error);
    return { error: publicErrorMessage(error) };
  }
  finish("/sales?notice=posted");
}

export async function salesImportAction(formData: FormData) {
  const actor = await requireActor();
  try {
    const file = formData.get("file");
    const text = file instanceof File ? await file.text() : "";
    const staged = await stageSalesCsv(actor, text, file instanceof File ? file.name : undefined);
    if (formData.get("intent") === "post") await postSalesBatch(actor, staged.id);
    revalidatePath("/", "layout");
    redirect(`/sales?batch=${staged.id}`);
  } catch (error) {
    rethrowNavigation(error);
    redirect(`/sales?error=${encodeURIComponent(publicErrorMessage(error))}`);
  }
}

export async function preparationAction(_state: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  try {
    const recipe = await savePreparationRecipe(actor, {
      name: String(formData.get("name") ?? ""),
      outputItemId: String(formData.get("outputItemId") ?? ""),
      outputQuantity: String(formData.get("outputQuantity") ?? ""),
      outputUnitId: String(formData.get("outputUnitId") ?? ""),
      lines: JSON.parse(String(formData.get("lines") ?? "[]")),
    });
    if (formData.get("postNow") === "on") {
      await postPreparation(actor, {
        branchId: String(formData.get("branchId") ?? ""),
        recipeId: recipe.id,
        batchesMade: String(formData.get("batchesMade") ?? "1"),
        idempotencyKey: String(formData.get("idempotencyKey") ?? crypto.randomUUID()),
      });
    }
  } catch (error) {
    rethrowNavigation(error);
    return { error: publicErrorMessage(error) };
  }
  finish("/recipes?notice=prepared");
}
