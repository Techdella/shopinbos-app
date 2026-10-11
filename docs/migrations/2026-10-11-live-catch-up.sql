-- APPLIED to Supabase project "shopinbos" (zdnwdkykcqaarlpwqjow) on 2026-10-11 as migration
-- catch_up_to_prisma_schema_2026_10_11. Supersedes 2026-10-10-schema-alignment.sql and
-- 2026-10-11-campaigns-and-payment-receipts.sql for that database.
--
-- Generated with `prisma migrate diff` against a mirror of the live schema, then filtered to keep it
-- safe for the code already running in production: column defaults and timestamptz columns are left
-- as they are (raw SQL inserts rely on them), existing foreign keys keep their delete behaviour, and
-- no table or column is dropped. The only drop is the superseded NotificationPreference(userId, eventKey)
-- unique constraint (table was empty), replaced by (userId, eventKey, category).
-- Rehearsed in a single transaction on the mirror; all 55 Prisma models were readable afterwards.

CREATE TYPE "ProductVisibility" AS ENUM ('hidden', 'storefront', 'featured', 'collection_only');

CREATE TYPE "SalesChannel" AS ENUM ('website', 'instagram', 'whatsapp', 'marketplace', 'all');

CREATE TYPE "InventoryType" AS ENUM ('seller', 'dropshipping', 'source_on_demand', 'print_on_demand', 'digital');

CREATE TYPE "ProductSourceType" AS ENUM ('imported', 'local', 'supplier', 'dropship', 'seller', 'manufactured', 'digital');

CREATE TYPE "ShippingType" AS ENUM ('flat_rate', 'weight_based', 'zone_based', 'free_shipping', 'conditional', 'distance_based', 'hybrid');

CREATE TYPE "CheckoutLayout" AS ENUM ('single_page', 'multi_step', 'accordion', 'minimal', 'express', 'mobile');

CREATE TYPE "ProductPageVariant" AS ENUM ('shopify', 'amazon', 'luxury', 'minimal', 'marketplace', 'fashion', 'mobile_first');

CREATE TYPE "NotificationPriority" AS ENUM ('critical', 'warning', 'info', 'success');

CREATE TYPE "NotificationChannel" AS ENUM ('in_app', 'email', 'sms', 'whatsapp', 'push', 'browser');

CREATE TYPE "DigestFrequency" AS ENUM ('immediate', 'hourly', 'daily', 'weekly', 'disabled');

CREATE TYPE "SubscriberSource" AS ENUM ('newsletter_form', 'checkout_optin', 'customer_account', 'lead_magnet', 'popup', 'landing_page', 'manual_import', 'csv_upload', 'api', 'order');

CREATE TYPE "SubscriberStatus" AS ENUM ('active', 'unsubscribed', 'bounced', 'spam');

CREATE TYPE "FormType" AS ENUM ('newsletter', 'contact', 'lead', 'custom', 'request_quote', 'waitlist', 'product_inquiry', 'wholesale_inquiry', 'support', 'popup');

ALTER TYPE "AutomationActionType" ADD VALUE 'add_segment';

ALTER TYPE "AutomationTrigger" ADD VALUE 'welcome_email';

ALTER TYPE "AutomationTrigger" ADD VALUE 'post_purchase';

ALTER TYPE "AutomationTrigger" ADD VALUE 'review_request';

ALTER TYPE "AutomationTrigger" ADD VALUE 'win_back';

ALTER TYPE "AutomationTrigger" ADD VALUE 'birthday';

ALTER TYPE "AutomationTrigger" ADD VALUE 'low_stock';

ALTER TYPE "NotificationType" ADD VALUE 'inventory';

ALTER TYPE "NotificationType" ADD VALUE 'logistics';

ALTER TYPE "NotificationType" ADD VALUE 'products';

ALTER TYPE "NotificationType" ADD VALUE 'customers';

ALTER TYPE "NotificationType" ADD VALUE 'suppliers';

