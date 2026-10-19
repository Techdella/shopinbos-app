-- Phone sign-in codes on WhatsApp with an SMS fallback (src/lib/auth/otp-channel.ts, otp-delivery.server.ts).
--
--   * "AuthCodeChannel": one row per phone (key = sha256 of the E.164 number). POST /api/auth/otp writes the
--     channel it wants for the next code ("whatsapp" or "sms"); the Supabase Send SMS hook reads it, sends the code,
--     and writes the channel that actually carried it ("used"), which the send route reports to the screen.
--     Rows live 10 minutes and are swept on write.
--
-- Additive only, safe to run more than once. RLS on with no policies: only the app's server connection uses it.
-- Without this table, codes keep going by SMS (the code checks for it and falls back).

CREATE TABLE IF NOT EXISTS "AuthCodeChannel" (
  "key" TEXT NOT NULL,
  "wanted" TEXT NOT NULL,
  "used" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthCodeChannel_pkey" PRIMARY KEY ("key")
);
CREATE INDEX IF NOT EXISTS "AuthCodeChannel_expiresAt_idx" ON "AuthCodeChannel"("expiresAt");
ALTER TABLE "AuthCodeChannel" ENABLE ROW LEVEL SECURITY;
