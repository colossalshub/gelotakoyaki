-- DropIndex
DROP INDEX "sale_import_rows_batch_id_external_id_key";

-- AlterTable
ALTER TABLE "branch_item_costs" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "sale_import_rows_batch_id_external_id_idx" ON "sale_import_rows"("batch_id", "external_id");