ALTER TYPE "NotificationType" ADD VALUE 'store_builder';

ALTER TYPE "NotificationType" ADD VALUE 'marketing';

ALTER TYPE "NotificationType" ADD VALUE 'rexai';

ALTER TYPE "NotificationType" ADD VALUE 'checkout';

ALTER TYPE "NotificationType" ADD VALUE 'category';

ALTER TYPE "NotificationType" ADD VALUE 'health';

ALTER TYPE "NotificationType" ADD VALUE 'activity';

ALTER TYPE "NotificationType" ADD VALUE 'dropshipping';

ALTER TYPE "RetailOrderStatus" ADD VALUE 'awaiting_payment';

ALTER TYPE "RetailOrderStatus" ADD VALUE 'packed';

ALTER TYPE "RetailOrderStatus" ADD VALUE 'returned';

ALTER TYPE "RetailOrderStatus" ADD VALUE 'partially_refunded';

ALTER TABLE "NotificationPreference" DROP CONSTRAINT "NotificationPreference_userId_eventKey_key";

ALTER TABLE "AbandonedCartEvent" ALTER COLUMN "email" SET NOT NULL;

ALTER TABLE "AutomationRule" ADD COLUMN     "delayMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastTriggeredAt" TIMESTAMP(3);

ALTER TABLE "BroadcastCampaign" ADD COLUMN     "bounceCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "campaignType" TEXT NOT NULL DEFAULT 'newsletter',
ADD COLUMN     "conversionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deliveredCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "preheader" TEXT,
ADD COLUMN     "replyTo" TEXT,
ADD COLUMN     "revenueGenerated" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "segmentId" TEXT,
ADD COLUMN     "senderEmail" TEXT,
ADD COLUMN     "senderName" TEXT,
ADD COLUMN     "unsubscribeCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Coupon" ALTER COLUMN "usedCount" SET NOT NULL,
ALTER COLUMN "status" SET NOT NULL;

ALTER TABLE "Discount" ALTER COLUMN "usedCount" SET NOT NULL,
ALTER COLUMN "status" SET NOT NULL;

ALTER TABLE "LogisticsPartner" ADD COLUMN     "verificationDocuments" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "Notification" ADD COLUMN     "actionLabel" TEXT,
ADD COLUMN     "actionUrl" TEXT,
ADD COLUMN     "channel" "NotificationChannel" NOT NULL DEFAULT 'in_app',
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "metadata" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "priority" "NotificationPriority" NOT NULL DEFAULT 'info',
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "scheduledFor" TIMESTAMP(3);

ALTER TABLE "NotificationPreference" ADD COLUMN     "browser" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "category" "NotificationType" NOT NULL,
ADD COLUMN     "digestFrequency" "DigestFrequency" NOT NULL DEFAULT 'immediate',
ADD COLUMN     "push" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whatsapp" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ProductReview" ALTER COLUMN "title" SET NOT NULL,
ALTER COLUMN "body" SET NOT NULL,
ALTER COLUMN "status" SET NOT NULL,
ALTER COLUMN "createdAt" SET NOT NULL,
ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "RetailOrder" ADD COLUMN     "campaignToken" TEXT,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "logisticsDetails" JSONB,
ADD COLUMN     "shippedAt" TIMESTAMP(3),
ADD COLUMN     "trackingCode" TEXT,
ALTER COLUMN "subtotal" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "shippingFee" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "total" SET DATA TYPE DOUBLE PRECISION;

ALTER TABLE "StockMovement" ALTER COLUMN "type" SET NOT NULL,
ALTER COLUMN "note" SET NOT NULL,
ALTER COLUMN "createdAt" SET NOT NULL;

ALTER TABLE "StorePage" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "draftContent" JSONB,
ADD COLUMN     "publishAt" TIMESTAMP(3),
ADD COLUMN     "publishedContent" JSONB,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'draft';

