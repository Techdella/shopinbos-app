import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { Card, CardHead, ListCard, ListRow, PillLink } from "@/components/app-kit";
import { PartnerPage, lagosDate, lagosTime } from "@/components/logistics/kit";
import { ApiKeysPanel, WebhooksPanel } from "./ConnectClient";

// "Connect your system" (prototype "Delivery partner API"): API keys, signed webhooks and the /v1/partner reference.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connect your system" };

const BASE = `${(process.env.NEXT_PUBLIC_APP_URL || "https://app.shopinbos.com").replace(/\/$/, "")}/api/v1/partner`;

const FEATURES = [
  { title: "Quote", text: "Your price and time per job" },
  { title: "Book", text: "Accept jobs automatically" },
  { title: "Track", text: "Live status to buyer and seller" },
  { title: "Settle", text: "Cash-on-delivery reconciled daily" },
];

const ENDPOINTS: Array<{ method: "GET" | "POST" | "PATCH"; path: string; what: string; body?: string }> = [
  { method: "GET", path: "/jobs?status=pending", what: "Your jobs, newest first. The buyer's name and phone appear once you've accepted a job." },
  { method: "GET", path: "/jobs/{id}", what: "One job." },
  { method: "POST", path: "/quotes", what: "Reply to a seller's quote request with your price, or decline it.", body: '{"quoteId":"QUOTE_ID","quotedPrice":2500,"message":"Pickup today before 3pm"}' },
  { method: "POST", path: "/jobs/{id}/accept", what: "Take an offered job. Optionally name the rider.", body: '{"riderId":"RIDER_ID"}' },
  { method: "PATCH", path: "/jobs/{id}/status", what: "picked_up, in_transit, delivered (with the buyer's code) or failed (with a reason).", body: '{"status":"delivered","code":"4821","cod":{"amount":18500,"method":"cash"}}' },
  { method: "PATCH", path: "/jobs/{id}/proof", what: "Attach a proof-of-delivery photo you host.", body: '{"photoUrl":"https://cdn.example.com/pod/1042.jpg"}' },
  { method: "POST", path: "/cod/remittances", what: "Record cash you paid in. It settles your oldest unpaid cash jobs first.", body: '{"amount":56000,"reference":"TRF-20261011-01"}' },
];

const WEBHOOK_EVENTS = ["job.offered", "job.cancelled", "job.updated", "cod.reminder"];

const VERIFY_SNIPPET = `import crypto from "node:crypto";

// rawBody: the request body exactly as received (a string, before JSON.parse)
export function verifyShopinbos(rawBody, header, secret) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const age = Math.abs(Date.now() / 1000 - Number(parts.t));
  if (!parts.v1 || age > 300) return false;
  const expected = crypto.createHmac("sha256", secret)
    .update(\`\${parts.t}.\${rawBody}\`).digest("hex");
  const a = Buffer.from(expected, "hex"), b = Buffer.from(parts.v1, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// const ok = verifyShopinbos(raw, req.headers["shopinbos-signature"], process.env.SHOPINBOS_WEBHOOK_SECRET);`;

const METHOD_TONE = { GET: "text-[#3D4FB8]", POST: "text-app-success", PATCH: "text-[#3D4FB8]" } as const;

function curl(endpoint: (typeof ENDPOINTS)[number]) {
  const lines = [`curl -X ${endpoint.method} "${BASE}${endpoint.path}"`, `  -H "Authorization: Bearer $SHOPINBOS_API_KEY"`];
  if (endpoint.body) lines.push(`  -H "Content-Type: application/json"`, `  -d '${endpoint.body}'`);
  return lines.join(" \\\n");
}

function when(date: Date | null) {
  return date ? `${lagosDate(date)}, ${lagosTime(date)}` : null;
}

