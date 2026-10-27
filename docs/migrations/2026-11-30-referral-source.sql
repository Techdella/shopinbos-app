-- Profile referrals: suppliers and delivery partners share their public profile with their invite code on it
-- (app.shopinbos.com/suppliers/<slug>?ref=CODE). Each referral now says where it came from: "link" (an invite link,
-- /r/CODE) or "profile". Additive only: one new column with a default, so existing rows read as "link". Safe to run
-- more than once.

ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'link';
