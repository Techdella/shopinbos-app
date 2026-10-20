-- Admin team roles (Admin › Team, src/lib/admin-team). Null means owner, so existing admins keep full access.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "adminRole" TEXT;
