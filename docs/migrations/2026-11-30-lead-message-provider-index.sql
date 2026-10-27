-- WhatsApp delivery reports find the lead message by Meta's message id (src/lib/lead-growth/service.server.ts updateLeadDelivery).
CREATE INDEX IF NOT EXISTS "LeadMessage_providerId_idx" ON "LeadMessage"("providerId");
