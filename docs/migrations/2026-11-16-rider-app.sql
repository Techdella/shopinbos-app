-- Riders app on the phone (apps/mobile/src/app/rider, src/app/api/mobile/logistics/rider):
--
--   * "DeliveryBooking".pickupCode: 4-digit code the shop or supplier gives the rider at pickup. Made when the job is
--     accepted (src/lib/logistics/jobs.ts transitionJob) or, for jobs accepted before this, the first time the shop's
--     screen shows it. The rider types it before the parcel counts as picked up.
--   * "LogisticsTeamMember".plate: the bike's number plate (the partner types it when adding a rider).
--   * "LogisticsTeamMember".language: the language the rider picked in the app (en | pcm | yo | ha | ig).
--
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it.

ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "pickupCode" TEXT;

ALTER TABLE "LogisticsTeamMember" ADD COLUMN IF NOT EXISTS "plate" TEXT;
ALTER TABLE "LogisticsTeamMember" ADD COLUMN IF NOT EXISTS "language" TEXT;
