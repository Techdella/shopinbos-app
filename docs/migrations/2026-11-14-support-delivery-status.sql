-- Admin › Inbox: what WhatsApp says happened to each message the team sent (sent, delivered, read, failed).
ALTER TABLE "SupportMessage" ADD COLUMN IF NOT EXISTS "deliveryStatus" TEXT;
ALTER TABLE "SupportMessage" ADD COLUMN IF NOT EXISTS "deliveryError" TEXT;
