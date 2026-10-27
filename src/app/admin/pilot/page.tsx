import Link from "next/link";
import { AppPage, Card, CardHead, Pill } from "@/components/app-kit";
import { adminFrame } from "@/components/admin/AdminKit";
import { Notice } from "@/components/app-ui";
import { PILOT_ROLES, PilotTargets, deadlineText, pilotIsClosed } from "@/lib/pilot/pure";
import { PilotNotReady, listPrograms, previewInvites } from "@/lib/pilot/service.server";
import { requireRole } from "@/lib/server-auth";
import { PilotNotReadyState, ProgramForm } from "./_form";

export const dynamic = "force-dynamic";

// /admin/pilot: pilots that invite waitlist leads to test the app before launch, and a form to start a new one.
export default async function PilotProgramsPage(props: { searchParams?: Promise<{ error?: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");
  const frame = adminFrame(user, "Search leads");
  const search = (await props.searchParams) ?? {};
  const title = "Pilot testing";
  const sub = "Invite waitlist sellers, suppliers and delivery partners to test the app. Collect replies until a deadline, then pick your testers.";

  let programs: Awaited<ReturnType<typeof listPrograms>>;
  try {
    programs = await listPrograms();
  } catch (error) {
    if (!(error instanceof PilotNotReady)) throw error;
    return (
      <AppPage frame={frame} title={title} sub={sub}>
        <PilotNotReadyState />
      </AppPage>
    );
  }
  const roles = [...PILOT_ROLES];
  const [consented, everyone] = await Promise.all([
    previewInvites({ roles, includeNoConsent: false, textChannel: "sms" }),
    previewInvites({ roles, includeNoConsent: true, textChannel: "sms" }),
  ]);

  return (
    <AppPage frame={frame} title={title} sub={sub}>
      {search.error && <div className="mb-4"><Notice>{search.error}</Notice></div>}

      {programs.length > 0 && (
        <Card className="mb-5 p-5">
          <CardHead title="Pilots" />
          <ul className="m-0 flex list-none flex-col divide-y divide-app-line p-0">
            {programs.map((program) => {
              const total = (status: string) => Object.values(program.counts).reduce((sum, byStatus) => sum + (byStatus[status] ?? 0), 0);
              const closed = pilotIsClosed(program);
              return (
                <li key={program.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/pilot/${program.id}`} className="text-[15.5px] font-bold underline-offset-2 hover:underline">{program.name}</Link>
                      <Pill tone={program.status === "draft" ? "muted" : closed ? "info" : "success"} dot>{program.status === "draft" ? "Not sent" : closed ? "Replies closed" : "Taking replies"}</Pill>
                    </div>
                    <p className="mb-0 mt-1 text-[13px] text-app-ink-soft">
                      Closes {deadlineText(program.closesAt)} · {total("invited") + total("applied") + total("selected") + total("waitlisted") + total("declined")} invited · <b className="text-app-ink">{total("applied") + total("selected") + total("waitlisted")} replied</b> · {total("selected")} selected
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="p-5">
        <CardHead title="New pilot" sub="Nothing is sent until you press Send invitations on the next page." />
        <ProgramForm
          values={{ name: "Pilot: first testers", closesAt: new Date(Date.now() + 5 * 86_400_000), roles, targets: PilotTargets.parse({}), includeNoConsent: false, textChannel: "sms" }}
          reach={{ consented, everyone }}
        />
      </Card>
    </AppPage>
  );
}
