ALTER TABLE "Order" ADD COLUMN "salespersonId" INTEGER;
ALTER TABLE "Order" ADD COLUMN "salespersonName" TEXT NOT NULL DEFAULT '';

UPDATE "Order"
SET "salespersonName" = COALESCE(NULLIF("createdBy", ''), '')
WHERE "salespersonName" = '';

CREATE INDEX "Order_salespersonId_createdAt_idx" ON "Order"("salespersonId", "createdAt");
CREATE INDEX "Order_salespersonId_status_createdAt_idx" ON "Order"("salespersonId", "status", "createdAt");

ALTER TABLE "Order" ADD CONSTRAINT "Order_salespersonId_fkey"
  FOREIGN KEY ("salespersonId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
