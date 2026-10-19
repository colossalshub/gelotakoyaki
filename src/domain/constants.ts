export const BUSINESS_NAME = "Gelos Takoyaki";
export const DEFAULT_TIMEZONE = "Asia/Manila";
export const DEFAULT_CURRENCY = "PHP";

export const DISCREPANCY_REASONS = [
  { code: "COUNTING_ERROR", label: "Counting error" },
  { code: "UNRECORDED_USAGE", label: "Unrecorded usage" },
  { code: "SPOILAGE", label: "Spoilage" },
  { code: "PREPARATION_LOSS", label: "Preparation loss" },
  { code: "TRANSFER_DISCREPANCY", label: "Transfer discrepancy" },
  { code: "INCORRECT_RECEIVING", label: "Incorrect receiving" },
  { code: "UNIT_CONVERSION_ERROR", label: "Unit conversion error" },
  { code: "RECIPE_MISMATCH", label: "Recipe mismatch" },
  { code: "UNKNOWN", label: "Unknown cause" },
  { code: "OTHER", label: "Other" },
] as const;

export type DiscrepancyReasonCode = (typeof DISCREPANCY_REASONS)[number]["code"];

export const WASTE_REASONS = [
  { code: "EXPIRED", label: "Expired" },
  { code: "DROPPED", label: "Dropped or spilled" },
  { code: "DAMAGED_PACKAGING", label: "Damaged packaging" },
  { code: "PREPARATION_LOSS", label: "Preparation loss" },
  { code: "QUALITY_REJECTION", label: "Quality rejection" },
  { code: "OTHER", label: "Other" },
] as const;

export const MOVEMENT_LABELS: Record<string, string> = {
  OPENING: "Opening balance",
  SUPPLIER_RECEIPT: "Supplier receipt",
  SUPPLIER_RETURN: "Supplier return",
  SALE_CONSUMPTION: "Recipe consumption from sales",
  ACTUAL_USAGE: "Recorded usage",
  WASTE: "Waste or spoilage",
  TRANSFER_OUT: "Transfer sent",
  TRANSFER_IN: "Transfer received",
  OPERATIONAL_RETURN: "Returned to stock",
  PRODUCTION: "Prepared output",
  ADJUSTMENT: "Count adjustment",
  REVERSAL: "Reversal",
};

export type InventoryPolicy = {
  currency: string;
  timezone: string;
  preventNegativeStock: boolean;
  requireCountApproval: boolean;
  separateCountDuties: boolean;
  requireTransferDiscrepancyApproval: boolean;
  repeatedShortageThreshold: number;
  expiryWarningDays: number;
};

export const DEFAULT_POLICY: InventoryPolicy = {
  currency: DEFAULT_CURRENCY,
  timezone: DEFAULT_TIMEZONE,
  preventNegativeStock: true,
  requireCountApproval: true,
  separateCountDuties: true,
  requireTransferDiscrepancyApproval: true,
  repeatedShortageThreshold: 2,
  expiryWarningDays: 7,
};

export const STARTER_UNITS = [
  { code: "g", name: "Gram", dimension: "mass", toDimensionBase: "1" },
  { code: "kg", name: "Kilogram", dimension: "mass", toDimensionBase: "1000" },
  { code: "ml", name: "Millilitre", dimension: "volume", toDimensionBase: "1" },
  { code: "L", name: "Litre", dimension: "volume", toDimensionBase: "1000" },
  { code: "pc", name: "Piece", dimension: "count", toDimensionBase: "1" },
] as const;

export const STARTER_CATEGORIES = [
  { name: "Main ingredients", description: "Primary food ingredients" },
  { name: "Batter and dry ingredients", description: "Flours, mixes, and dry goods" },
  { name: "Vegetables", description: "Fresh vegetables" },
  { name: "Sauces and condiments", description: "Sauces, mayonnaise, and condiments" },
  { name: "Toppings", description: "Toppings and flakes" },
  { name: "Packaging", description: "Containers, skewers, bags, and napkins" },
  { name: "Cleaning supplies", description: "Cleaning and sanitation supplies" },
  { name: "Other operating supplies", description: "Anything else the shop uses" },
] as const;

export const STARTER_BRANCHES = [
  {
    code: "B1",
    name: "Branch 1",
    notes: "Starter branch. Rename this to the real shop name. No address or stock is assumed.",
  },
  {
    code: "B2",
    name: "Branch 2",
    notes: "Starter branch. Rename this to the real shop name. No address or stock is assumed.",
  },
] as const;
