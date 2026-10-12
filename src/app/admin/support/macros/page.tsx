import { redirect } from "next/navigation";
import { AppPage, PillLink } from "@/components/app-kit";
import { adminFrame } from "@/components/admin/AdminKit";
import { MacroManager, type MacroRow } from "@/components/support/admin/MacroManager";
import { STARTER_MACROS, listMacros, supportReady } from "@/lib/support/service.server";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function AdminSupportMacrosPage() {
  const user = await requireRole(["admin"], "/admin/login");
  if (!(await supportReady())) redirect("/admin/support");
  const saved = await listMacros();
  const savedTitles = new Set(saved.map((macro) => macro.title));
  const macros: MacroRow[] = [
    ...saved.map((macro) => ({ id: macro.id, title: macro.title, body: macro.body, topic: macro.topic, status: macro.status, usageCount: macro.usageCount })),
    // Starters stay visible until the team saves one with the same name.
    ...STARTER_MACROS.filter((macro) => !savedTitles.has(macro.title)).map((macro) => ({ id: macro.id, title: macro.title, body: macro.body, topic: macro.topic, status: macro.status, usageCount: 0, starter: true })),
  ];

  return (
    <AppPage
      frame={adminFrame(user, "Search support tickets")}
      title="Saved replies"
      sub="Canned answers for the questions the team gets most. Pick one in a ticket and it fills in the customer's name and ticket number."
      actions={<PillLink href="/admin/support" icon="arrowLeft">Queue</PillLink>}
    >
      <MacroManager macros={macros} />
    </AppPage>
  );
}
