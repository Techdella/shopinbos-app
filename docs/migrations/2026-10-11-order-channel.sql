-- Where each storefront order came from (WhatsApp, Instagram, Facebook, TikTok, email, online store).
-- Additive and safe on the live database: existing orders keep NULL ("not recorded").
ALTER TABLE "RetailOrder" ADD COLUMN IF NOT EXISTS "channel" TEXT;
