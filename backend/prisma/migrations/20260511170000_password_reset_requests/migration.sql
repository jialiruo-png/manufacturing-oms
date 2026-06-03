CREATE TABLE "PasswordResetRequest" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER,
  "identifier" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedBy" INTEGER,

  CONSTRAINT "PasswordResetRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PasswordResetRequest_status_requestedAt_idx" ON "PasswordResetRequest"("status", "requestedAt");
CREATE INDEX "PasswordResetRequest_userId_status_idx" ON "PasswordResetRequest"("userId", "status");

ALTER TABLE "PasswordResetRequest"
  ADD CONSTRAINT "PasswordResetRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
