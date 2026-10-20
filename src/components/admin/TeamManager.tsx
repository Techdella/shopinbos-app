"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeTeamRoleAction, inviteTeamMemberAction, removeTeamMemberAction } from "@/app/actions/admin-team";
import { Card, CardHead, Pill } from "@/components/app-kit";
import { Notice, PillButton, TextInput } from "@/components/app-ui";
import { Field } from "@/components/growth/kit";
import { confirmDialog } from "@/components/ui/dialogs";
import { deskSelect } from "@/components/support/admin/ui";
import { ADMIN_ROLES, ADMIN_ROLE_HELP, ADMIN_ROLE_LABEL, type AdminRole } from "@/lib/admin-team/pure";

// Admin › Team: add someone with a role, change roles, remove people. Owners only; others see the list.

export type TeamRow = { id: string; name: string; email: string | null; role: AdminRole | "disabled"; lastSignInAt: string | null; you: boolean };

type Result = { ok: true; message?: string } | { ok: false; error: string };

export function TeamManager({ members, canManage }: { members: TeamRow[]; canManage: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("support");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const act = (work: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      setFeedback(null);
      const result = await work();
      if (!result.ok) return setFeedback({ tone: "error", text: result.error });
      setFeedback({ tone: "success", text: result.message ?? "Saved." });
      after?.();
      router.refresh();
    });

  const active = members.filter((member) => member.role !== "disabled");
  const removed = members.filter((member) => member.role === "disabled");

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex min-w-0 flex-col gap-5">
        {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}
        <Card className="overflow-hidden">
          <div className="px-5 pt-5">
            <CardHead title={`Team · ${active.length}`} sub="Everyone who can sign in to the admin portal, and what they can open." />
          </div>
          <ul className="m-0 mt-2 list-none divide-y divide-app-line p-0">
            {active.map((member) => (
              <li key={member.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-app-ink text-[13px] font-extrabold text-white" aria-hidden>
                  {member.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1 basis-[200px]">
                  <div className="truncate text-[15px] font-extrabold">
                    {member.name} {member.you && <span className="text-[12.5px] font-bold text-app-ink-soft">(you)</span>}
                  </div>
                  <div className="truncate text-[13px] text-app-ink-soft">
                    {member.email ?? "No email"} · {member.lastSignInAt ? `last signed in ${new Date(member.lastSignInAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "hasn't signed in yet"}
                  </div>
                </div>
                {canManage && !member.you ? (
                  <>
                    <label className="sr-only" htmlFor={`role-${member.id}`}>Role for {member.name}</label>
                    <select id={`role-${member.id}`} className={deskSelect} value={member.role} disabled={pending} onChange={(e) => act(() => changeTeamRoleAction(member.id, e.target.value))}>
                      {ADMIN_ROLES.map((value) => <option key={value} value={value}>{ADMIN_ROLE_LABEL[value]}</option>)}
                    </select>
                    <PillButton
                      type="button"
                      size="sm"
                      tone="white"
                      disabled={pending}
                      onClick={async () => {
                        if (await confirmDialog({ title: `Remove ${member.name}?`, message: "They'll be signed out of the admin portal straight away. Their tickets go back to the queue.", tone: "danger", confirmLabel: "Remove" })) {
                          act(() => removeTeamMemberAction(member.id));
                        }
                      }}
                    >
                      Remove
                    </PillButton>
                  </>
                ) : (
                  <Pill tone={member.role === "owner" ? "success" : "muted"}>{member.role === "disabled" ? "Removed" : ADMIN_ROLE_LABEL[member.role]}</Pill>
                )}
              </li>
            ))}
          </ul>
        </Card>
        {removed.length > 0 && (
          <Card className="p-5">
            <CardHead title="Removed" sub="They can't sign in. Add them again with the form to bring them back." />
            <ul className="m-0 mt-2 list-none p-0 text-[14px]">
              {removed.map((member) => (
                <li key={member.id} className="py-1.5 text-app-ink-soft">{member.name} · {member.email}</li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      <aside className="flex min-w-0 flex-col gap-5">
        {canManage ? (
          <Card className="p-5">
            <CardHead title="Add a team member" sub="We create their sign-in and email them. They sign in with their email and a code." />
            <form
              className="mt-3 grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                act(() => inviteTeamMemberAction({ name, email, role }), () => {
                  setName("");
                  setEmail("");
                });
              }}
            >
              <Field label="Name" htmlFor="team-name">
                <TextInput id="team-name" value={name} maxLength={120} required onChange={(e) => setName(e.target.value)} placeholder="Amaka Obi" />
              </Field>
              <Field label="Work email" htmlFor="team-email" hint="Not one they use for a seller, supplier or delivery account.">
                <TextInput id="team-email" type="email" value={email} required onChange={(e) => setEmail(e.target.value)} placeholder="amaka@shopinbos.com" />
              </Field>
              <Field label="Role" htmlFor="team-role" hint={ADMIN_ROLE_HELP[role]}>
                <select id="team-role" className={`${deskSelect} w-full`} value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
                  {ADMIN_ROLES.map((value) => <option key={value} value={value}>{ADMIN_ROLE_LABEL[value]}</option>)}
                </select>
              </Field>
              <PillButton type="submit" size="md" busy={pending} disabled={pending}>Add to the team</PillButton>
            </form>
          </Card>
        ) : (
          <Notice tone="info">Only owners can add people or change roles.</Notice>
        )}
        <Card className="p-5">
          <CardHead title="Roles" />
          <dl className="m-0 mt-2 grid gap-2.5 text-[13.5px]">
            {ADMIN_ROLES.map((value) => (
              <div key={value}>
                <dt className="font-extrabold">{ADMIN_ROLE_LABEL[value]}</dt>
                <dd className="m-0 text-app-ink-soft">{ADMIN_ROLE_HELP[value]}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </aside>
    </div>
  );
}
