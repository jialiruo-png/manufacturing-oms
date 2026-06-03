ALTER TABLE "Order" ADD COLUMN "orderDate" TIMESTAMP(3);

ALTER TABLE "OrderItem" ADD COLUMN "detailRequirement" TEXT NOT NULL DEFAULT '';
ALTER TABLE "OrderItem" ADD COLUMN "sourceRowNo" TEXT NOT NULL DEFAULT '';
ALTER TABLE "OrderItem" ADD COLUMN "ctnCount" INTEGER;
ALTER TABLE "OrderItem" ADD COLUMN "qtyPerCtn" INTEGER;
ALTER TABLE "OrderItem" ADD COLUMN "ctnVolume" DOUBLE PRECISION;
ALTER TABLE "OrderItem" ADD COLUMN "totalVolume" DOUBLE PRECISION;
ALTER TABLE "OrderItem" ADD COLUMN "ctnWeight" DOUBLE PRECISION;
ALTER TABLE "OrderItem" ADD COLUMN "totalWeight" DOUBLE PRECISION;

ALTER TABLE "Material" ADD COLUMN "orderItemId" INTEGER;
ALTER TABLE "Material" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'bom';

UPDATE "OrderItem"
SET "detailRequirement" = SUBSTRING("productName" FROM '\((.+)\)')
WHERE "detailRequirement" = '' AND "productName" LIKE '%(%)%';

UPDATE "OrderItem"
SET "detailRequirement" = SUBSTRING("productName" FROM '（(.+)）')
WHERE "detailRequirement" = '' AND "productName" LIKE '%（%）%';

UPDATE "OrderItem"
SET "productName" = TRIM(REGEXP_REPLACE("productName", '\(.+\)$', ''))
WHERE "productName" LIKE '%(%)%' AND "detailRequirement" != '';

UPDATE "OrderItem"
SET "productName" = TRIM(REGEXP_REPLACE("productName", '（.+）$', ''))
WHERE "productName" LIKE '%（%）%' AND "detailRequirement" != '';

ALTER TABLE "Material" ADD CONSTRAINT "Material_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Material_orderItemId_idx" ON "Material"("orderItemId");
