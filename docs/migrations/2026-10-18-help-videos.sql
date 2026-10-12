-- One-minute help videos (Help → "Watch a 1-minute video") and the admin catalogue at /admin/help-videos.
-- Additive only. Safe to run more than once. Before this runs, Help simply doesn't offer a video, and
-- /admin/help-videos says the update is needed.

CREATE TABLE IF NOT EXISTS "HelpVideo" (
  "id" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "roles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "language" TEXT NOT NULL DEFAULT 'en',
  "videoUrl" TEXT,
  "posterUrl" TEXT,
  "durationSeconds" INTEGER,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HelpVideo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "HelpVideo_topic_language_key" ON "HelpVideo"("topic", "language");
CREATE INDEX IF NOT EXISTS "HelpVideo_published_topic_idx" ON "HelpVideo"("published", "topic");

-- The app reads and writes through Prisma (table owner); nothing reaches this table with the anon key.
ALTER TABLE "HelpVideo" ENABLE ROW LEVEL SECURITY;

-- Draft (unpublished) English entries for every topic, so the owner only has to upload each video and publish.
-- Same list as HELP_TOPICS in shared/help-videos.ts. Existing rows are never changed.
INSERT INTO "HelpVideo" ("id", "topic", "title", "roles", "language", "published") VALUES
  ('helpvid_start_shop_en',         'start_shop',         'Set up your shop in a minute',        ARRAY['seller'],                        'en', false),
  ('helpvid_add_product_en',        'add_product',        'Add a product',                       ARRAY['seller'],                        'en', false),
  ('helpvid_record_sale_en',        'record_sale',        'Record a sale',                       ARRAY['seller'],                        'en', false),
  ('helpvid_orders_en',             'orders',             'Send an order to your customer',      ARRAY['seller'],                        'en', false),
  ('helpvid_get_paid_en',           'get_paid',           'How you get paid',                    ARRAY['seller','supplier','logistics_partner'], 'en', false),
  ('helpvid_web_address_en',        'web_address',        'Your shop''s web address',            ARRAY['seller'],                        'en', false),
  ('helpvid_delivery_en',           'delivery',           'Get orders delivered',                ARRAY['seller'],                        'en', false),
  ('helpvid_whatsapp_en',           'whatsapp',           'Sell on WhatsApp',                    ARRAY['seller'],                        'en', false),
  ('helpvid_get_customers_en',      'get_customers',      'Get more customers with an advert',   ARRAY['seller'],                        'en', false),
  ('helpvid_sell_without_stock_en', 'sell_without_stock', 'Sell without stock',                  ARRAY['seller'],                        'en', false),
  ('helpvid_supplier_products_en',  'supplier_products',  'Add your products for shops to sell', ARRAY['supplier'],                      'en', false),
  ('helpvid_supplier_orders_en',    'supplier_orders',    'Handle orders from shops',            ARRAY['supplier'],                      'en', false),
  ('helpvid_partner_jobs_en',       'partner_jobs',       'Take delivery jobs',                  ARRAY['logistics_partner'],             'en', false),
  ('helpvid_rider_flow_en',         'rider_flow',         'Pick up and drop off as a rider',     ARRAY['logistics_partner','rider'],     'en', false)
ON CONFLICT ("topic", "language") DO NOTHING;

-- Storage: uploads go to the public media bucket under platform/help-videos/ (the browser sends the file
-- straight to Storage with a one-time signed upload URL the server makes with the service role, because Vercel
-- functions can't take a 50 MB request body). The bucket's per-file limit was 10 MB (checked in
-- storage.buckets), which would block 50 MB videos, so it is raised to 50 MB here. Only runs where the Supabase
-- storage schema exists (not on a plain local Postgres), and never lowers a larger limit.
-- NOTE FOR THE OWNER: this limit is bucket-wide, so signed-in browser uploads under products/ may now also be up
-- to 50 MB (the app's own checks still apply). If you'd rather not, skip this block and paste YouTube or Vimeo
-- links for help videos instead (the admin page supports both).
DO $$ BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    UPDATE storage.buckets
       SET file_size_limit = 52428800
     WHERE id = 'shopinbos-media'
       AND file_size_limit IS NOT NULL
       AND file_size_limit < 52428800;
  END IF;
END $$;
