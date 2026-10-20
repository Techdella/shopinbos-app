-- The WhatsApp store: each customer's cart inside their WhatsApp chat with the store (src/lib/whatsapp-store).
CREATE TABLE IF NOT EXISTS "WhatsAppCart" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "items" JSONB NOT NULL DEFAULT '[]',
  "paymentLinkId" TEXT,
  "checkedOutAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppCart_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppCart_conversationId_key" ON "WhatsAppCart"("conversationId");
CREATE INDEX IF NOT EXISTS "WhatsAppCart_storeId_updatedAt_idx" ON "WhatsAppCart"("storeId", "updatedAt");