ALTER TABLE "StoreProduct" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "careInstructions" TEXT,
ADD COLUMN     "compareAtPrice" DOUBLE PRECISION,
ADD COLUMN     "currentStock" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "damagedStock" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "descriptionBuilder" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "dimensions" JSONB,
ADD COLUMN     "enabledModules" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "faqs" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "has360View" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "incomingStock" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "inventoryType" "InventoryType" NOT NULL DEFAULT 'seller',
ADD COLUMN     "longDescription" TEXT,
ADD COLUMN     "lowStockThreshold" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "marketingCopy" TEXT,
ADD COLUMN     "pageLayout" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "pageVariant" "ProductPageVariant" NOT NULL DEFAULT 'shopify',
ADD COLUMN     "reservedStock" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "returnPolicy" TEXT,
ADD COLUMN     "salesChannel" "SalesChannel" NOT NULL DEFAULT 'website',
ADD COLUMN     "seoDescription" TEXT,
ADD COLUMN     "seoTitle" TEXT,
ADD COLUMN     "shippingInfo" TEXT,
ADD COLUMN     "socialMediaCopy" TEXT,
ADD COLUMN     "soldStock" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sourceType" "ProductSourceType",
ADD COLUMN     "specifications" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "supplierLastSync" TIMESTAMP(3),
ADD COLUMN     "supplierStock" INTEGER DEFAULT 0,
ADD COLUMN     "supportInfo" TEXT,
ADD COLUMN     "tags" TEXT[],
ADD COLUMN     "videoUrl" TEXT,
ADD COLUMN     "visibility" "ProductVisibility" NOT NULL DEFAULT 'hidden',
ADD COLUMN     "warranty" TEXT,
ADD COLUMN     "weight" DOUBLE PRECISION,
ADD COLUMN     "weightUnit" TEXT NOT NULL DEFAULT 'kg';

