import { acceptAndAssignJob, assignJobRider } from "@/app/actions/logistics";
import { isRiderOut } from "@/lib/logistics/job-rules";
import { lastSeenWords, rankRidersForPickup, type LatLng, type RankedRider } from "@shared/delivery-geo";
import { SubmitButton, inputClass, jobId, type Translate } from "./kit";
import { getT } from "@/lib/i18n/server";

// Dispatch controls shared by Today and Jobs: accept a new job and give it to a rider in one step, or move
// a job to another rider. The rider list is sorted for that job's pickup (shared/delivery-geo rankRidersForPickup):
// free and out first, then busy, then offline; inside each, fresh locations (under 10 minutes) closest first.

export interface DispatchRider {
  id: string;
  name: string;
  online: boolean;
  lastSeenAt: Date | null;
  /** Jobs the rider is carrying now (lib/logistics/dispatch-riders.ts withOpenJobs). */
  openJobs?: number;
  lastLat?: number | null;
  lastLng?: number | null;
  lastLocationAt?: Date | null;
}

export const riderSelect = { id: true, name: true, status: true, online: true, lastSeenAt: true, lastLat: true, lastLng: true, lastLocationAt: true } as const;

/** "5 riders out · 1 offline", counting active riders only. */
export function riderPresence(riders: Array<DispatchRider & { status: string }>, now = new Date()) {
  const active = riders.filter((rider) => rider.status === "active");
  const out = active.filter((rider) => isRiderOut(rider, now)).length;
  return { total: active.length, out, offline: active.length - out };
}

/** "Ada · free · 1.2 km away · about 5 min" */
export function riderOptionLabel(row: RankedRider<DispatchRider & { openJobs: number; lat: number | null; lng: number | null; locationAt: Date | null }>, now: Date, t?: Translate) {
  const { rider, group, fresh, distanceText } = row;
  const state = t
    ? group === 0 ? t.dynamic("dispatch.free", "free") : group === 1 ? t.dynamic("dispatch.busy", "busy ({count, plural, one {# job} other {# jobs}})", { count: rider.openJobs }) : t.dynamic("dispatch.offline", "offline")
    : group === 0 ? "free" : group === 1 ? `busy (${rider.openJobs} ${rider.openJobs === 1 ? "job" : "jobs"})` : "offline";
  const seen = t ? seenWords(rider.locationAt, now, t) : lastSeenWords(rider.locationAt, now);
  const where = distanceText ? (fresh ? distanceText : t ? t.dynamic("dispatch.seen", "{distance}, seen {when}", { distance: distanceText.split(" · ")[0], when: seen }) : `${distanceText.split(" · ")[0]}, seen ${seen}`) : "";
  return [rider.name, state, where].filter(Boolean).join(" · ");
}

/** shared/delivery-geo lastSeenWords, in the page's language. */
function seenWords(at: Date | null, now: Date, t: Translate) {
  const time = at ? at.getTime() : NaN;
  if (!Number.isFinite(time)) return t.dynamic("dispatch.notSeen", "not seen yet");
  const minutes = Math.floor((now.getTime() - time) / 60_000);
  if (minutes < 1) return t.dynamic("kit.justNow", "just now");
  if (minutes < 60) return t.dynamic("kit.minAgo", "{count} min ago", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t.dynamic("dispatch.hrAgo", "{count} hr ago", { count: hours });
  const days = Math.floor(hours / 24);
  return days === 1 ? t.dynamic("kit.yesterday", "yesterday") : t.dynamic("dispatch.daysAgo", "{count} days ago", { count: days });
}

function rankRiders(riders: DispatchRider[], now: Date, pickup?: LatLng | null) {
  return rankRidersForPickup(
    riders.map((rider) => ({ ...rider, openJobs: rider.openJobs ?? 0, lat: rider.lastLat ?? null, lng: rider.lastLng ?? null, locationAt: rider.lastLocationAt ?? null })),
    pickup,
    now,
  );
}

function riderOptions(riders: DispatchRider[], now: Date, pickup: LatLng | null | undefined, t: Translate) {
  return rankRiders(riders, now, pickup).map((row) => (
    <option key={row.rider.id} value={row.rider.id}>{riderOptionLabel(row, now, t)}</option>
  ));
}

/** The closest free rider with a fresh location, picked for the dispatcher (spec 8A: a sensible answer already picked). */
function bestRider(riders: DispatchRider[], now: Date, pickup?: LatLng | null) {
  const first = rankRiders(riders, now, pickup)[0];
  return first && first.group === 0 && first.fresh && first.meters !== null && first.meters <= 15_000 ? first.rider.id : "";
}

export async function AcceptAssignForm({ bookingId, riders, returnTo, className, pickup }: { bookingId: string; riders: DispatchRider[]; returnTo: string; className?: string; pickup?: LatLng | null }) {
  const t = await getT("logistics");
  const now = new Date();
  return (
    <form action={acceptAndAssignJob} className={["flex min-w-0 flex-wrap gap-2", className ?? ""].join(" ")}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <label htmlFor={`assign-${bookingId}`} className="sr-only">{t("dispatch.riderForJob", { job: jobId(bookingId) })}</label>
      <select id={`assign-${bookingId}`} name="riderId" defaultValue={bestRider(riders, now, pickup)} className={`${inputClass} h-10 min-w-[200px] flex-1 rounded-full`}>
        <option value="">{riders.length ? t("dispatch.assignLater") : t("dispatch.noRidersYet")}</option>
        {riderOptions(riders, now, pickup, t)}
      </select>
      <SubmitButton size="sm" aria-label={t("dispatch.acceptAssignAria", { job: jobId(bookingId) })}>{t("dispatch.acceptAssign")}</SubmitButton>
    </form>
  );
}

export async function ReassignForm({ bookingId, riderId, riderName, riders, returnTo, pickup }: { bookingId: string; riderId: string | null; riderName?: string | null; riders: DispatchRider[]; returnTo: string; pickup?: LatLng | null }) {
  const t = await getT("logistics");
  const now = new Date();
  return (
    <form action={assignJobRider} className="flex min-w-0 flex-wrap items-end gap-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <div className="min-w-[160px] flex-1">
        <label htmlFor={`rider-${bookingId}`} className="mb-1.5 block text-[15px] font-bold">{t("dispatch.rider")}</label>
        <select id={`rider-${bookingId}`} name="riderId" defaultValue={riderId ?? ""} className={inputClass}>
          <option value="">{t("dispatch.noRider")}</option>
          {riderId && !riders.some((rider) => rider.id === riderId) && <option value={riderId}>{t("dispatch.inactive", { name: riderName ?? t("dispatch.currentRider") })}</option>}
          {riderOptions(riders, now, pickup, t)}
        </select>
      </div>
      <SubmitButton tone="white">{riderId ? t("dispatch.reassign") : t("dispatch.assign")}</SubmitButton>
    </form>
  );
}
