import { acceptAndAssignJob, assignJobRider } from "@/app/actions/logistics";
import { isRiderOut } from "@/lib/logistics/job-rules";
import { lastSeenWords, rankRidersForPickup, type LatLng, type RankedRider } from "@shared/delivery-geo";
import { SubmitButton, inputClass, jobId } from "./kit";

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
export function riderOptionLabel(row: RankedRider<DispatchRider & { openJobs: number; lat: number | null; lng: number | null; locationAt: Date | null }>, now: Date) {
  const { rider, group, fresh, distanceText } = row;
  const state = group === 0 ? "free" : group === 1 ? `busy (${rider.openJobs} ${rider.openJobs === 1 ? "job" : "jobs"})` : "offline";
  const where = distanceText ? (fresh ? distanceText : `${distanceText.split(" · ")[0]}, seen ${lastSeenWords(rider.locationAt, now)}`) : "";
  return [rider.name, state, where].filter(Boolean).join(" · ");
}

function riderOptions(riders: DispatchRider[], now: Date, pickup?: LatLng | null) {
  const ranked = rankRidersForPickup(
    riders.map((rider) => ({ ...rider, openJobs: rider.openJobs ?? 0, lat: rider.lastLat ?? null, lng: rider.lastLng ?? null, locationAt: rider.lastLocationAt ?? null })),
    pickup,
    now,
  );
  return ranked.map((row) => (
    <option key={row.rider.id} value={row.rider.id}>{riderOptionLabel(row, now)}</option>
  ));
}

export function AcceptAssignForm({ bookingId, riders, returnTo, className, pickup }: { bookingId: string; riders: DispatchRider[]; returnTo: string; className?: string; pickup?: LatLng | null }) {
  const now = new Date();
  return (
    <form action={acceptAndAssignJob} className={["flex min-w-0 flex-wrap gap-2", className ?? ""].join(" ")}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <label htmlFor={`assign-${bookingId}`} className="sr-only">Rider for job {jobId(bookingId)}</label>
      <select id={`assign-${bookingId}`} name="riderId" defaultValue="" className={`${inputClass} h-10 min-w-[140px] flex-1 rounded-full`}>
        <option value="">{riders.length ? "Pick a rider later" : "No riders yet"}</option>
        {riderOptions(riders, now, pickup)}
      </select>
      <SubmitButton size="sm" aria-label={`Accept and pick a rider for job ${jobId(bookingId)}`}>Accept and pick a rider</SubmitButton>
    </form>
  );
}

export function ReassignForm({ bookingId, riderId, riderName, riders, returnTo, pickup }: { bookingId: string; riderId: string | null; riderName?: string | null; riders: DispatchRider[]; returnTo: string; pickup?: LatLng | null }) {
  const now = new Date();
  return (
    <form action={assignJobRider} className="flex min-w-0 flex-wrap items-end gap-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <div className="min-w-[160px] flex-1">
        <label htmlFor={`rider-${bookingId}`} className="mb-1.5 block text-[15px] font-bold">Rider</label>
        <select id={`rider-${bookingId}`} name="riderId" defaultValue={riderId ?? ""} className={inputClass}>
          <option value="">No rider</option>
          {riderId && !riders.some((rider) => rider.id === riderId) && <option value={riderId}>{riderName ?? "Current rider"} · inactive</option>}
          {riderOptions(riders, now, pickup)}
        </select>
      </div>
      <SubmitButton tone="white">{riderId ? "Change rider" : "Give to rider"}</SubmitButton>
    </form>
  );
}
