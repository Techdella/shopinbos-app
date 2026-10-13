"use client";

import { useState, type ReactNode } from "react";
import { Card, CardHead, Pill, PillLink, StatGrid, StatTile } from "@/components/app-kit";
import { Notice, PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { FEED_KEY_NOTICE } from "@/lib/social/feeds";
import { SetupHelpRequest } from "@/components/support/SetupHelpRequest";
import { TechFold } from "@/components/simple/Fold";
import { plainMetaError } from "@/components/simple/plain";
import { formatStamp, inboxApi } from "@/components/messaging/inbox-ui";
import type { CatalogOption, CatalogView, SyncSummary } from "@/lib/whatsapp-catalog/server";

// WhatsApp catalog page (simplicity rules, section 8A). The seller sees one plain status and one action: "Set it
// up now" when we can do it with their connected number, otherwise "Ask us to connect it" (SetupHelpRequest).
// The catalog the API sync uses (choose or create one), the token-protected feed URL, the key and Commerce
// Manager steps are behind "Show the technical details (for the person who manages your Facebook account)".

const API = "/api/app/whatsapp-catalog";
const input = "h-11 w-full min-w-0 rounded-[14px] border border-app-line bg-white px-3 text-[15px] outline-none focus:border-app-ink";

type ActionResult = { view?: CatalogView; warnings?: string[]; sync?: SyncSummary; catalogs?: CatalogOption[] };
type Message = { tone: "error" | "info" | "success"; text: string } | null;

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1">
      <span className="text-[12.5px] font-bold text-app-ink-soft">{label}</span>
      <div className="flex min-w-0 items-center gap-2 rounded-[12px] bg-app-canvas px-3 py-2">
        <code className="min-w-0 flex-1 break-all font-mono text-[12.5px]">{value}</code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            });
          }}
          aria-label={`Copy ${label}`}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-white"
        >
          <Icon name={copied ? "check" : "copy"} size={16} />
        </button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
      <span className="text-[14px] text-app-ink-soft">{label}</span>
      <span className="min-w-0 break-words text-right text-[14px] font-semibold">{children}</span>
    </div>
  );
}

const when = (iso: string | null) => (iso ? formatStamp(iso) : "Never");

function syncText(sync: SyncSummary) {
  if (sync.status === "busy") return "We're already sending your products. Refresh the page in a minute.";
  if (sync.status === "error") return plainMetaError(sync.message);
  const parts = [`${sync.sent} updated`, `${sync.unchanged} already up to date`];
  if (sync.pending) parts.push(`${sync.pending} waiting for WhatsApp to check`);
  if (sync.failed) parts.push(`${sync.failed} WhatsApp said no to (see below)`);
  return `Done: ${parts.join(", ")}.`;
}

