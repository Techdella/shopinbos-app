import Link from "next/link";
import { AppPage, Card, CardHead, ListCard, ListRow, Pill } from "@/components/app-kit";
import { adminFrame, formatDate } from "@/components/admin/AdminKit";
import { AiCheckCard } from "@/components/admin/AiCheckCard";
import { LaunchSettings } from "@/components/admin/LaunchSettings";
import { CacChecksStatus, IdChecksStatus, KorapayChecksStatus } from "@/components/admin/IdCheckStatus";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { providerOrder } from "@/lib/ai/client";
import { db } from "@/lib/db/client";
import { launchCheck } from "@/lib/launch-check/server";
import { korapayIdentityHealth, korapayIdentityReady, type KorapayIdentityHealth } from "@/lib/korapay";
import { cacProviders } from "@/lib/kyb/verify-cac.server";
import { youverifyHealth, type YouverifyHealth } from "@/lib/youverify";
import { ApiKeysPanel, WebhooksPanel } from "./PartnerConnection";

export const dynamic = "force-dynamic";

// Admin › Developers: the technical side, kept off the everyday pages. Owners, admins and the Developer role only.
//  • Launch settings: which production keys this deployment has, and whether every scheduled job runs.
//  • Delivery partners' own dispatch software: API keys and webhooks (partners ask through "Connect your system").
//  • The services behind ID/CAC checks and AI, and the public API the marketing website reads.

const when = (date: Date | null) => (date ? formatDate(date) : null);

