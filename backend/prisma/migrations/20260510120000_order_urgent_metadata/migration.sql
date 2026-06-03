ALTER TABLE "Order" ADD COLUMN "urgentSource" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Order" ADD COLUMN "urgentReason" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Order" ADD COLUMN "urgentConfirmed" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Order"
SET "urgentSource" = '业务员标记'
WHERE "urgent" = true
  AND "urgentSource" = '';
