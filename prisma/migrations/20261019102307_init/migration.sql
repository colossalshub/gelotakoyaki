-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('OWNER', 'BRANCH_MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "movement_type" AS ENUM ('OPENING', 'SUPPLIER_RECEIPT', 'SUPPLIER_RETURN', 'SALE_CONSUMPTION', 'ACTUAL_USAGE', 'WASTE', 'TRANSFER_OUT', 'TRANSFER_IN', 'OPERATIONAL_RETURN', 'PRODUCTION', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "document_status" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "po_status" AS ENUM ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "transfer_status" AS ENUM ('DRAFT', 'REQUESTED', 'DISPATCHED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "count_status" AS ENUM ('DRAFT', 'SUBMITTED', 'REVIEWED', 'FINALIZED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "usage_kind" AS ENUM ('ACTUAL', 'RETURN');

-- CreateEnum
CREATE TYPE "recipe_status" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "import_status" AS ENUM ('DRAFT', 'POSTED');

-- CreateEnum
CREATE TYPE "row_status" AS ENUM ('PENDING', 'VALID', 'FLAGGED', 'POSTED', 'SKIPPED_DUPLICATE');

-- CreateEnum
CREATE TYPE "sale_status" AS ENUM ('POSTED', 'REVERSED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_branches" (
    "user_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "can_receive" BOOLEAN NOT NULL DEFAULT false,
    "can_count" BOOLEAN NOT NULL DEFAULT false,
    "can_waste" BOOLEAN NOT NULL DEFAULT true,
    "can_transfer_request" BOOLEAN NOT NULL DEFAULT true,
    "can_transfer_dispatch" BOOLEAN NOT NULL DEFAULT false,
    "can_transfer_receive" BOOLEAN NOT NULL DEFAULT false,
    "can_record_usage" BOOLEAN NOT NULL DEFAULT true,
    "can_record_sales" BOOLEAN NOT NULL DEFAULT false,
    "can_approve_adjustments" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_branches_pkey" PRIMARY KEY ("user_id","branch_id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "to_dimension_base" DECIMAL(18,6) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category_id" UUID NOT NULL,
    "base_unit_id" UUID NOT NULL,
    "purchase_unit_id" UUID NOT NULL,
    "purchase_to_base_factor" DECIMAL(18,6) NOT NULL,
    "supplier_id" UUID,
    "purchase_cost" DECIMAL(14,4),
    "default_reorder_point" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "default_target_level" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "tracks_expiry" BOOLEAN NOT NULL DEFAULT false,
    "tracks_batch" BOOLEAN NOT NULL DEFAULT false,
    "storage_location" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_items" (
    "branch_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "reorder_point" DECIMAL(18,6) NOT NULL,
    "target_level" DECIMAL(18,6) NOT NULL,
    "storage_location" TEXT,

    CONSTRAINT "branch_items_pkey" PRIMARY KEY ("branch_id","item_id")
);

-- CreateTable
CREATE TABLE "inventory_balances" (
    "branch_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("branch_id","item_id")
);

-- CreateTable
CREATE TABLE "branch_item_costs" (
    "branch_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "on_hand_qty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "total_value" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "avg_cost" DECIMAL(18,6),
    "last_cost" DECIMAL(18,6),
    "cost_complete" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_item_costs_pkey" PRIMARY KEY ("branch_id","item_id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "quantity_delta" DECIMAL(18,6) NOT NULL,
    "unit_id" UUID NOT NULL,
    "entered_quantity" DECIMAL(18,6),
    "entered_unit_id" UUID,
    "movement_type" "movement_type" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "user_id" UUID NOT NULL,
    "reference_type" TEXT,
    "reference_id" UUID,
    "reason" TEXT,
    "notes" TEXT,
    "source_ref" TEXT,
    "idempotency_key" TEXT,
    "reversal_of_id" UUID,
    "batch_id" UUID,
    "unit_cost" DECIMAL(18,6),
    "value_delta" DECIMAL(18,6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_batches" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "lot_code" TEXT NOT NULL,
    "expiry_date" DATE,
    "remaining_qty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "branch_id" UUID NOT NULL,
    "supplier_id" UUID,
    "purchase_order_id" UUID,
    "status" "document_status" NOT NULL DEFAULT 'DRAFT',
    "invoice_ref" TEXT,
    "notes" TEXT,
    "received_at" TIMESTAMP(3),
    "idempotency_key" TEXT,
    "created_by_id" UUID NOT NULL,
    "posted_by_id" UUID,
    "posted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_lines" (
    "id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "entered_quantity" DECIMAL(18,6) NOT NULL,
    "entered_unit_id" UUID NOT NULL,
    "accepted_quantity" DECIMAL(18,6) NOT NULL,
    "damaged_quantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "rejected_quantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(18,6),
    "base_quantity" DECIMAL(18,6),
    "lot_code" TEXT,
    "expiry_date" DATE,
    "purchase_order_line_id" UUID,
    "movement_id" UUID,

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_returns" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "branch_id" UUID NOT NULL,
    "supplier_id" UUID,
    "status" "document_status" NOT NULL DEFAULT 'DRAFT',
    "reference" TEXT,
    "notes" TEXT,
    "idempotency_key" TEXT,
    "created_by_id" UUID NOT NULL,
    "posted_by_id" UUID,
    "posted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_return_lines" (
    "id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "entered_quantity" DECIMAL(18,6) NOT NULL,
    "entered_unit_id" UUID NOT NULL,
    "base_quantity" DECIMAL(18,6),
    "reason" TEXT,
    "movement_id" UUID,

    CONSTRAINT "supplier_return_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "branch_id" UUID NOT NULL,
    "supplier_id" UUID,
    "status" "po_status" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "ordered_qty" DECIMAL(18,6) NOT NULL,
    "unit_id" UUID NOT NULL,
    "unit_cost" DECIMAL(18,6),
    "received_qty" DECIMAL(18,6) NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_documents" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "branch_id" UUID NOT NULL,
    "status" "document_status" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "idempotency_key" TEXT,
    "created_by_id" UUID NOT NULL,
    "posted_by_id" UUID,
    "posted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opening_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_lines" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "entered_quantity" DECIMAL(18,6) NOT NULL,
    "entered_unit_id" UUID NOT NULL,
    "base_quantity" DECIMAL(18,6),
    "unit_cost" DECIMAL(18,6),
    "movement_id" UUID,

    CONSTRAINT "opening_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "source_branch_id" UUID NOT NULL,
    "dest_branch_id" UUID NOT NULL,
    "status" "transfer_status" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "requested_by_id" UUID NOT NULL,
    "dispatched_by_id" UUID,
    "dispatched_at" TIMESTAMP(3),
    "dispatch_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_lines" (
    "id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "entered_quantity" DECIMAL(18,6) NOT NULL,
    "requested_qty" DECIMAL(18,6) NOT NULL,
    "dispatched_qty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "received_qty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "damaged_qty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "rejected_qty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "loss_qty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "discrepancy_reason" TEXT,
    "discrepancy_notes" TEXT,
    "discrepancy_approved_by_id" UUID,
    "dispatch_movement_id" UUID,

    CONSTRAINT "stock_transfer_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_receipts" (
    "id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "line_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "received_qty" DECIMAL(18,6) NOT NULL,
    "damaged_qty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "rejected_qty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "received_by_id" UUID NOT NULL,
    "movement_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfer_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_counts" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "branch_id" UUID NOT NULL,
    "status" "count_status" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "counter_id" UUID NOT NULL,
    "reviewer_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "finalized_by_id" UUID,
    "finalized_at" TIMESTAMP(3),
    "finalize_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_lines" (
    "id" UUID NOT NULL,
    "count_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "expected_qty" DECIMAL(18,6) NOT NULL,
    "snapshot_at" TIMESTAMP(3) NOT NULL,
    "counted_qty" DECIMAL(18,6),
    "variance_qty" DECIMAL(18,6),
    "variance_cost" DECIMAL(18,6),
    "cost_known" BOOLEAN NOT NULL DEFAULT false,
    "reason_code" TEXT,
    "notes" TEXT,
    "adjustment_movement_id" UUID,

    CONSTRAINT "stock_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waste_records" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "branch_id" UUID NOT NULL,
    "status" "document_status" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "idempotency_key" TEXT,
    "created_by_id" UUID NOT NULL,
    "posted_by_id" UUID,
    "posted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waste_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waste_lines" (
    "id" UUID NOT NULL,
    "waste_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "entered_quantity" DECIMAL(18,6) NOT NULL,
    "entered_unit_id" UUID NOT NULL,
    "base_quantity" DECIMAL(18,6),
    "reason" TEXT NOT NULL,
    "batch_id" UUID,
    "notes" TEXT,
    "movement_id" UUID,

    CONSTRAINT "waste_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "branch_id" UUID NOT NULL,
    "kind" "usage_kind" NOT NULL DEFAULT 'ACTUAL',
    "status" "document_status" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "idempotency_key" TEXT,
    "created_by_id" UUID NOT NULL,
    "posted_by_id" UUID,
    "posted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_lines" (
    "id" UUID NOT NULL,
    "usage_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "entered_quantity" DECIMAL(18,6) NOT NULL,
    "entered_unit_id" UUID NOT NULL,
    "base_quantity" DECIMAL(18,6),
    "notes" TEXT,
    "movement_id" UUID,

    CONSTRAINT "usage_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preparation_recipes" (
    "id" UUID NOT NULL,
    "output_item_id" UUID NOT NULL,
    "output_quantity" DECIMAL(18,6) NOT NULL,
    "output_unit_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "preparation_recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preparation_lines" (
    "id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unit_id" UUID NOT NULL,
    "yield_factor" DECIMAL(18,6) NOT NULL DEFAULT 1,

    CONSTRAINT "preparation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preparation_batches" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "branch_id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "batches_made" DECIMAL(18,6) NOT NULL,
    "status" "document_status" NOT NULL DEFAULT 'DRAFT',
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "idempotency_key" TEXT,
    "created_by_id" UUID NOT NULL,
    "posted_by_id" UUID,
    "posted_at" TIMESTAMP(3),
    "output_unit_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preparation_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_variants" (
    "id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "menu_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_revisions" (
    "id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "variant_id" UUID,
    "version" INTEGER NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "status" "recipe_status" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_lines" (
    "id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "quantity_per_unit" DECIMAL(18,6) NOT NULL,
    "unit_id" UUID NOT NULL,
    "yield_factor" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "notes" TEXT,

    CONSTRAINT "recipe_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_batches" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "status" "import_status" NOT NULL DEFAULT 'DRAFT',
    "file_name" TEXT,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "posted_at" TIMESTAMP(3),

    CONSTRAINT "sales_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_import_rows" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "sold_at_raw" TEXT NOT NULL,
    "branch_code" TEXT NOT NULL,
    "menu_sku" TEXT NOT NULL,
    "variant_sku" TEXT,
    "quantity_raw" TEXT NOT NULL,
    "status" "row_status" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "sale_id" UUID,

    CONSTRAINT "sale_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "variant_id" UUID,
    "recipe_revision_id" UUID,
    "quantity" DECIMAL(18,6) NOT NULL,
    "sold_at" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "status" "sale_status" NOT NULL DEFAULT 'POSTED',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "branch_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "number_sequences" (
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "login_attempts_key_created_at_idx" ON "login_attempts"("key", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "branches_code_key" ON "branches"("code");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "units_code_key" ON "units"("code");

-- CreateIndex
CREATE UNIQUE INDEX "items_sku_key" ON "items"("sku");

-- CreateIndex
CREATE INDEX "items_name_idx" ON "items"("name");

-- CreateIndex
CREATE INDEX "items_category_id_idx" ON "items"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_idempotency_key_key" ON "stock_movements"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_reversal_of_id_key" ON "stock_movements"("reversal_of_id");

-- CreateIndex
CREATE INDEX "stock_movements_branch_id_item_id_occurred_at_idx" ON "stock_movements"("branch_id", "item_id", "occurred_at");

-- CreateIndex
CREATE INDEX "stock_movements_reference_type_reference_id_idx" ON "stock_movements"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "stock_movements_occurred_at_idx" ON "stock_movements"("occurred_at");

-- CreateIndex
CREATE INDEX "item_batches_branch_id_item_id_idx" ON "item_batches"("branch_id", "item_id");

-- CreateIndex
CREATE INDEX "item_batches_expiry_date_idx" ON "item_batches"("expiry_date");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_number_key" ON "goods_receipts"("number");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_idempotency_key_key" ON "goods_receipts"("idempotency_key");

-- CreateIndex
CREATE INDEX "goods_receipts_branch_id_status_idx" ON "goods_receipts"("branch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipt_lines_movement_id_key" ON "goods_receipt_lines"("movement_id");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_receipt_id_idx" ON "goods_receipt_lines"("receipt_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_returns_number_key" ON "supplier_returns"("number");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_returns_idempotency_key_key" ON "supplier_returns"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_return_lines_movement_id_key" ON "supplier_return_lines"("movement_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_number_key" ON "purchase_orders"("number");

-- CreateIndex
CREATE UNIQUE INDEX "opening_documents_number_key" ON "opening_documents"("number");

-- CreateIndex
CREATE UNIQUE INDEX "opening_documents_idempotency_key_key" ON "opening_documents"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "opening_lines_movement_id_key" ON "opening_lines"("movement_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_number_key" ON "stock_transfers"("number");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_dispatch_key_key" ON "stock_transfers"("dispatch_key");

-- CreateIndex
CREATE INDEX "stock_transfers_source_branch_id_status_idx" ON "stock_transfers"("source_branch_id", "status");

-- CreateIndex
CREATE INDEX "stock_transfers_dest_branch_id_status_idx" ON "stock_transfers"("dest_branch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfer_lines_dispatch_movement_id_key" ON "stock_transfer_lines"("dispatch_movement_id");

-- CreateIndex
CREATE UNIQUE INDEX "transfer_receipts_idempotency_key_key" ON "transfer_receipts"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "transfer_receipts_movement_id_key" ON "transfer_receipts"("movement_id");

-- CreateIndex
CREATE INDEX "transfer_receipts_transfer_id_idx" ON "transfer_receipts"("transfer_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_counts_number_key" ON "stock_counts"("number");

-- CreateIndex
CREATE UNIQUE INDEX "stock_counts_finalize_key_key" ON "stock_counts"("finalize_key");

-- CreateIndex
CREATE INDEX "stock_counts_branch_id_status_idx" ON "stock_counts"("branch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_lines_adjustment_movement_id_key" ON "stock_count_lines"("adjustment_movement_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_lines_count_id_item_id_key" ON "stock_count_lines"("count_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "waste_records_number_key" ON "waste_records"("number");

-- CreateIndex
CREATE UNIQUE INDEX "waste_records_idempotency_key_key" ON "waste_records"("idempotency_key");

-- CreateIndex
CREATE INDEX "waste_records_branch_id_occurred_at_idx" ON "waste_records"("branch_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "waste_lines_movement_id_key" ON "waste_lines"("movement_id");

-- CreateIndex
CREATE UNIQUE INDEX "usage_records_number_key" ON "usage_records"("number");

-- CreateIndex
CREATE UNIQUE INDEX "usage_records_idempotency_key_key" ON "usage_records"("idempotency_key");

-- CreateIndex
CREATE INDEX "usage_records_branch_id_occurred_at_idx" ON "usage_records"("branch_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "usage_lines_movement_id_key" ON "usage_lines"("movement_id");

-- CreateIndex
CREATE UNIQUE INDEX "preparation_batches_number_key" ON "preparation_batches"("number");

-- CreateIndex
CREATE UNIQUE INDEX "preparation_batches_idempotency_key_key" ON "preparation_batches"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "menu_items_sku_key" ON "menu_items"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "menu_variants_sku_key" ON "menu_variants"("sku");

-- CreateIndex
CREATE INDEX "recipe_revisions_menu_item_id_variant_id_effective_from_idx" ON "recipe_revisions"("menu_item_id", "variant_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_revisions_menu_item_id_variant_id_version_key" ON "recipe_revisions"("menu_item_id", "variant_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "sale_import_rows_batch_id_external_id_key" ON "sale_import_rows"("batch_id", "external_id");

-- CreateIndex
CREATE INDEX "sales_branch_id_sold_at_idx" ON "sales"("branch_id", "sold_at");

-- CreateIndex
CREATE UNIQUE INDEX "sales_source_external_id_key" ON "sales"("source", "external_id");

-- CreateIndex
CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_base_unit_id_fkey" FOREIGN KEY ("base_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_purchase_unit_id_fkey" FOREIGN KEY ("purchase_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_items" ADD CONSTRAINT "branch_items_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_items" ADD CONSTRAINT "branch_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_item_costs" ADD CONSTRAINT "branch_item_costs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_item_costs" ADD CONSTRAINT "branch_item_costs_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_entered_unit_id_fkey" FOREIGN KEY ("entered_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "item_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_batches" ADD CONSTRAINT "item_batches_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_batches" ADD CONSTRAINT "item_batches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_posted_by_id_fkey" FOREIGN KEY ("posted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_entered_unit_id_fkey" FOREIGN KEY ("entered_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_purchase_order_line_id_fkey" FOREIGN KEY ("purchase_order_line_id") REFERENCES "purchase_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_posted_by_id_fkey" FOREIGN KEY ("posted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "supplier_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_entered_unit_id_fkey" FOREIGN KEY ("entered_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_documents" ADD CONSTRAINT "opening_documents_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_documents" ADD CONSTRAINT "opening_documents_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_documents" ADD CONSTRAINT "opening_documents_posted_by_id_fkey" FOREIGN KEY ("posted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_lines" ADD CONSTRAINT "opening_lines_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "opening_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_lines" ADD CONSTRAINT "opening_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_lines" ADD CONSTRAINT "opening_lines_entered_unit_id_fkey" FOREIGN KEY ("entered_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_lines" ADD CONSTRAINT "opening_lines_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_source_branch_id_fkey" FOREIGN KEY ("source_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_dest_branch_id_fkey" FOREIGN KEY ("dest_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_dispatched_by_id_fkey" FOREIGN KEY ("dispatched_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_discrepancy_approved_by_id_fkey" FOREIGN KEY ("discrepancy_approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_dispatch_movement_id_fkey" FOREIGN KEY ("dispatch_movement_id") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_receipts" ADD CONSTRAINT "transfer_receipts_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "stock_transfer_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_receipts" ADD CONSTRAINT "transfer_receipts_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_receipts" ADD CONSTRAINT "transfer_receipts_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_counter_id_fkey" FOREIGN KEY ("counter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_finalized_by_id_fkey" FOREIGN KEY ("finalized_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "stock_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_adjustment_movement_id_fkey" FOREIGN KEY ("adjustment_movement_id") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_records_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_records_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_records" ADD CONSTRAINT "waste_records_posted_by_id_fkey" FOREIGN KEY ("posted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_lines" ADD CONSTRAINT "waste_lines_waste_id_fkey" FOREIGN KEY ("waste_id") REFERENCES "waste_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_lines" ADD CONSTRAINT "waste_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_lines" ADD CONSTRAINT "waste_lines_entered_unit_id_fkey" FOREIGN KEY ("entered_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_lines" ADD CONSTRAINT "waste_lines_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_posted_by_id_fkey" FOREIGN KEY ("posted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_lines" ADD CONSTRAINT "usage_lines_usage_id_fkey" FOREIGN KEY ("usage_id") REFERENCES "usage_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_lines" ADD CONSTRAINT "usage_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_lines" ADD CONSTRAINT "usage_lines_entered_unit_id_fkey" FOREIGN KEY ("entered_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_lines" ADD CONSTRAINT "usage_lines_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparation_recipes" ADD CONSTRAINT "preparation_recipes_output_item_id_fkey" FOREIGN KEY ("output_item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparation_recipes" ADD CONSTRAINT "preparation_recipes_output_unit_id_fkey" FOREIGN KEY ("output_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparation_lines" ADD CONSTRAINT "preparation_lines_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "preparation_recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparation_lines" ADD CONSTRAINT "preparation_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparation_lines" ADD CONSTRAINT "preparation_lines_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparation_batches" ADD CONSTRAINT "preparation_batches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparation_batches" ADD CONSTRAINT "preparation_batches_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "preparation_recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparation_batches" ADD CONSTRAINT "preparation_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparation_batches" ADD CONSTRAINT "preparation_batches_posted_by_id_fkey" FOREIGN KEY ("posted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparation_batches" ADD CONSTRAINT "preparation_batches_output_unit_id_fkey" FOREIGN KEY ("output_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_variants" ADD CONSTRAINT "menu_variants_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_revisions" ADD CONSTRAINT "recipe_revisions_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_revisions" ADD CONSTRAINT "recipe_revisions_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "menu_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_revisions" ADD CONSTRAINT "recipe_revisions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "recipe_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_batches" ADD CONSTRAINT "sales_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_import_rows" ADD CONSTRAINT "sale_import_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "sales_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "menu_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_recipe_revision_id_fkey" FOREIGN KEY ("recipe_revision_id") REFERENCES "recipe_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ledger integrity. Stock movements are append-only. The balance row is a cache
-- maintained in the same transaction as the insert.

ALTER TABLE "branch_item_costs" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_nonzero_qty" CHECK ("quantity_delta" <> 0);

ALTER TABLE "items"
  ADD CONSTRAINT "items_positive_factor" CHECK ("purchase_to_base_factor" > 0);

ALTER TABLE "recipe_lines"
  ADD CONSTRAINT "recipe_lines_positive_yield" CHECK ("yield_factor" > 0);

ALTER TABLE "preparation_lines"
  ADD CONSTRAINT "preparation_lines_positive_yield" CHECK ("yield_factor" > 0);

CREATE UNIQUE INDEX "recipe_revisions_version_uidx"
  ON "recipe_revisions" (
    "menu_item_id",
    COALESCE("variant_id", '00000000-0000-0000-0000-000000000000'::uuid),
    "version"
  );

CREATE OR REPLACE FUNCTION prevent_stock_movement_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements are immutable';
END;
$$;

CREATE TRIGGER stock_movements_immutable
BEFORE UPDATE OR DELETE ON stock_movements
FOR EACH ROW
EXECUTE FUNCTION prevent_stock_movement_mutation();

CREATE OR REPLACE FUNCTION apply_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO inventory_balances (branch_id, item_id, quantity, updated_at)
  VALUES (NEW.branch_id, NEW.item_id, NEW.quantity_delta, NOW())
  ON CONFLICT (branch_id, item_id)
  DO UPDATE SET
    quantity = inventory_balances.quantity + EXCLUDED.quantity,
    updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER stock_movements_apply_balance
AFTER INSERT ON stock_movements
FOR EACH ROW
EXECUTE FUNCTION apply_stock_movement();
