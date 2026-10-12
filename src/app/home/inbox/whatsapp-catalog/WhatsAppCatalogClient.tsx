"use client";

import { useState, type ReactNode } from "react";
import { Card, CardHead, Pill, PillLink, StatGrid, StatTile } from "@/components/app-kit";
import { Notice, PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { formatStamp, inboxApi } from "@/components/messaging/inbox-ui";
import type { CatalogOption, CatalogView, SyncSummary } from "@/lib/whatsapp-catalog/server";

// WhatsApp catalog page: connection state, the catalog the API sync uses (choose or create one), last sync and
// counts, per-product errors, and the token-protected feed URL for Commerce Manager (works without permissions).

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
  if (sync.status === "busy") return "A sync is already running. Refresh in a minute.";
  if (sync.status === "error") return sync.message ?? "The sync failed.";
  const parts = [`${sync.sent} sent`, `${sync.unchanged} unchanged`];
  if (sync.pending) parts.push(`${sync.pending} waiting for Meta`);
  if (sync.failed) parts.push(`${sync.failed} rejected`);
  return `Sync done: ${parts.join(", ")}.`;
}

export function WhatsAppCatalogClient({ initial, storeName }: { initial: CatalogView; storeName: string }) {
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [catalogs, setCatalogs] = useState<CatalogOption[] | null>(null);
  const [newName, setNewName] = useState(`${storeName} WhatsApp`);
  const [businessId, setBusinessId] = useState("");
  const [askBusiness, setAskBusiness] = useState(false);

  async function act(action: string, body: Record<string, unknown> = {}, done?: (result: ActionResult) => void, key = action) {
    setBusy(key);
    setMessage(null);
    try {
      const result = await inboxApi<ActionResult>(API, { method: "POST", body: JSON.stringify({ action, ...body }) });
      if (result.view) setView(result.view);
      done?.(result);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Something went wrong. Try again.";
      if (/Business ID/i.test(text)) setAskBusiness(true);
      setMessage({ tone: "error", text });
      // Permission problems are saved server side; reload the state so the page shows the fallback.
      inboxApi<CatalogView>(API).then(setView).catch(() => null);
    } finally {
      setBusy(null);
    }
  }

  const afterSync = (result: ActionResult) => {
    const notes = [...(result.warnings ?? [])];
    if (result.sync) notes.unshift(syncText(result.sync));
    const bad = result.sync?.status === "error" || (result.warnings?.length ?? 0) > 0;
    setMessage(notes.length ? { tone: bad ? "error" : "success", text: notes.join(" ") } : null);
  };

  const business = businessId.trim() ? { businessId: businessId.trim() } : {};
  const { catalog, counts, permissions } = view;
  const missing = permissions.state === "missing";

  return (
    <div className="grid min-w-0 gap-5">
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {!view.storeLive && (
        <Notice tone="info">Your store isn&apos;t live yet, so the catalog is empty. WhatsApp product links open your store: publish it first.</Notice>
      )}

      {/* Overview */}
      <StatGrid>
        <StatTile tone="card" label="WhatsApp" value={view.whatsapp.connected ? "Connected" : "Not connected"} hint={view.whatsapp.displayName ?? "Inbox → Peggy chatbot → WhatsApp"} className="[&>div:nth-child(2)]:text-[20px]" />
        <StatTile tone="card" label="In sync" value={counts.synced} hint={catalog.id ? `Last sync ${when(catalog.lastSyncAt)}` : "Not syncing by API"} />
        <StatTile tone="card" label="Waiting" value={counts.pending} hint={catalog.dirty ? "Changes queued" : "Sent, waiting for Meta"} />
        <StatTile tone="card" label="Need attention" value={counts.failed + counts.skipped} hint={`${counts.failed} rejected, ${counts.skipped} not sent`} />
      </StatGrid>

      <div className="grid min-w-0 gap-5 xl:grid-cols-2">
        {/* Direct sync */}
        <Card className="grid min-w-0 content-start gap-4 p-5">
          <CardHead
            title="Sync with the Meta API"
            sub="Products go straight to your catalog and update within minutes of a change."
            action={catalog.id ? <Pill tone={catalog.lastSyncStatus === "error" ? "danger" : catalog.lastSyncStatus === "partial" ? "warning" : "success"} dot>{catalog.lastSyncStatus === "error" ? "Sync failed" : catalog.lastSyncStatus === "partial" ? "Some rejected" : catalog.lastSyncAt ? "Syncing" : "Starting"}</Pill> : null}
          />

          {!view.whatsapp.connected ? (
            <div className="grid gap-3 rounded-[16px] bg-app-canvas p-4">
              <p className="m-0 text-[14px] leading-[1.55]">Connect your WhatsApp Business number first. You can still use the feed URL below without it.</p>
              <div><PillLink href="/home/inbox/chatbot?tab=whatsapp" icon="whatsapp" tone="ink" size="sm">Connect WhatsApp</PillLink></div>
            </div>
          ) : (
            <>
              {missing && (
                <Notice tone="error">
                  Your WhatsApp token doesn&apos;t have the <b>{(permissions.missing.length ? permissions.missing : ["catalog_management", "business_management"]).join(" and ")}</b> permission{permissions.missing.length === 1 ? "" : "s"}, so we can&apos;t manage your catalog directly. Use the feed URL below instead (it needs no extra permissions), or reconnect WhatsApp with a token that has them.
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
                  {catalog.lastSyncError && <Notice tone={catalog.lastSyncStatus === "error" ? "error" : "info"}>{catalog.lastSyncError}</Notice>}
                  <div className="flex flex-wrap gap-2">
                    <PillButton size="sm" busy={busy === "sync"} disabled={Boolean(busy)} onClick={() => act("sync", {}, afterSync)}>
                      <Icon name="refresh" size={14} /> Sync now
                    </PillButton>
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
        </Card>

        {/* Feed */}
        <Card className="grid min-w-0 content-start gap-4 p-5">
          <CardHead title="Product feed URL" sub="Works with any WhatsApp account, no extra permissions. Meta downloads it on a schedule." action={<Pill tone="info">{view.feed.listed} products</Pill>} />
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
                if (window.confirm("Make a new feed URL? The old one stops working: paste the new one into Commerce Manager.")) void act("rotate_token", {}, () => setMessage({ tone: "success", text: "New feed URL ready. Update it in Commerce Manager." }));
              }}
            >
              <Icon name="refresh" size={14} /> New URL
            </PillButton>
            <span className="text-[12.5px] text-app-ink-soft">{view.feed.rotatedAt ? `Last changed ${when(view.feed.rotatedAt)}` : "Change it if it has leaked."}</span>
          </div>
        </Card>
      </div>

      {/* Problems */}
      <Card className="grid min-w-0 gap-3 p-5">
        <CardHead title="Products that need attention" sub="Meta's reason for each rejected product, and products we didn't send." />
        {view.problems.length ? (
          <ul className="m-0 grid list-none divide-y divide-app-line p-0">
            {view.problems.map((problem) => (
              <li key={problem.productId} className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
                <span className="min-w-0 flex-1 basis-[220px]">
                  <a href={`/products/${problem.productId}`} className="block break-words text-[14px] font-semibold text-app-ink no-underline hover:underline">{problem.name}</a>
                  <span className="block break-words text-[13px] text-app-ink-soft">{problem.error ?? "Rejected by Meta"}</span>
                </span>
                <Pill tone={problem.status === "failed" ? "danger" : "muted"}>{problem.status === "failed" ? "Rejected" : "Not sent"}</Pill>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[14px] text-app-ink-soft">{catalog.id ? "Nothing to fix. Every product was accepted." : "Problems show here once you sync by API. For the feed, check Catalog → Issues in Commerce Manager."}</p>
        )}
      </Card>
    </div>
  );
}
