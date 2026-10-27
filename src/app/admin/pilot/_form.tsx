import { EmptyState } from "@/components/app-kit";
import { buttonClass, fieldClass } from "@/components/admin/AdminKit";
import { savePilotProgram } from "@/app/actions/admin-pilot";
import { PILOT_ROLES, PILOT_ROLE_LABELS, type PilotRole, type PilotTargetsType } from "@/lib/pilot/pure";

// The pilot setup form (/admin/pilot and /admin/pilot/[id]): name, reply deadline, who to invite, how many to pick.

export type ProgramFormValues = {
  id?: string;
  name: string;
  closesAt: Date;
  roles: string[];
  targets: PilotTargetsType;
  includeNoConsent: boolean;
  textChannel: string;
};

/** A Date as a datetime-local value in Lagos time (UTC+1). */
function lagosInputValue(date: Date) {
  return new Date(date.getTime() + 3_600_000).toISOString().slice(0, 16);
}

export function ProgramForm({ values, reach }: { values: ProgramFormValues; reach: { consented: Partial<Record<PilotRole, number>>; everyone: Partial<Record<PilotRole, number>> } }) {
  return (
    <form action={savePilotProgram} className="flex flex-col gap-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[13.5px] font-bold">
          Name
          <input name="name" required maxLength={120} defaultValue={values.name} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13.5px] font-bold">
          Replies close (Lagos time)
          <input name="closesAt" type="datetime-local" required defaultValue={lagosInputValue(values.closesAt)} className={fieldClass} />
        </label>
      </div>

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 text-[13.5px] font-bold">Who to invite, and how many testers to pick</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {PILOT_ROLES.map((role) => (
            <div key={role} className="rounded-[14px] border border-app-line p-3">
              <label className="flex items-center gap-2 text-[14px] font-bold">
                <input type="checkbox" name="roles" value={role} defaultChecked={values.roles.includes(role)} className="h-[18px] w-[18px]" />
                {PILOT_ROLE_LABELS[role]}
              </label>
              <p className="mb-2 mt-1 text-[12.5px] text-app-ink-soft">
                {reach.consented[role] ?? 0} agreed to messages · {reach.everyone[role] ?? 0} in all
              </p>
              <label className="flex items-center gap-2 text-[13px]">
                Pick
                <input name={`target_${role}`} type="number" min={0} max={1000} defaultValue={values.targets[role]} className={`${fieldClass} !min-h-[38px] !w-[90px]`} />
              </label>
            </div>
          ))}
        </div>
      </fieldset>

      <label className="flex items-start gap-2 text-[13.5px]">
        <input type="checkbox" name="includeNoConsent" defaultChecked={values.includeNoConsent} className="mt-0.5 h-[18px] w-[18px] shrink-0" />
        <span>
          <b>Also invite people who didn&apos;t tick &quot;agree to messages&quot;</b> on the waitlist form. They get the one invitation and one reminder, each with a way to opt out, and nothing else unless they reply.
        </span>
      </label>

      <label className="flex flex-col gap-1.5 text-[13.5px] font-bold sm:max-w-[360px]">
        People with only a phone number get the invitation by
        <select name="textChannel" defaultValue={values.textChannel} className={fieldClass}>
          <option value="sms">SMS</option>
          <option value="whatsapp">WhatsApp (only reaches people who wrote to us in the last 24 hours)</option>
          <option value="none">Don&apos;t invite them</option>
        </select>
      </label>

      <div>
        <button type="submit" className={buttonClass("ink")}>{values.id ? "Save changes" : "Create pilot"}</button>
      </div>
    </form>
  );
}

export function PilotNotReadyState() {
  return (
    <EmptyState icon="list" title="Pilot testing needs a quick database update">
      Run docs/migrations/2026-12-01-pilot-testing.sql on the Supabase database, then come back here.
    </EmptyState>
  );
}
