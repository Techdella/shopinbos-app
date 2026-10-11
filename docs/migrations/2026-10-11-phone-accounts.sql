-- Accounts created with a phone number (WhatsApp/SMS code) have no email address.
-- Additive and safe to run on the live database: existing rows keep their emails, and the
-- unique index on "User"."email" still applies to non-null values (Postgres allows many NULLs).
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
