import { AppPage, PillLink } from "@/components/app-kit";
import { adminFrame } from "@/components/admin/AdminKit";
import { NewConversation } from "@/components/support/admin/NewConversation";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { isEmailConfigured } from "@/lib/notifications/resend";
import { inboxWhatsAppConfig, inboxWhatsAppStatus } from "@/lib/support/whatsapp.server";

export const dynamic = "force-dynamic";

type Search = { channel?: string; name?: string; email?: string; phone?: string };

export default async function NewConversationPage(props: { searchParams?: Promise<Search> }) {
  const user = await requireAdminSection("inbox");
  const search = (await props.searchParams) ?? {};
  const whatsappReady = Boolean(inboxWhatsAppConfig());
  const status = whatsappReady ? await inboxWhatsAppStatus().catch(() => null) : null;

  return (
    <AppPage
      frame={adminFrame(user, "Search conversations")}
      title="New conversation"
      sub="Write first, by WhatsApp or email. Their reply comes back into the inbox."
      actions={<PillLink href="/admin/support" icon="arrowLeft">Inbox</PillLink>}
    >
      <NewConversation
        initial={{
          channel: search.channel === "email" ? "email" : "whatsapp",
          name: (search.name ?? "").slice(0, 120),
          email: (search.email ?? "").slice(0, 200),
          phone: (search.phone ?? "").slice(0, 40),
        }}
        templates={(status?.templates ?? []).map((t) => ({ name: t.name, status: t.status }))}
        whatsappReady={whatsappReady}
        emailReady={isEmailConfigured()}
        me={user.name}
      />
    </AppPage>
  );
}
