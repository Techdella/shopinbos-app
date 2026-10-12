-- Products a seller set to "Live" in the product form were saved as status 'active', but storefronts, checkout and
-- the public API only sell 'published' products, so those products never showed to shoppers. The form and API now
-- save 'published' (and read 'active' as Live). This moves rows saved the old way. No schema change; safe to run
-- more than once.

UPDATE "StoreProduct" SET "status" = 'published', "updatedAt" = now() WHERE "status" = 'active';
