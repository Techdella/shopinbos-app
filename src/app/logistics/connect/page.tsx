import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { Card, CardHead, ListCard, ListRow, Pill, TextLink } from "@/components/app-kit";
import { PartnerPage } from "@/components/logistics/kit";

// "Connect your system": the partner API that already exists under /api/logistics.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connect your system" };

const ENDPOINTS = [
  { method: "GET", path: "/api/logistics/bookings", what: "Your jobs, newest first.", params: "?status=pending&page=1&limit=20" },
  { method: "PATCH", path: "/api/logistics/bookings/{id}/status", what: "Move a job on: accept, picked up, delivered, failed.", body: '{ "status": "picked_up", "trackingCode": "SD-1042", "estimatedDelivery": "2026-10-11T15:00:00Z" }' },
  { method: "GET", path: "/api/logistics/quotes", what: "Quote requests from sellers.", params: "?status=pending" },
  { method: "POST", path: "/api/logistics/quotes/{id}/respond", what: "Send your price for a quote request.", body: '{ "quotedPrice": 2500, "partnerResponse": "Pickup today before 3pm" }' },
  { method: "GET", path: "/api/logistics/me", what: "Your company profile and verification status." },
];

const STAGES = ["pending", "confirmed", "picked_up", "in_transit", "delivered", "failed", "cancelled"];

export default async function LogisticsConnectPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);

  return (
    <PartnerPage
      frame={{ user, partner }}
      title="Connect your system"
      sub="If you run your own dispatch software, it can read your Shopinbos jobs and update them, so your team doesn't type everything twice."
    >
      <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_400px]">
        <section aria-labelledby="endpoints" className="min-w-0">
          <h2 id="endpoints" className="m-0 mb-3 text-[18px] font-extrabold">What your system can do</h2>
          <ListCard>
            {ENDPOINTS.map((endpoint) => (
              <ListRow key={`${endpoint.method} ${endpoint.path}`} className="items-start">
                <span className="w-[64px] shrink-0"><Pill tone={endpoint.method === "GET" ? "info" : "accent"}>{endpoint.method}</Pill></span>
                <div className="min-w-0 flex-1">
                  <code className="block break-all font-mono text-[13.5px] font-bold">{endpoint.path}{endpoint.params ?? ""}</code>
                  <p className="m-0 mt-1 text-[14px] text-app-ink-soft">{endpoint.what}</p>
                  {endpoint.body && (
                    <pre className="m-0 mt-2 overflow-x-auto rounded-[12px] bg-app-canvas px-3 py-2 font-mono text-[12.5px] leading-[1.5]">{endpoint.body}</pre>
                  )}
                </div>
              </ListRow>
            ))}
          </ListCard>
        </section>

        <div className="grid min-w-0 content-start gap-5">
          <Card className="p-5">
            <CardHead title="Signing in" />
            <p className="m-0 mt-2 text-[14px] leading-[1.55] text-app-ink-soft">
              Every call needs your Shopinbos sign-in token in the header:
            </p>
            <pre className="m-0 mt-2 overflow-x-auto rounded-[12px] bg-app-canvas px-3 py-2 font-mono text-[12.5px]">Authorization: Bearer &lt;token&gt;</pre>
            <p className="m-0 mt-2 text-[14px] leading-[1.55] text-app-ink-soft">
              Your system gets the token by signing in as {partner.displayName}&apos;s account. Separate API keys aren&apos;t available yet.
            </p>
          </Card>

          <Card className="p-5">
            <CardHead title="Job stages" />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {STAGES.map((stage) => <code key={stage} className="rounded-full bg-app-canvas px-2.5 py-1 font-mono text-[12.5px]">{stage}</code>)}
            </div>
            <p className="m-0 mt-3 text-[14px] text-app-ink-soft">
              Replies come back as <code className="font-mono text-[13px]">{"{ data }"}</code> or <code className="font-mono text-[13px]">{"{ error: { code, message } }"}</code>.
            </p>
          </Card>

          <Card className="p-5">
            <CardHead title="Prefer doing it by hand?" />
            <p className="m-0 mt-2 text-[14px] text-app-ink-soft">Everything here can also be done on the Jobs page.</p>
            <div className="mt-2"><TextLink href="/logistics/bookings">Open jobs</TextLink></div>
          </Card>
        </div>
      </div>
    </PartnerPage>
  );
}
