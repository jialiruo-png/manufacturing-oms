DROP INDEX IF EXISTS "User_phone_key";

CREATE UNIQUE INDEX "User_phone_active_key" ON "User"("phone") WHERE "deletedAt" IS NULL;
