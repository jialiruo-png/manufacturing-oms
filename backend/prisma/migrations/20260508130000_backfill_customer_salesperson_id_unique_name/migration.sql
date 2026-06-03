-- Backfill legacy customers that only stored a salesperson name.
-- A name is considered safe only when it maps to exactly one active sales user.
WITH unique_sales_users AS (
  SELECT MIN("id") AS "id", "name"
  FROM "User"
  WHERE "role" = 'sales'
    AND "status" = 'enabled'
    AND "deletedAt" IS NULL
  GROUP BY "name"
  HAVING COUNT(*) = 1
)
UPDATE "Customer" AS c
SET "salespersonId" = u."id"
FROM unique_sales_users AS u
WHERE c."salespersonId" IS NULL
  AND c."salespersonName" = u."name";