CREATE TABLE "store_launch_payments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "payment_option" TEXT NOT NULL,
    "total_amount" INTEGER NOT NULL,
    "amount_due" INTEGER NOT NULL,
    "amount_paid" INTEGER NOT NULL DEFAULT 0,
    "balance_due" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" TEXT NOT NULL DEFAULT 'initialized',
    "due_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "provider_response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "store_launch_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "onboarding_responses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT,
    "account_type" TEXT,
    "question_key" TEXT NOT NULL,
    "answer" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'rex',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "onboarding_responses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "type" TEXT NOT NULL DEFAULT 'manual',
    "rules" JSONB NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollectionProduct" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollectionProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShippingZone" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ShippingType" NOT NULL DEFAULT 'flat_rate',
    "regions" TEXT[],
    "rates" JSONB NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShippingZone_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CheckoutConfig" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "layout" "CheckoutLayout" NOT NULL DEFAULT 'multi_step',
    "enabledModules" TEXT[] DEFAULT ARRAY['customer_details', 'shipping_address', 'delivery_method', 'payment_method', 'order_summary']::TEXT[],
    "moduleOrder" TEXT[] DEFAULT ARRAY['customer_details', 'shipping_address', 'delivery_method', 'coupon', 'order_notes', 'payment_method', 'order_summary']::TEXT[],
    "requirePhone" BOOLEAN NOT NULL DEFAULT false,
    "enableNotes" BOOLEAN NOT NULL DEFAULT true,
    "enableGiftNote" BOOLEAN NOT NULL DEFAULT false,
    "enableCoupon" BOOLEAN NOT NULL DEFAULT true,
    "enableUpsells" BOOLEAN NOT NULL DEFAULT false,
    "enableTrustBadges" BOOLEAN NOT NULL DEFAULT true,
    "upsellProducts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CheckoutConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductPageTemplate" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "variant" "ProductPageVariant" NOT NULL DEFAULT 'shopify',
    "config" JSONB NOT NULL DEFAULT '{}',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductPageTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductSource" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sourceType" "ProductSourceType" NOT NULL,
    "sourceId" TEXT,
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "importedFrom" TEXT,
    "supplierSku" TEXT,
    "supplierPrice" DOUBLE PRECISION,
    "leadTime" TEXT,
    "moq" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SmartAlertRule" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger" TEXT NOT NULL,
    "condition" JSONB NOT NULL DEFAULT '{}',
    "actionType" TEXT NOT NULL DEFAULT 'notification',
    "actionConfig" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SmartAlertRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoreHealthSnapshot" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "factors" JSONB NOT NULL DEFAULT '{}',
    "recommendations" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreHealthSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Subscriber" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "country" TEXT,
    "source" "SubscriberSource" NOT NULL DEFAULT 'newsletter_form',
    "status" "SubscriberStatus" NOT NULL DEFAULT 'active',
    "tags" TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "lastOpenedAt" TIMESTAMP(3),
    "lastClickedAt" TIMESTAMP(3),
    "lastPurchasedAt" TIMESTAMP(3),
    "totalSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Subscriber_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerSegment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'manual',
    "rules" JSONB NOT NULL DEFAULT '{}',
    "subscriberCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerSegment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoreForm" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" "FormType" NOT NULL DEFAULT 'contact',
    "name" TEXT NOT NULL,
    "fields" JSONB NOT NULL DEFAULT '[]',
    "design" JSONB NOT NULL DEFAULT '{}',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "isPopup" BOOLEAN NOT NULL DEFAULT false,
    "popupConfig" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreForm_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LiveChatConfig" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'contact_form',
    "whatsappNumber" TEXT,
    "whatsappGreeting" TEXT DEFAULT 'Hello! How can we help you today?',
    "whatsappPosition" TEXT NOT NULL DEFAULT 'right',
    "whatsappColor" TEXT NOT NULL DEFAULT '#25D366',
    "showOnMobile" BOOLEAN NOT NULL DEFAULT true,
    "showOnDesktop" BOOLEAN NOT NULL DEFAULT true,
    "businessHours" JSONB NOT NULL DEFAULT '{}',
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "customLink" TEXT,
    "widgetStyle" TEXT NOT NULL DEFAULT 'bubble',
    "greeting" TEXT DEFAULT 'Hi there! Need help?',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LiveChatConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AbandonedCartConfig" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "firstReminderAfter" INTEGER NOT NULL DEFAULT 60,
    "secondReminderAfter" INTEGER NOT NULL DEFAULT 1440,
    "thirdReminderAfter" INTEGER NOT NULL DEFAULT 4320,
    "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sendEmail" BOOLEAN NOT NULL DEFAULT true,
    "emailTemplateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AbandonedCartConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentReceipt" (
    "reference" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'paystack',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentReceipt_pkey" PRIMARY KEY ("reference")
);

CREATE TABLE "CampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "orderId" TEXT,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "store_launch_payments_reference_key" ON "store_launch_payments"("reference");

CREATE INDEX "store_launch_payments_store_id_idx" ON "store_launch_payments"("store_id");

CREATE INDEX "store_launch_payments_user_id_idx" ON "store_launch_payments"("user_id");

CREATE INDEX "onboarding_responses_user_id_idx" ON "onboarding_responses"("user_id");

CREATE UNIQUE INDEX "onboarding_responses_user_id_question_key_key" ON "onboarding_responses"("user_id", "question_key");

CREATE INDEX "Collection_storeId_idx" ON "Collection"("storeId");

CREATE UNIQUE INDEX "Collection_storeId_slug_key" ON "Collection"("storeId", "slug");

CREATE INDEX "CollectionProduct_collectionId_idx" ON "CollectionProduct"("collectionId");

CREATE INDEX "CollectionProduct_productId_idx" ON "CollectionProduct"("productId");

CREATE UNIQUE INDEX "CollectionProduct_collectionId_productId_key" ON "CollectionProduct"("collectionId", "productId");

CREATE INDEX "ShippingZone_storeId_idx" ON "ShippingZone"("storeId");

