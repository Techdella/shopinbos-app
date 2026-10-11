import { acceptAndAssignJob, assignJobRider } from "@/app/actions/logistics";
import { isRiderOut } from "@/lib/logistics/job-rules";
import { SubmitButton, inputClass, jobId } from "./kit";

// Dispatch controls shared by Today and Jobs: accept a new job and give it to a rider in one step, or move
// a job to another rider.

export interface DispatchRider {
  id: string;
  name: string;
  online: boolean;
  lastSeenAt: Date | null;
}

export const riderSelect = { id: true, name: true, status: true, online: true, lastSeenAt: true } as const;

/** "5 riders out · 1 offline", counting active riders only. */
export function riderPresence(riders: Array<DispatchRider & { status: string }>, now = new Date()) {
  const active = riders.filter((rider) => rider.status === "active");
  const out = active.filter((rider) => isRiderOut(rider, now)).length;
  return { total: active.length, out, offline: active.length - out };
}

function riderOptions(riders: DispatchRider[], now: Date) {
  return riders.map((rider) => (
    <option key={rider.id} value={rider.id}>{rider.name}{isRiderOut(rider, now) ? " · online" : " · offline"}</option>
  ));
}

export function AcceptAssignForm({ bookingId, riders, returnTo, className }: { bookingId: string; riders: DispatchRider[]; returnTo: string; className?: string }) {
  const now = new Date();
  return (
    <form action={acceptAndAssignJob} className={["flex min-w-0 flex-wrap gap-2", className ?? ""].join(" ")}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <label htmlFor={`assign-${bookingId}`} className="sr-only">Rider for job {jobId(bookingId)}</label>
      <select id={`assign-${bookingId}`} name="riderId" defaultValue="" className={`${inputClass} h-10 min-w-[140px] flex-1 rounded-full`}>
        <option value="">{riders.length ? "Assign a rider later" : "No riders yet"}</option>
        {riderOptions(riders, now)}
      </select>
      <SubmitButton size="sm" aria-label={`Accept and assign job ${jobId(bookingId)}`}>Accept and assign</SubmitButton>
    </form>
  );
}

export function ReassignForm({ bookingId, riderId, riderName, riders, returnTo }: { bookingId: string; riderId: string | null; riderName?: string | null; riders: DispatchRider[]; returnTo: string }) {
  const now = new Date();
  return (
    <form action={assignJobRider} className="flex min-w-0 flex-wrap items-end gap-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <div className="min-w-[160px] flex-1">
        <label htmlFor={`rider-${bookingId}`} className="mb-1.5 block text-[13px] font-bold">Rider</label>
        <select id={`rider-${bookingId}`} name="riderId" defaultValue={riderId ?? ""} className={inputClass}>
          <option value="">No rider</option>
          {riderId && !riders.some((rider) => rider.id === riderId) && <option value={riderId}>{riderName ?? "Current rider"} · inactive</option>}
          {riderOptions(riders, now)}
        </select>
      </div>
      <SubmitButton tone="white">{riderId ? "Reassign" : "Assign"}</SubmitButton>
    </form>
  );
}
