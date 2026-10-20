import { AppPage, PillLink } from "@/components/app-kit";
import { adminFrame } from "@/components/admin/AdminKit";
import { NewConversation, type TemplateOption } from "@/components/support/admin/NewConversation";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { isEmailConfigured } from "@/lib/notifications/resend";
import { personByKey } from "@/lib/support/people.server";
import { decisionPreset } from "@/lib/support/presets";
import { allTeamTemplates, inboxWhatsAppConfig, inboxWhatsAppStatus } from "@/lib/support/whatsapp.server";

export const dynamic = "force-dynamic";

// ?to=user:<id> | lead:<id> picks the person; ?preset=approved|rejected (after a verification decision) fills in the
// message, and ?back= is where Skip goes. ?channel=, ?name=, ?email=, ?phone= prefill a typed-in address.
type Search = { to?: string; preset?: string; back?: string; channel?: string; name?: string; email?: string; phone?: string };

const safeBack = (value: string | undefined) => (value && value.startsWith("/admin/") && !value.startsWith("//") ? value : "/admin/support");

export default async function NewConversationPage(props: { searchParams?: Promise<Search> }) {
  const user = await requireAdminSection("inbox");
  const search = (await props.searchParams) ?? {};
  const whatsappReady = Boolean(inboxWhatsAppConfig());
  const [person, templates, status] = await Promise.all([
    personByKey(search.to),
    allTeamTemplates(),
    whatsappReady ? inboxWhatsAppStatus().catch(() => null) : Promise.resolve(null),
  ]);
  const statusOf = new Map((status?.templates ?? []).map((t) => [t.name, t.status]));
  const options: TemplateOption[] = templates.map((t) => ({ ...t, status: statusOf.get(t.name) ?? null }));

  const presetId = search.preset === "approved" || search.preset === "rejected" ? search.preset : null;
  const preset =
    presetId && person
      ? {
          ...decisionPreset(presetId, { name: person.name, business: person.business ?? person.name, role: person.role, agent: user.name }),
          done: presetId === "approved" ? `${person.business ?? person.name} is approved.` : `${person.business ?? person.name} wasn't approved.`,
          back: safeBack(search.back),
        }
      : null;
  const channel = search.channel === "email" || search.channel === "whatsapp" || search.channel === "app" ? search.channel : null;

  return (
    <AppPage
      frame={adminFrame(user, "Search conversations")}
      title={preset ? "Let them know" : "New conversation"}
      sub="Choose who, then send by WhatsApp, email or in the app. Their reply comes back into the inbox."
      actions={<PillLink href="/admin/support" icon="arrowLeft">Inbox</PillLink>}
    >
      <NewConversation
        initial={{
          person,
          channel: channel ?? (preset && person?.email ? "email" : null),
          preset,
          name: (search.name ?? "").slice(0, 120),
          email: (search.email ?? "").slice(0, 200),
          phone: (search.phone ?? "").slice(0, 40),
        }}
        templates={options}
        whatsappReady={whatsappReady}
        emailReady={isEmailConfigured()}
        me={user.name}
      />
    </AppPage>
  );
}
