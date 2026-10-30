-- Turning pilot features on (shared/feature-switches.ts, src/lib/feature-switches.server.ts, Admin › Pilot features).
-- Pilot features ship in the code but stay OFF for everyone until the team turns them on for the shops, apps, areas
-- and people taking part. The apps ask GET /api/app/features when they open and when they come back to the front.
--
--   * "FeatureSwitch":    one row per feature. enabled = the master switch; killed = the per-feature kill switch (off
--                         for everyone at once, wins over everything); apps = which apps it may show on (business_android,
--                         business_ios, business_web, plug_android, plug_ios; empty = none); minVersions = the oldest app
--                         version that may show it, per app ({"business_ios":"1.0.3"}); everyone = on for every account
--                         on those apps, else only for the targets below and invite holders.
--   * "FeatureTarget":    who a feature is on for: a shop (kind store, value Store.id), a supplier (Supplier.id), a user
--                         (User.id) or a pilot area (PilotArea.id).
--   * "PilotArea":        a named area ("Yaba–Surulere pilot"): places = [{ "state": "Lagos", "city"?: …, "area"?: … }].
--   * "FeatureInvite":    a code that turns a set of features on for each person who redeems it (pilot creators and
--                         customers), with an optional use limit and expiry. "FeatureInviteUse": who redeemed which.
--   * "FeatureSwitchLog": every change in Admin › Pilot features: who, when, what (before and after).
-- The global "Kill all pilot features" switch is PlatformSetting "features.kill_all" ({ "killed": true }).
--
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it (until then every feature
-- simply stays off: the code fails closed).

CREATE TABLE IF NOT EXISTS "FeatureSwitch" (
  "key" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "killed" BOOLEAN NOT NULL DEFAULT false,
  "everyone" BOOLEAN NOT NULL DEFAULT false,
  "apps" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "minVersions" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" TEXT
);

CREATE TABLE IF NOT EXISTS "FeatureTarget" (
  "id" TEXT PRIMARY KEY,
  "featureKey" TEXT NOT NULL REFERENCES "FeatureSwitch"("key") ON DELETE CASCADE ON UPDATE CASCADE,
  "kind" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "label" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "FeatureTarget_featureKey_kind_value_key" ON "FeatureTarget" ("featureKey", "kind", "value");
CREATE INDEX IF NOT EXISTS "FeatureTarget_kind_value_idx" ON "FeatureTarget" ("kind", "value");

CREATE TABLE IF NOT EXISTS "PilotArea" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "places" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT
);

CREATE TABLE IF NOT EXISTS "FeatureInvite" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL,
  "note" TEXT,
  "features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "maxUses" INTEGER,
  "uses" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3),
  "disabled" BOOLEAN NOT NULL DEFAULT false,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "FeatureInvite_code_key" ON "FeatureInvite" ("code");

CREATE TABLE IF NOT EXISTS "FeatureInviteUse" (
  "id" TEXT PRIMARY KEY,
  "inviteId" TEXT NOT NULL REFERENCES "FeatureInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "FeatureInviteUse_inviteId_userId_key" ON "FeatureInviteUse" ("inviteId", "userId");
CREATE INDEX IF NOT EXISTS "FeatureInviteUse_userId_idx" ON "FeatureInviteUse" ("userId");

CREATE TABLE IF NOT EXISTS "FeatureSwitchLog" (
  "id" TEXT PRIMARY KEY,
  "featureKey" TEXT,
  "action" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "FeatureSwitchLog_createdAt_idx" ON "FeatureSwitchLog" ("createdAt");
CREATE INDEX IF NOT EXISTS "FeatureSwitchLog_featureKey_createdAt_idx" ON "FeatureSwitchLog" ("featureKey", "createdAt");

-- Server-only tables (Prisma connects as the owner); nothing reads them with the Supabase anon key.
ALTER TABLE "FeatureSwitch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeatureTarget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PilotArea" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeatureInvite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeatureInviteUse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeatureSwitchLog" ENABLE ROW LEVEL SECURITY;

-- The first pilot features, all off (keep in step with FEATURES in shared/feature-switches.ts).
INSERT INTO "FeatureSwitch" ("key", "name", "description") VALUES
  ('post_to_plug', 'Post to Plug', 'Shops post videos to Shopinbos Plug.'),
  ('resell', 'Resell', 'Creators and shops resell other shops'' products for a commission.'),
  ('creator_briefs', 'Creator briefs', 'Shops send briefs to creators to make videos for them.'),
  ('notify_followers', 'Notify followers', 'Shops send a message to the people who follow them.'),
  ('group_buy', 'Group buy', 'Customers buy together for a lower price.'),
  ('ajo', 'Ajo', 'Customers save towards a product in rounds (ajo / esusu).'),
  ('pay_small_small', 'Pay small small', 'Customers pay for an order in parts.'),
  ('personal_shopper', 'Personal shopper', 'Customers ask a shopper to find and buy for them.'),
  ('live', 'Live selling', 'Shops sell on live video.'),
  ('rex_studio_creators', 'Rex Studio for creators', 'Creators make videos in Rex Studio.'),
  ('plug_follow_card', 'Plug follow card', 'The "Follow us on Shopinbos Plug" line on the shop share card.')
ON CONFLICT ("key") DO NOTHING;
