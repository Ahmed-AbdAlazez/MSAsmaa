-- Add recovery contact and one-time password-reset state without changing
-- existing student-code authentication or existing user records.
ALTER TABLE "users"
  ADD COLUMN "email" TEXT,
  ADD COLUMN "reset_password_token" TEXT,
  ADD COLUMN "reset_password_expires" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
