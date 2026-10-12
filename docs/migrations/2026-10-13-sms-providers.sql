-- SMS and phone calls move from Twilio to Termii / Africa's Talking / Sendchamp. No schema change: the store's
-- provider is kept in "InboxChannel".settings->>'provider' ('termii' | 'africastalking' | 'sendchamp'), next to the
-- encrypted keys. Safe to run more than once.
--
-- Compatibility: rows connected before this change hold Twilio keys and no provider. The app already treats them as
-- "Reconnect" (Inbox › Channels shows the notice, replies on them fail with a reconnect message, and the old
-- /api/webhooks/twilio/* routes are gone, so nothing new arrives on them). This marks them the same way in the
-- database and forgets the Twilio keys. Conversations and messages stay. Old Twilio voicemail links can't be
-- opened any more (they needed the Twilio auth token).

UPDATE "InboxChannel"
SET
  "status" = 'error',
  "credentials" = NULL,
  "settings" = COALESCE("settings", '{}'::jsonb) || jsonb_build_object('provider', NULL, 'legacyProvider', 'twilio'),
  "lastError" = 'SMS and calls now run on Termii, Africa''s Talking or Sendchamp. Connect your account again to keep receiving messages.',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "channel" IN ('sms', 'voice')
  AND "status" = 'connected'
  AND COALESCE("settings"->>'provider', '') NOT IN ('termii', 'africastalking', 'sendchamp');

-- The table already exists; keep RLS on (the app reaches it through Prisma with the service connection only).
ALTER TABLE "InboxChannel" ENABLE ROW LEVEL SECURITY;