export default async function AdminDevelopersPage(props: { searchParams?: Promise<{ partner?: string }> }) {
  const user = await requireAdminSection("developers");
  const partnerId = (await props.searchParams)?.partner ?? "";
  const korapay = korapayIdentityReady();

  const [partners, selected, idChecks, launch] = await Promise.all([
    db.logisticsPartner.findMany({
      orderBy: { displayName: "asc" },
      take: 300,
      select: { id: true, displayName: true, city: true, verificationStatus: true, _count: { select: { apiKeys: { where: { revokedAt: null } }, webhooks: true } } },
    }),
    partnerId
      ? db.logisticsPartner.findUnique({
          where: { id: partnerId },
          select: {
            id: true,
            displayName: true,
            verificationStatus: true,
            apiKeys: { orderBy: [{ revokedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }], take: 20, select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, revokedAt: true } },
            webhooks: {
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                url: true,
                events: true,
                active: true,
                lastStatus: true,
                lastDeliveredAt: true,
                // The retry queue: events still waiting for another try, and ones given up in the last 7 days.
                _count: {
                  select: {
                    deliveries: { where: { deliveredAt: null, failedAt: null, attempts: { gt: 0 } } },
                  },
                },
                deliveries: { where: { failedAt: { gte: new Date(Date.now() - 7 * 24 * 3_600_000) } }, select: { id: true }, take: 100 },
              },
            },
          },
        })
      : Promise.resolve(null),
    korapay ? korapayIdentityHealth() : youverifyHealth(),
    launchCheck(),
  ]);
  const connected = partners.filter((p) => p._count.apiKeys > 0 || p._count.webhooks > 0);
  const inviteCount = (process.env.SHOPINBOS_ADMIN_INVITE_EMAILS ?? "").split(",").map((email) => email.trim()).filter(Boolean).length;

  return (
    <AppPage frame={adminFrame(user, "Search")} title="Developers" sub="Software connections, API docs and the services behind checks and AI. Not needed for day-to-day work.">
      <section id="launch" aria-labelledby="launch-title" className="mb-8 scroll-mt-6">
        <h2 id="launch-title" className="m-0 text-[20px] font-extrabold">Launch settings</h2>
        <p className="mb-3 mt-1 max-w-[760px] text-[14.5px] text-app-ink-soft">Is this deployment ready for production: the keys it needs, and every scheduled job running.</p>
        <LaunchSettings {...launch} />
      </section>

      <section id="partners" aria-labelledby="partners-title" className="mb-8 scroll-mt-6">
        <h2 id="partners-title" className="m-0 text-[20px] font-extrabold">Delivery partners&apos; software</h2>
        <p className="mb-3 mt-1 max-w-[760px] text-[14.5px] text-app-ink-soft">
          For partners who asked to connect their own dispatch software (support conversations about &quot;Set something up for me&quot;). A new key is shown once.
        </p>
        <Card className="mb-4 p-4">
          <form action="/admin/developers" className="flex flex-wrap items-center gap-2">
            <label htmlFor="dev-partner" className="text-[13.5px] font-bold">Partner</label>
            <select id="dev-partner" name="partner" defaultValue={partnerId} className="min-h-[40px] min-w-[240px] flex-1 rounded-full border border-app-line bg-white px-3.5 text-[13.5px] font-bold">
              <option value="">Choose a delivery partner…</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName} · {p.city}{p._count.apiKeys || p._count.webhooks ? " · connected" : ""}
                </option>
              ))}
            </select>
            <button type="submit" className="min-h-[40px] rounded-full bg-app-ink px-4 text-[13.5px] font-bold text-white">Open</button>
          </form>
          {connected.length > 0 && (
            <p className="mb-0 mt-3 text-[13px] text-app-ink-soft">
              Connected: {connected.map((p, i) => (
                <span key={p.id}>{i > 0 ? ", " : ""}<Link href={`/admin/developers?partner=${p.id}`} className="font-bold text-app-ink underline">{p.displayName}</Link></span>
              ))}
            </p>
          )}
        </Card>
        {selected && (
          <div className="grid gap-5 xl:grid-cols-2">
            <ApiKeysPanel
              partnerId={selected.id}
              canCreate={selected.verificationStatus === "verified"}
              keys={selected.apiKeys.map((key) => ({ id: key.id, name: key.name, prefix: key.prefix, created: formatDate(key.createdAt), lastUsed: when(key.lastUsedAt), revoked: Boolean(key.revokedAt) }))}
            />
            <WebhooksPanel
              partnerId={selected.id}
              hooks={selected.webhooks.map((hook) => ({ id: hook.id, url: hook.url, events: hook.events, active: hook.active, lastStatus: hook.lastStatus, lastDelivered: when(hook.lastDeliveredAt), retrying: hook._count.deliveries, givenUp: hook.deliveries.length }))}
            />
          </div>
        )}
      </section>

      <section id="checks" aria-labelledby="checks-title" className="mb-8 scroll-mt-6">
        <h2 id="checks-title" className="mb-3 mt-0 text-[20px] font-extrabold">ID and CAC checks</h2>
        {korapay ? <KorapayChecksStatus health={idChecks as KorapayIdentityHealth} /> : <IdChecksStatus health={idChecks as YouverifyHealth} />}
        <CacChecksStatus providers={cacProviders()} />
      </section>

      <section id="ai" aria-labelledby="ai-title" className="mb-8 scroll-mt-6">
        <h2 id="ai-title" className="mb-3 mt-0 text-[20px] font-extrabold">AI (Rex and Peggy)</h2>
        <AiCheckCard claude={Boolean(process.env.ANTHROPIC_API_KEY)} openai={Boolean(process.env.OPENAI_API_KEY)} first={providerOrder()[0]!} />
      </section>

      <section id="platform" aria-labelledby="platform-title" className="scroll-mt-6">
        <h2 id="platform-title" className="mb-3 mt-0 text-[20px] font-extrabold">Platform</h2>
        <ListCard>
          <ListRow>
            <div className="min-w-0 flex-1 basis-[220px]">
              <div className="text-[15px] font-extrabold">Public marketplace API</div>
              <div className="text-[13px] text-app-ink-soft">The read-only API the marketing website uses. OpenAPI reference.</div>
            </div>
            <a href="/api/docs" className="font-mono text-[13px] text-app-ink underline">/api/docs</a>
          </ListRow>
          <ListRow>
            <div className="min-w-0 flex-1 basis-[220px]">
              <div className="text-[15px] font-extrabold">Website sync contract</div>
              <div className="text-[13px] text-app-ink-soft">How shopinbos.com reads marketplace data.</div>
            </div>
            <code className="rounded-[10px] bg-app-canvas px-2.5 py-1.5 font-mono text-[13px]">SHOPINBOS_APP_SYNC.md</code>
          </ListRow>
          <ListRow>
            <div className="min-w-0 flex-1 basis-[220px]">
              <div className="text-[15px] font-extrabold">Admin sign-up allowlist</div>
              <div className="text-[13px] text-app-ink-soft">Emails allowed to sign up as admin by themselves. Team members added on Admin › Team don&apos;t need it.</div>
            </div>
            <code className="rounded-[10px] bg-app-canvas px-2.5 py-1.5 font-mono text-[13px]">SHOPINBOS_ADMIN_INVITE_EMAILS</code>
            <Pill tone={inviteCount ? "success" : "muted"} dot>{inviteCount ? `${inviteCount} ${inviteCount === 1 ? "email" : "emails"}` : "Not set"}</Pill>
          </ListRow>
        </ListCard>
        <Card className="mt-4 p-5">
          <CardHead title="WhatsApp number setup" sub="Token, phone number ID, WABA ID and the webhook are on Admin › Leads › WhatsApp." />
        </Card>
      </section>
    </AppPage>
  );
}
