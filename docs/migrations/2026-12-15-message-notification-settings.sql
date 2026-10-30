-- New-message notification settings (shared/message-notifications.ts):
--
--   * "LogisticsTeamMember".notifyPrefs: a rider's own settings from the Riders app (Me › Notifications):
--     { company, shops, quiet: { enabled, start, end } }. Null means the defaults (messages from the company and
--     from shops buzz the phone, no quiet hours). Riders have no account, so this lives on the rider.
--   * Delivery partners' per-source switches ("Messages from riders", "Messages from shops & suppliers") need no
--     change: they are NotificationPreference rows with eventKey "notify.messages.riders" / "notify.messages.business".
--
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it.

ALTER TABLE "LogisticsTeamMember" ADD COLUMN IF NOT EXISTS "notifyPrefs" JSONB;

ALTER TABLE "LogisticsTeamMember" ENABLE ROW LEVEL SECURITY;