CREATE INDEX "ShippingZone_storeId_active_idx" ON "ShippingZone"("storeId", "active");

CREATE UNIQUE INDEX "CheckoutConfig_storeId_key" ON "CheckoutConfig"("storeId");

CREATE INDEX "ProductPageTemplate_storeId_idx" ON "ProductPageTemplate"("storeId");

CREATE INDEX "ProductSource_productId_idx" ON "ProductSource"("productId");

CREATE INDEX "ProductSource_sourceType_idx" ON "ProductSource"("sourceType");

CREATE INDEX "ActivityEvent_storeId_idx" ON "ActivityEvent"("storeId");

CREATE INDEX "ActivityEvent_storeId_createdAt_idx" ON "ActivityEvent"("storeId", "createdAt" DESC);

CREATE INDEX "ActivityEvent_userId_idx" ON "ActivityEvent"("userId");

CREATE INDEX "ActivityEvent_type_idx" ON "ActivityEvent"("type");

CREATE INDEX "SmartAlertRule_storeId_idx" ON "SmartAlertRule"("storeId");

CREATE INDEX "SmartAlertRule_storeId_active_idx" ON "SmartAlertRule"("storeId", "active");

CREATE INDEX "SmartAlertRule_trigger_idx" ON "SmartAlertRule"("trigger");

CREATE INDEX "StoreHealthSnapshot_storeId_idx" ON "StoreHealthSnapshot"("storeId");

CREATE INDEX "StoreHealthSnapshot_storeId_createdAt_idx" ON "StoreHealthSnapshot"("storeId", "createdAt" DESC);

CREATE INDEX "Subscriber_storeId_idx" ON "Subscriber"("storeId");

CREATE INDEX "Subscriber_storeId_status_idx" ON "Subscriber"("storeId", "status");

CREATE INDEX "Subscriber_storeId_createdAt_idx" ON "Subscriber"("storeId", "createdAt" DESC);

CREATE UNIQUE INDEX "Subscriber_storeId_email_key" ON "Subscriber"("storeId", "email");

CREATE INDEX "CustomerSegment_storeId_idx" ON "CustomerSegment"("storeId");

CREATE UNIQUE INDEX "CustomerSegment_storeId_name_key" ON "CustomerSegment"("storeId", "name");

CREATE INDEX "StoreForm_storeId_idx" ON "StoreForm"("storeId");

CREATE INDEX "StoreForm_storeId_active_idx" ON "StoreForm"("storeId", "active");

CREATE UNIQUE INDEX "LiveChatConfig_storeId_key" ON "LiveChatConfig"("storeId");

CREATE UNIQUE INDEX "AbandonedCartConfig_storeId_key" ON "AbandonedCartConfig"("storeId");

CREATE INDEX "PaymentReceipt_userId_idx" ON "PaymentReceipt"("userId");

CREATE UNIQUE INDEX "CampaignRecipient_token_key" ON "CampaignRecipient"("token");

CREATE INDEX "CampaignRecipient_storeId_idx" ON "CampaignRecipient"("storeId");

CREATE INDEX "CampaignRecipient_campaignId_status_idx" ON "CampaignRecipient"("campaignId", "status");

CREATE UNIQUE INDEX "CampaignRecipient_campaignId_email_key" ON "CampaignRecipient"("campaignId", "email");

CREATE INDEX "AbandonedCartEvent_email_idx" ON "AbandonedCartEvent"("email");

CREATE INDEX "Notification_userId_type_idx" ON "Notification"("userId", "type");

CREATE INDEX "Notification_userId_priority_idx" ON "Notification"("userId", "priority");

CREATE INDEX "NotificationPreference_category_idx" ON "NotificationPreference"("category");

CREATE UNIQUE INDEX "NotificationPreference_userId_eventKey_category_key" ON "NotificationPreference"("userId", "eventKey", "category");

CREATE INDEX "ProductReview_storeId_idx" ON "ProductReview"("storeId");