/** Facebook permission and token problems in plain words; other messages are already plain. */
function plainError(text: string) {
  return /permission|token|oauth|\(#\d+\)|business id|catalog_management|business_management/i.test(text) ? plainMetaError(text) : text;
}

export function WhatsAppCatalogClient({ initial, storeName }: { initial: CatalogView; storeName: string }) {
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [catalogs, setCatalogs] = useState<CatalogOption[] | null>(null);
  const [newName, setNewName] = useState(`${storeName} WhatsApp`);
  const [businessId, setBusinessId] = useState("");
  const [askBusiness, setAskBusiness] = useState(false);
  const [askTeam, setAskTeam] = useState(false);

  async function act(action: string, body: Record<string, unknown> = {}, done?: (result: ActionResult) => void, key = action) {
    setBusy(key);
    setMessage(null);
    try {
      const result = await inboxApi<ActionResult>(API, { method: "POST", body: JSON.stringify({ action, ...body }) });
      if (result.view) setView(result.view);
      done?.(result);
    } catch (error) {
      const text = error instanceof Error ? error.message : "We couldn't do that just now. Check your connection and try again.";
      if (/Business ID/i.test(text)) setAskBusiness(true);
      setMessage({ tone: "error", text: plainError(text) });
      // Permission problems are saved server side; reload the state so the page shows the fallback.
      inboxApi<CatalogView>(API).then(setView).catch(() => null);
    } finally {
      setBusy(null);
    }
  }

  const afterSync = (result: ActionResult) => {
    const notes = (result.warnings ?? []).map(plainError);
    if (result.sync) notes.unshift(syncText(result.sync));
    const bad = result.sync?.status === "error" || (result.warnings?.length ?? 0) > 0;
    setMessage(notes.length ? { tone: bad ? "error" : "success", text: notes.join(" ") } : null);
  };

  const business = businessId.trim() ? { businessId: businessId.trim() } : {};
  const { catalog, counts, permissions } = view;
  const missing = permissions.state === "missing";
  const linked = Boolean(catalog.id && catalog.linkedToWhatsApp && catalog.cartEnabled && catalog.catalogVisible);
  const syncFailed = Boolean(catalog.id) && catalog.lastSyncStatus === "error";
  const showing = linked && !syncFailed;
  const canDoItNow = view.whatsapp.connected && !catalog.id && !missing && view.storeLive;

  return (
    <div className="grid min-w-0 gap-5">
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {!view.storeLive && (
        <Notice tone="info">Your store isn&apos;t live yet, so the catalog is empty. WhatsApp product links open your store: publish it first.</Notice>
      )}

      {/* What the seller sees: one status, one action */}
      <Card className="grid min-w-0 gap-4 p-5">
        <div className="flex flex-wrap items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#25D366] text-white" aria-hidden="true"><Icon name="whatsapp" size={22} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[20px] font-extrabold leading-tight">{showing ? "Your products are showing on WhatsApp" : "Show my products on WhatsApp"}</h2>
            <p className="mb-0 mt-1 text-[15px] leading-[1.5] text-app-ink-soft">
              {showing
                ? "Customers can look through your products in your WhatsApp chat and send you an order. Changes to your products go there by themselves."
                : "Customers look through your products inside WhatsApp and send you the order without leaving the chat."}
            </p>
          </div>
          {catalog.id && <Pill tone={syncFailed ? "danger" : showing ? "success" : "warning"} dot>{syncFailed ? "Needs your help" : showing ? "Showing" : "Almost ready"}</Pill>}
        </div>

        {catalog.id && (
          <StatGrid>
            <StatTile label="Showing" value={counts.synced} hint={catalog.lastSyncAt ? `Updated ${when(catalog.lastSyncAt)}` : "Starting"} />
            <StatTile label="Waiting for WhatsApp to check" value={counts.pending} hint="Usually a few minutes" />
            <StatTile label="Need fixing" value={counts.failed + counts.skipped} hint={counts.failed + counts.skipped ? "See the list below" : "Nothing to fix"} />
          </StatGrid>
        )}

        {syncFailed && catalog.lastSyncError && <Notice>{plainMetaError(catalog.lastSyncError)}</Notice>}
        {missing && <Notice tone="info">We need your permission on Facebook to do this. Ask us to help and we&apos;ll sort it out with you.</Notice>}

        {canDoItNow && (
          <div className="grid gap-2">
            <PillButton size="lg" busy={busy === "create_catalog"} disabled={Boolean(busy)} onClick={() => act("create_catalog", { name: newName.trim() || `${storeName} WhatsApp` }, afterSync)} className="w-full sm:w-auto">
              Set it up now
            </PillButton>
            <p className="m-0 text-[13.5px] text-app-ink-soft">Uses the WhatsApp number you connected{view.whatsapp.displayName ? ` (${view.whatsapp.displayName})` : ""}. Takes about a minute.</p>
          </div>
        )}
        {showing && (
          <div className="flex flex-wrap gap-2">
            <PillButton size="md" tone="white" busy={busy === "sync"} disabled={Boolean(busy)} onClick={() => act("sync", {}, afterSync)}>
              <Icon name="refresh" size={14} /> Send my products now
            </PillButton>
          </div>
        )}

        {!showing && !canDoItNow && (
          <SetupHelpRequest
            title="Connect my products to WhatsApp"
            description={view.whatsapp.connected ? "We'll connect your products to your WhatsApp number for you and tell you when they're showing." : "We'll connect your WhatsApp Business number and your products for you, and tell you when they're showing. Put the number customers message below."}
            feature="whatsapp_catalog"
          />
        )}
        {(showing || canDoItNow) && !askTeam && (
          <button type="button" onClick={() => setAskTeam(true)} className="min-h-[44px] justify-self-start text-[14.5px] font-bold text-app-ink underline underline-offset-4">Ask us to connect it instead</button>
        )}
        {(showing || canDoItNow) && askTeam && (
          <SetupHelpRequest title="Check my products on WhatsApp" description="We'll check your WhatsApp products and fix anything for you." feature="whatsapp_catalog" />
        )}
      </Card>

      <TechFold forWho="the person who manages your Facebook account">
        <div className="grid min-w-0 gap-5">
          <div className="grid gap-x-6 divide-y divide-app-line sm:grid-cols-2 sm:divide-y-0">
            <Row label="WhatsApp">{view.whatsapp.connected ? "Connected" : "Not connected"}</Row>
            <Row label="In sync">{counts.synced}</Row>
            <Row label="Waiting for Meta">{counts.pending}{catalog.dirty ? " (changes queued)" : ""}</Row>
            <Row label="Need attention">{`${counts.failed} rejected, ${counts.skipped} not sent`}</Row>
          </div>
          <div className="grid min-w-0 gap-5 xl:grid-cols-2">
            <section className="grid min-w-0 content-start gap-4">
              <CardHead
                title="Sync with the Meta API"
                sub="Products go straight to the catalog and update within minutes of a change."
                action={catalog.id ? <Pill tone={catalog.lastSyncStatus === "error" ? "danger" : catalog.lastSyncStatus === "partial" ? "warning" : "success"} dot>{catalog.lastSyncStatus === "error" ? "Last sync didn't work" : catalog.lastSyncStatus === "partial" ? "Some rejected" : catalog.lastSyncAt ? "Syncing" : "Starting"}</Pill> : null}
              />
          {!view.whatsapp.connected ? (
              <div className="grid gap-3 rounded-[16px] bg-app-canvas p-4">
                <p className="m-0 text-[14px] leading-[1.55]">Connect the WhatsApp Business number first. The feed URL below works without it.</p>
                <div><PillLink href="/home/inbox/chatbot?tab=whatsapp" icon="whatsapp" tone="ink" size="sm">Connect WhatsApp</PillLink></div>
              </div>
            ) : (
              <>
                {missing && (
                  <Notice tone="info">
                    The token is missing <b>{(permissions.missing.length ? permissions.missing : ["catalog_management", "business_management"]).join(" and ")}</b>. Use the feed URL below instead (it needs no extra permissions), or reconnect WhatsApp with a token that has them.
                  </Notice>
                )}

                {catalog.id ? (
                  <>
                    <div className="divide-y divide-app-line">
                      <Row label="Catalog">{catalog.name ?? catalog.id}</Row>
                      <Row label="Catalog ID"><span className="break-all font-mono text-[12.5px]">{catalog.id}</span></Row>
                      <Row label="Linked to your WhatsApp">{catalog.linkedToWhatsApp ? <Pill tone="success">Yes</Pill> : <Pill tone="warning">No</Pill>}</Row>
                      <Row label="Cart and catalog in chats">{catalog.cartEnabled && catalog.catalogVisible ? <Pill tone="success">On</Pill> : <Pill tone="warning">Off</Pill>}</Row>
                      <Row label="Last sync">{catalog.syncing ? "Running now" : when(catalog.lastSyncAt)}</Row>
                    </div>
                    {catalog.lastSyncError && <Notice tone="info">{catalog.lastSyncError}</Notice>}
                    <div className="flex flex-wrap gap-2">
                      {!(catalog.linkedToWhatsApp && catalog.cartEnabled && catalog.catalogVisible) && (
                        <PillButton size="sm" tone="white" busy={busy === "relink"} disabled={Boolean(busy)} onClick={() => act("relink", {}, afterSync)}>
                          <Icon name="link" size={14} /> Link to WhatsApp again
                        </PillButton>
                      )}
                      <PillButton size="sm" tone="white" busy={busy === "full"} disabled={Boolean(busy)} onClick={() => act("sync", { full: true }, afterSync, "full")}>
                        Resend all products
                      </PillButton>
                      <PillButton
                        size="sm"
                        tone="ghost"
                        busy={busy === "disconnect"}
                        disabled={Boolean(busy)}
                        onClick={() => {
                          if (window.confirm("Stop syncing to this catalog? The catalog and its products stay in Meta.")) void act("disconnect");
                        }}
                      >
                        Stop syncing
                      </PillButton>
                    </div>
                  </>
                ) : (
                  <div className="grid gap-4">
                    <p className="m-0 text-[14px] leading-[1.55] text-app-ink-soft">
                      Needs a token with <b className="text-app-ink">catalog_management</b> and <b className="text-app-ink">business_management</b>. We&apos;ll link the catalog to your number and switch on the cart.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <PillButton size="sm" tone="white" busy={busy === "check_permissions"} disabled={Boolean(busy)} onClick={() => act("check_permissions", {}, () => setMessage(null))}>
                        <Icon name="shield" size={14} /> Check permissions
                      </PillButton>
                      <PillButton size="sm" busy={busy === "list_catalogs"} disabled={Boolean(busy)} onClick={() => act("list_catalogs", business, (r) => setCatalogs(r.catalogs ?? []))}>
                        <Icon name="search" size={14} /> Find my catalogs
                      </PillButton>
                    </div>
                    {permissions.state === "ok" && <Notice tone="success">Your token has the permissions catalogs need.</Notice>}
                    {permissions.state === "unknown" && permissions.checkedAt && <Notice tone="info">Meta didn&apos;t say which permissions your token has. Try finding your catalogs: we&apos;ll tell you if Meta refuses.</Notice>}

                    {askBusiness && (
                      <label className="grid gap-1">
                        <span className="text-[12.5px] font-bold text-app-ink-soft">Meta Business ID</span>
                        <input className={input} inputMode="numeric" value={businessId} onChange={(e) => setBusinessId(e.target.value)} placeholder="From Business Settings → Business info" />
                      </label>
                    )}

                    {catalogs && (
                      <div className="grid gap-2">
                        <span className="text-[12.5px] font-bold text-app-ink-soft">{catalogs.length ? "Your catalogs" : "No catalogs yet in this business"}</span>
                        {catalogs.map((option) => (
                          <div key={option.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-[14px] border border-app-line px-3 py-2.5">
                            <span className="min-w-0">
                              <span className="block break-words text-[14px] font-semibold">{option.name}</span>
                              <span className="block break-all font-mono text-[12px] text-app-ink-soft">{option.id}{option.productCount !== null ? ` · ${option.productCount} products` : ""}</span>
                            </span>
                            <PillButton size="sm" tone="white" busy={busy === `select:${option.id}`} disabled={Boolean(busy)} onClick={() => act("select_catalog", { catalogId: option.id }, afterSync, `select:${option.id}`)}>
                              Use this
                            </PillButton>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="grid gap-2 rounded-[16px] bg-app-canvas p-4">
                      <span className="text-[14px] font-bold">Or create a new catalog</span>
                      <div className="flex min-w-0 flex-wrap gap-2">
                        <input className={`${input} flex-1 basis-[200px]`} value={newName} maxLength={100} onChange={(e) => setNewName(e.target.value)} aria-label="New catalog name" />
                        <PillButton size="sm" busy={busy === "create_catalog"} disabled={Boolean(busy) || newName.trim().length < 2} onClick={() => act("create_catalog", { name: newName.trim(), ...business }, afterSync)} className="min-h-[44px]">
                          <Icon name="plus" size={14} /> Create and sync
                        </PillButton>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            </section>

            <section className="grid min-w-0 content-start gap-4">
              <CardHead title="Product feed URL" sub="Works with any WhatsApp account, no extra permissions. Meta downloads it on a schedule." action={<Pill tone="info">{view.feed.listed} products</Pill>} />
          <p role="note" className="m-0 rounded-[12px] border border-[#F2A93B]/40 bg-[#FDF0D5] px-3 py-2 text-[13px] text-[#5C3D00]">
              <b>{FEED_KEY_NOTICE}</b> The key below is also in your Google, Facebook and TikTok feed links on Sell everywhere.
            </p>
            <CopyRow label="Feed URL (keep it private)" value={view.feed.url} />
            <div className="divide-y divide-app-line">
              <Row label="Last downloaded by Meta">{when(view.feed.fetchedAt)}</Row>
              <Row label="Products left out">{view.feed.skipped ? `${view.feed.skipped} (no photo or price)` : "None"}</Row>
            </div>
            <details className="rounded-[16px] bg-app-canvas p-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[14px] font-bold">
                How to add it in Commerce Manager <Icon name="chevDown" size={16} />
              </summary>
              <ol className="mb-0 mt-3 grid list-decimal gap-2 pl-5 text-[14px] leading-[1.55] marker:font-bold">
                <li>Open <b>Meta Commerce Manager</b> (business.facebook.com/commerce) and choose your catalog, or create one (type: <b>Online products</b>).</li>
                <li>Go to <b>Catalog → Data sources → Add items → Data feed</b>.</li>
                <li>Choose <b>Scheduled feed</b>, paste the feed URL above, and set it to update <b>every hour</b> or <b>daily</b>. Currency: your store&apos;s currency.</li>
                <li>In <b>WhatsApp Manager → Catalog</b>, connect that catalog to your WhatsApp number, and turn on <b>Show catalog</b> and <b>Add to cart</b>.</li>
                <li>Meta reviews new products (usually minutes, up to a day). Rejected items show under <b>Catalog → Issues</b>.</li>
              </ol>
            </details>
            <div className="flex flex-wrap items-center gap-2">
              <PillButton
                size="sm"
                tone="white"
                busy={busy === "rotate_token"}
                disabled={Boolean(busy)}
                onClick={() => {
                  if (window.confirm("Make a new private feed key? Every feed link stops working (this WhatsApp feed and your Google, Facebook and TikTok feeds): paste the new links into Commerce Manager, Merchant Center and TikTok.")) void act("rotate_token", {}, () => setMessage({ tone: "success", text: "New feed key ready. Update the links in Commerce Manager, Merchant Center and TikTok." }));
                }}
              >
                <Icon name="refresh" size={14} /> New link
              </PillButton>
              <span className="text-[12.5px] text-app-ink-soft">{view.feed.rotatedAt ? `Last changed ${when(view.feed.rotatedAt)}` : "Change it if it has leaked."}</span>
            </div>
            </section>
          </div>
        </div>
      </TechFold>

      {/* Problems */}
      <Card className="grid min-w-0 gap-3 p-5">
        <CardHead title="Products to fix" sub="Why WhatsApp said no to a product, or why we didn't send it. Tap a product to fix it." />
        {view.problems.length ? (
          <ul className="m-0 grid list-none divide-y divide-app-line p-0">
            {view.problems.map((problem) => (
              <li key={problem.productId} className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
                <span className="min-w-0 flex-1 basis-[220px]">
                  <a href={`/products/${problem.productId}`} className="block break-words text-[14px] font-semibold text-app-ink no-underline hover:underline">{problem.name}</a>
                  <span className="block break-words text-[13px] text-app-ink-soft">{problem.error ?? "WhatsApp said no to this product. Check its photo, name and price."}</span>
                </span>
                <Pill tone={problem.status === "failed" ? "danger" : "muted"}>{problem.status === "failed" ? "WhatsApp said no" : "Not sent"}</Pill>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[14px] text-app-ink-soft">{catalog.id ? "Nothing to fix. WhatsApp accepted every product." : "Anything to fix shows here once your products are on WhatsApp."}</p>
        )}
      </Card>
    </div>
  );
}
