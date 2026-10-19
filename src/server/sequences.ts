import { AppError } from "@/server/errors";
import type { Tx } from "@/server/db";

export async function nextNumber(tx: Tx, prefix: string): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ value: number }>>`
    INSERT INTO number_sequences (name, value)
    VALUES (${prefix}, 1)
    ON CONFLICT (name)
    DO UPDATE SET value = number_sequences.value + 1
    RETURNING value
  `;
  const value = rows[0]?.value;
  if (!value) throw new AppError("Could not allocate a document number.", "SEQUENCE", 500);
  return `${prefix}-${String(value).padStart(6, "0")}`;
}
