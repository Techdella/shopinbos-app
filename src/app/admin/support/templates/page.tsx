import { AppPage, Card, CardHead, Pill, PillLink, type Tone } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { adminFrame, buttonClass } from "@/components/admin/AdminKit";
import { TemplateForm } from "@/components/support/admin/TemplateForm";
import { deleteInboxTemplate, resubmitInboxTemplate } from "@/app/actions/admin-lead-growth";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { templateText } from "@/lib/support/whatsapp-pure";
import { allTeamTemplates, inboxWhatsAppConfig, inboxWhatsAppStatus } from "@/lib/support/whatsapp.server";

export const dynamic = "force-dynamic";

// Admin › Inbox › WhatsApp templates: the messages the team can start a WhatsApp chat with (New conversation,
// after an approval, or to reopen a chat after 24 hours). Built-in ones and the team's own; each needs Meta's
// approval before it can be sent.

const STATUS_TONE: Record<string, Tone> = { APPROVED: "success", PENDING: "warning", IN_APPEAL: "warning", REJECTED: "danger", PAUSED: "danger", DISABLED: "danger" };

type Search = { error?: string; added?: string; submitted?: string; deleted?: string; name?: string; purpose?: string; category?: string; body?: string };

export default async function InboxTemplatesPage(props: { searchParams?: Promise<Search> }) {
  const user = await requireAdminSection("inbox");
  const search = (await props.searchParams) ?? {};
  const connected = Boolean(inboxWhatsAppConfig());
  const [templates, status] = await Promise.all([allTeamTemplates(), connected ? inboxWhatsAppStatus().catch(() => null) : Promise.resolve(null)]);
  const statusOf = new Map((status?.templates ?? []).map((t) => [t.name, t]));

  return (
    <AppPage
      frame={adminFrame(user, "Search conversations")}
      title="WhatsApp templates"
      sub="WhatsApp only lets a business start a chat with a template Meta has approved. Write your own here; approval usually takes minutes."
      actions={
        <>
          <PillLink href="/admin/support" icon="arrowLeft" iconOnlyOnPhone>Inbox</PillLink>
          <PillLink href="/admin/support/new" tone="ink" icon="plus">New conversation</PillLink>
        </>
      }
    >
      {search.error && <div className="mb-4"><Notice>{search.error}</Notice></div>}
      {search.added && <div className="mb-4"><Notice tone="success">Saved and sent to Meta. It can be used once Meta approves it.</Notice></div>}
      {search.submitted && <div className="mb-4"><Notice tone="success">Sent to Meta again.</Notice></div>}
      {search.deleted && <div className="mb-4"><Notice tone="success">Deleted.</Notice></div>}
      {!connected && <div className="mb-4"><Notice tone="info">The WhatsApp number isn&apos;t connected on the server yet, so templates can&apos;t be sent to Meta.</Notice></div>}
      {status?.error && <div className="mb-4"><Notice>Couldn&apos;t read template statuses from Meta: {status.error}</Notice></div>}

      <Card className="mb-6 p-5">
        <CardHead title="New template" />
        <TemplateForm initial={{ name: search.name ?? "", purpose: search.purpose ?? "", category: search.category ?? "UTILITY", body: search.body ?? "" }} />
      </Card>

      <h2 className="mb-3 mt-0 text-[17px] font-extrabold">Templates · {templates.length}</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {templates.map((template) => {
          const meta = statusOf.get(template.name);
          const state = meta?.status ?? null;
          return (
            <Card key={template.name} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 text-[15px] font-extrabold">{template.purpose}</span>
                <Pill tone={state ? STATUS_TONE[state] ?? "muted" : "muted"} dot>{state ? state.toLowerCase().replace("_", " ") : connected ? "not submitted" : "not connected"}</Pill>
              </div>
              <div className="flex flex-wrap gap-2 text-[12.5px] text-app-ink-soft">
                <span className="font-mono">{template.name}</span>
                <span>· {template.category === "MARKETING" ? "Marketing" : "Utility"}</span>
                <span>· {template.custom ? "Written by the team" : "Built in"}</span>
              </div>
              <div className="rounded-[14px] bg-[#E7F1EC] p-2.5">
                <div className="whitespace-pre-wrap rounded-[10px] bg-white px-3 py-2 text-[13.5px] leading-[1.5]">{templateText(template)}</div>
              </div>
              {meta?.reason && <p className="m-0 text-[13px] font-semibold text-app-danger">Meta: {meta.reason}</p>}
              <div className="flex flex-wrap gap-2">
                {connected && (!state || state === "REJECTED") && (
                  <form action={resubmitInboxTemplate}>
                    <input type="hidden" name="name" value={template.name} />
                    <button type="submit" className={buttonClass("white", "sm")}>{state ? "Send to Meta again" : "Send to Meta"}</button>
                  </form>
                )}
                {template.custom && (
                  <form action={deleteInboxTemplate}>
                    <input type="hidden" name="name" value={template.name} />
                    <button type="submit" className={buttonClass("danger", "sm")}>Delete</button>
                  </form>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </AppPage>
  );
}
