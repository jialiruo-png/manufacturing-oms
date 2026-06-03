-- Clear existing orphan customer owner references before adding the foreign key.
-- Also remove the legacy owner name fallback to avoid granting access by name
-- after salespersonId becomes NULL.
UPDATE "Customer" AS c
SET
  "salespersonId" = NULL,
  "salespersonName" = '[已删除业务员]'
WHERE c."salespersonId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "User" AS u
    WHERE u."id" = c."salespersonId"
  );

ALTER TABLE "Customer"
ADD CONSTRAINT "Customer_salespersonId_fkey"
FOREIGN KEY ("salespersonId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Normalize any legacy negative inventory before enforcing the database invariant.
UPDATE "Inventory"
SET "quantity" = 0
WHERE "quantity" < 0;

ALTER TABLE "Inventory"
ADD CONSTRAINT "Inventory_quantity_nonnegative_check"
CHECK ("quantity" >= 0);