export default async function LogisticsConnectPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);

  const [keys, hooks] = await Promise.all([
    db.partnerApiKey.findMany({
      where: { logisticsPartnerId: partner.id },
      orderBy: [{ revokedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
      take: 20,
      select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, revokedAt: true },
    }),
    db.partnerWebhook.findMany({
      where: { logisticsPartnerId: partner.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, url: true, events: true, active: true, lastStatus: true, lastDeliveredAt: true },
    }),
  ]);

  return (
    <PartnerPage
      frame={{ user, partner }}
      title="Connect your system"
      sub="Run your own dispatch software? Connect it once with an API key, and Shopinbos sends it jobs while you send back status, proof of delivery and cash collected."
      actions={<PillLink href="#keys" tone="ink" icon="lock">Get API keys</PillLink>}
    >
      <div className="grid gap-5">
        <Card className="overflow-hidden bg-linear-to-br from-app-peach via-white to-app-lilac p-5 sm:p-8">
          <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <h2 className="m-0 text-[30px] font-extrabold leading-[1.05] tracking-[-1px] sm:text-[40px]">Deliver for thousands of Nigerian shops</h2>
              <p className="mb-0 mt-3 max-w-[560px] text-[15px] leading-[1.6] text-app-ink-soft">
                Connect your dispatch app once. Shopinbos sends you jobs from sellers in your zones, and you send back status, proof of delivery and cash collected.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="rounded-[18px] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(22,20,31,0.06)]">
                  <h3 className="m-0 text-[15px] font-extrabold">{feature.title}</h3>
                  <p className="m-0 mt-0.5 text-[13.5px] text-app-ink-soft">{feature.text}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <div id="keys" className="grid scroll-mt-6 gap-5 xl:grid-cols-2">
          <ApiKeysPanel
            canCreate={partner.verificationStatus === "verified"}
            keys={keys.map((key) => ({
              id: key.id,
              name: key.name,
              prefix: key.prefix,
              created: lagosDate(key.createdAt, { day: "numeric", month: "short", year: "numeric" }),
              lastUsed: when(key.lastUsedAt),
              revoked: Boolean(key.revokedAt),
            }))}
          />
          <WebhooksPanel
            hooks={hooks.map((hook) => ({ id: hook.id, url: hook.url, events: hook.events, active: hook.active, lastStatus: hook.lastStatus, lastDelivered: when(hook.lastDeliveredAt) }))}
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="min-w-0 p-5">
            <CardHead title="Endpoints" />
            <ul className="m-0 mt-3 grid list-none gap-1.5 p-0 font-mono text-[13px]">
              {ENDPOINTS.map((endpoint) => (
                <li key={`${endpoint.method} ${endpoint.path}`} className="min-w-0 break-all">
                  <span className={`font-bold ${METHOD_TONE[endpoint.method]}`}>{endpoint.method}</span> /v1/partner{endpoint.path.split("?")[0]}
                </li>
              ))}
            </ul>
          </Card>
          <Card className="min-w-0 p-5">
            <CardHead title="Webhooks we send you" />
            <ul className="m-0 mt-3 grid list-none gap-1.5 p-0 font-mono text-[13px]">
              {WEBHOOK_EVENTS.map((event) => <li key={event}>{event}</li>)}
            </ul>
            <p className="mb-0 mt-3 text-[13.5px] leading-[1.55] text-app-ink-soft">
              Signed with your secret in the <code className="font-mono">Shopinbos-Signature</code> header (<code className="font-mono">t=…,v1=…</code>). A failed delivery is retried three times over about 45 seconds; if your endpoint is down longer, read the latest state from <code className="font-mono">GET /v1/partner/jobs</code>.
            </p>
          </Card>
        </div>

        <section className="rounded-[22px] bg-app-ink p-5 text-white sm:p-6">
          <h2 className="m-0 text-[18px] font-extrabold">Status you report</h2>
          <p className="mb-0 mt-2 text-[14.5px] leading-[1.6] text-white/80">
            picked_up → in_transit → delivered (with the buyer&apos;s 4-digit code) or failed (with a reason). For pay-on-delivery jobs, include the amount and whether it was cash or transfer.
          </p>
        </section>

        <section aria-labelledby="reference" className="min-w-0">
          <h2 id="reference" className="m-0 mb-1 text-[18px] font-extrabold">Reference</h2>
          <p className="m-0 mb-3 text-[14px] text-app-ink-soft">
            Base address <code className="break-all font-mono text-[13px]">{BASE}</code>. Replies are <code className="font-mono text-[13px]">{"{ data }"}</code> or <code className="font-mono text-[13px]">{"{ error: { code, message } }"}</code>. Up to 120 calls a minute per key.
          </p>
          <ListCard>
            {ENDPOINTS.map((endpoint) => (
              <ListRow key={`${endpoint.method} ${endpoint.path}`} className="items-start">
                <div className="min-w-0 flex-1">
                  <code className="block break-all font-mono text-[13.5px] font-bold">
                    <span className={METHOD_TONE[endpoint.method]}>{endpoint.method}</span> /v1/partner{endpoint.path}
                  </code>
                  <p className="m-0 mt-1 text-[14px] text-app-ink-soft">{endpoint.what}</p>
                  <pre className="m-0 mt-2 overflow-x-auto rounded-[12px] bg-app-canvas px-3 py-2 font-mono text-[12.5px] leading-[1.55]">{curl(endpoint)}</pre>
                </div>
              </ListRow>
            ))}
          </ListCard>
        </section>

        <Card className="min-w-0 p-5">
          <CardHead title="Check a webhook is from us (Node)" sub="Compute the HMAC over the timestamp and the raw body, then compare in constant time." />
          <pre className="m-0 mt-3 overflow-x-auto rounded-[12px] bg-app-canvas px-3 py-3 font-mono text-[12.5px] leading-[1.55]">{VERIFY_SNIPPET}</pre>
        </Card>

        <Card className="flex flex-wrap items-center gap-4 p-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/app/rex.png" alt="" className="h-14 w-14 shrink-0 object-contain" />
          <p className="m-0 min-w-[200px] flex-1 text-[14.5px] leading-[1.55]">
            <strong>No dispatch app?</strong> Your riders can use the free Shopinbos Riders app instead. Same jobs, same cash rules, paid weekly.
          </p>
          <PillLink href="/logistics/couriers">See the Riders app</PillLink>
        </Card>
      </div>
    </PartnerPage>
  );
}
