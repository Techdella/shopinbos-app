-- Per-person app preferences: menu items switched off in "Customise your menu", walkthrough progress.
-- Additive: one column with a default.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferences" JSONB NOT NULL DEFAULT '{}';