CREATE INDEX "ProductReview_productId_idx" ON "ProductReview"("productId");

CREATE INDEX "ProductReview_status_idx" ON "ProductReview"("status");

CREATE INDEX "StockMovement_storeId_idx" ON "StockMovement"("storeId");

CREATE INDEX "StockMovement_productId_idx" ON "StockMovement"("productId");

CREATE INDEX "StoreFormSubmission_email_idx" ON "StoreFormSubmission"("email");

CREATE INDEX "StoreProduct_status_idx" ON "StoreProduct"("status");

CREATE INDEX "StoreProduct_visibility_idx" ON "StoreProduct"("visibility");

CREATE INDEX "StoreProduct_featured_idx" ON "StoreProduct"("featured");

CREATE INDEX "StoreWishlistItem_productId_idx" ON "StoreWishlistItem"("productId");

ALTER TABLE "store_launch_payments" ADD CONSTRAINT "store_launch_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "store_launch_payments" ADD CONSTRAINT "store_launch_payments_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "onboarding_responses" ADD CONSTRAINT "onboarding_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoreVisitor" ADD CONSTRAINT "StoreVisitor_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StoreWishlistItem" ADD CONSTRAINT "StoreWishlistItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StoreWishlistItem" ADD CONSTRAINT "StoreWishlistItem_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "StoreVisitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StoreWishlistItem" ADD CONSTRAINT "StoreWishlistItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "StoreProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StoreFormSubmission" ADD CONSTRAINT "StoreFormSubmission_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StoreFormSubmission" ADD CONSTRAINT "StoreFormSubmission_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "StoreVisitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StoreProduct" ADD CONSTRAINT "StoreProduct_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Collection" ADD CONSTRAINT "Collection_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CollectionProduct" ADD CONSTRAINT "CollectionProduct_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CollectionProduct" ADD CONSTRAINT "CollectionProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "StoreProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShippingZone" ADD CONSTRAINT "ShippingZone_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CheckoutConfig" ADD CONSTRAINT "CheckoutConfig_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductPageTemplate" ADD CONSTRAINT "ProductPageTemplate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductSource" ADD CONSTRAINT "ProductSource_productId_fkey" FOREIGN KEY ("productId") REFERENCES "StoreProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SmartAlertRule" ADD CONSTRAINT "SmartAlertRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StoreHealthSnapshot" ADD CONSTRAINT "StoreHealthSnapshot_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Subscriber" ADD CONSTRAINT "Subscriber_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustomerSegment" ADD CONSTRAINT "CustomerSegment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StoreForm" ADD CONSTRAINT "StoreForm_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LiveChatConfig" ADD CONSTRAINT "LiveChatConfig_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AbandonedCartConfig" ADD CONSTRAINT "AbandonedCartConfig_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BroadcastCampaign" ADD CONSTRAINT "BroadcastCampaign_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AbandonedCartEvent" ADD CONSTRAINT "AbandonedCartEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AbandonedCartEvent" ADD CONSTRAINT "AbandonedCartEvent_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "StoreVisitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "StoreProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "StoreProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "BroadcastCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER INDEX "idx_automation_rule_store" RENAME TO "AutomationRule_storeId_idx";

ALTER INDEX "idx_automation_rule_trigger" RENAME TO "AutomationRule_trigger_idx";

ALTER INDEX "idx_logistics_payout_partner" RENAME TO "LogisticsPayoutAccount_logisticsPartnerId_idx";

ALTER INDEX "idx_logistics_payout_status" RENAME TO "LogisticsPayoutAccount_verificationStatus_idx";

ALTER INDEX "idx_review_partner" RENAME TO "LogisticsReview_logisticsPartnerId_idx";

ALTER INDEX "idx_review_reviewer" RENAME TO "LogisticsReview_reviewerId_idx";

ALTER INDEX "unique_booking_id" RENAME TO "LogisticsReview_bookingId_key";
