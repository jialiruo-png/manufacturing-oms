ALTER TABLE "User" ADD COLUMN "managerSubRole" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN "canApproveOrder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "canManageUsers" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "isClerk" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "canCreateOrderForSales" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User"
SET
  "managerSubRole" = 'system_admin',
  "canApproveOrder" = true,
  "canManageUsers" = true,
  "isClerk" = false,
  "canCreateOrderForSales" = true
WHERE ("role" = 'admin' OR "isAdmin" = true)
  AND "managerSubRole" = '';

UPDATE "User"
SET
  "isAdmin" = true,
  "canApproveOrder" = true,
  "canManageUsers" = true,
  "isClerk" = false,
  "canCreateOrderForSales" = true
WHERE "role" = 'manager'
  AND "managerSubRole" = 'system_admin'
  AND "deletedAt" IS NULL;

UPDATE "User"
SET
  "managerSubRole" = 'approval_manager',
  "canApproveOrder" = true,
  "canManageUsers" = false,
  "isClerk" = false,
  "canCreateOrderForSales" = false
WHERE "role" = 'manager'
  AND "isAdmin" = false
  AND "deletedAt" IS NULL
  AND "managerSubRole" = '';

CREATE INDEX "User_managerSubRole_status_deletedAt_idx"
ON "User"("managerSubRole", "status", "deletedAt");
