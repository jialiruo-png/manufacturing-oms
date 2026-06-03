ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

UPDATE "Customer"
SET "salespersonId" = "User"."id"
FROM "User"
WHERE "Customer"."salespersonId" IS NULL
  AND "Customer"."salespersonName" = "User"."name"
  AND "User"."deletedAt" IS NULL;
