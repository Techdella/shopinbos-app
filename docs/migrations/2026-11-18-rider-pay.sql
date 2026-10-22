-- Rider pay (Riders app earnings, src/lib/logistics/job-rules.ts riderPayFor):
--
--   * "LogisticsTeamMember".payType / payRate: what the partner pays this rider. "per_drop" = payRate naira for each
--     delivered job; "share" = payRate percent of the partner's fee after the Shopinbos fee. Both null until the
--     partner sets them on /logistics/couriers (the Riders app shows delivery fees until then).
--   * "DeliveryBooking".riderPay: what the rider earned for the job, saved when it's delivered (src/lib/logistics/jobs.ts
--     transitionJob), so a later pay change never rewrites past earnings.
--
-- Additive only, safe to run more than once. Run BEFORE deploying the code that uses it.

ALTER TABLE "LogisticsTeamMember" ADD COLUMN IF NOT EXISTS "payType" TEXT;
ALTER TABLE "LogisticsTeamMember" ADD COLUMN IF NOT EXISTS "payRate" DOUBLE PRECISION;

ALTER TABLE "DeliveryBooking" ADD COLUMN IF NOT EXISTS "riderPay" DOUBLE PRECISION;
