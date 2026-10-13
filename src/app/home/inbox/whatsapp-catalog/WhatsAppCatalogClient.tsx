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
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import type { Locale, TFunction } from "@shared/i18n";
import type { MessageKey } from "@shared/i18n/catalog";

type InboxT = TFunction<MessageKey<"inbox"> | MessageKey<"common">>;

// WhatsApp catalog page (simplicity rules, section 8A). The seller sees one plain status and one action: "Set it
// up now" when we can do it with their connected number, otherwise "Ask us to connect it" (SetupHelpRequest).
// The catalog the API sync uses (choose or create one), the token-protected feed URL, the key and Commerce
// Manager steps are behind "Show the technical details (for the person who manages your Facebook account)".

const API = "/api/app/whatsapp-catalog";
const input = "h-11 w-full min-w-0 rounded-[14px] border border-app-line bg-white px-3 text-[15px] outline-none focus:border-app-ink";

type ActionResult = { view?: CatalogView; warnings?: string[]; sync?: SyncSummary; catalogs?: CatalogOption[] };
type Message = { tone: "error" | "info" | "success"; text: string } | null;

function CopyRow({ label, value }: { label: string; value: string }) {
  const t = useT("inbox");
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
          aria-label={t("ch.copy", { label })}
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

const when = (iso: string | null, t: InboxT, locale: Locale) => (iso ? formatStamp(iso, locale) : t("wa.never"));

function syncText(sync: SyncSummary, t: InboxT) {
  if (sync.status === "busy") return t("cat.busy");
  if (sync.status === "error") return plainMetaError(sync.message);
  const parts = [t("cat.sent", { count: sync.sent }), t("cat.unchanged", { count: sync.unchanged })];
  if (sync.pending) parts.push(t("cat.pendingN", { count: sync.pending }));
  if (sync.failed) parts.push(t("cat.failedN", { count: sync.failed }));
  return t("cat.done", { parts: parts.join(", ") });
}

/** Facebook permission and token problems in plain words; other messages are already plain. */
function plainError(text: string) {
  return /permission|token|oauth|\(#\d+\)|business id|catalog_management|business_management/i.test(text) ? plainMetaError(text) : text;
}

export function WhatsAppCatalogClient({ initial, storeName }: { initial: CatalogView; storeName: string }) {
  const t = useT("inbox", "common");
  const locale = useLocale();
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
      const text = error instanceof Error ? error.message : t("cat.failed");
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
    if (result.sync) notes.unshift(syncText(result.sync, t));
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
        <Notice tone="info">{t("cat.notLive")}</Notice>
      )}

      {/* What the seller sees: one status, one action */}
      <Card className="grid min-w-0 gap-4 p-5">
        <div className="flex flex-wrap items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#25D366] text-white" aria-hidden="true"><Icon name="whatsapp" size={22} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[20px] font-extrabold leading-tight">{showing ? t("cat.showingTitle") : t("cat.showTitle")}</h2>
            <p className="mb-0 mt-1 text-[15px] leading-[1.5] text-app-ink-soft">
              {showing
                ? t("cat.showingSub")
                : t("cat.sub")}
            </p>
          </div>
          {catalog.id && <Pill tone={syncFailed ? "danger" : showing ? "success" : "warning"} dot>{syncFailed ? t("cat.needsHelp") : showing ? t("cat.showing") : t("cat.almost")}</Pill>}
        </div>

        {catalog.id && (
          <StatGrid>
            <StatTile label={t("cat.showing")} value={counts.synced} hint={catalog.lastSyncAt ? t("cat.updated", { when: when(catalog.lastSyncAt, t, locale) }) : t("cat.starting")} />
            <StatTile label={t("cat.waitingCheck")} value={counts.pending} hint={t("cat.fewMinutes")} />
            <StatTile label={t("cat.needFixing")} value={counts.failed + counts.skipped} hint={counts.failed + counts.skipped ? t("cat.seeList") : t("cat.nothingToFix")} />
          </StatGrid>
        )}

        {syncFailed && catalog.lastSyncError && <Notice>{plainMetaError(catalog.lastSyncError)}</Notice>}
        {missing && <Notice tone="info">{t("cat.needPermission")}</Notice>}

        {canDoItNow && (
          <div className="grid gap-2">
            <PillButton size="lg" busy={busy === "create_catalog"} disabled={Boolean(busy)} onClick={() => act("create_catalog", { name: newName.trim() || `${storeName} WhatsApp` }, afterSync)} className="w-full sm:w-auto">
              {t("cat.setUpNow")}
            </PillButton>
            <p className="m-0 text-[13.5px] text-app-ink-soft">{view.whatsapp.displayName ? t("cat.usesNumberNamed", { name: view.whatsapp.displayName }) : t("cat.usesNumber")}</p>
          </div>
        )}
        {showing && (
          <div className="flex flex-wrap gap-2">
            <PillButton size="md" tone="white" busy={busy === "sync"} disabled={Boolean(busy)} onClick={() => act("sync", {}, afterSync)}>
              <Icon name="refresh" size={14} /> {t("cat.sendNow")}
            </PillButton>
          </div>
        )}

        {!showing && !canDoItNow && (
          <SetupHelpRequest
            title={t("cat.helpTitle")}
            description={view.whatsapp.connected ? t("cat.helpDescConnected") : t("cat.helpDesc")}
            feature="whatsapp_catalog"
          />
        )}
        {(showing || canDoItNow) && !askTeam && (
          <button type="button" onClick={() => setAskTeam(true)} className="min-h-[44px] justify-self-start text-[14.5px] font-bold text-app-ink underline underline-offset-4">{t("cat.askInstead")}</button>
        )}
        {(showing || canDoItNow) && askTeam && (
          <SetupHelpRequest title={t("cat.checkTitle")} description={t("cat.checkDesc")} feature="whatsapp_catalog" />
        )}
      </Card>

      <TechFold forWho={t("wa.forWhoFacebook")}>
        <div className="grid min-w-0 gap-5">
          <div className="grid gap-x-6 divide-y divide-app-line sm:grid-cols-2 sm:divide-y-0">
            <Row label="WhatsApp">{view.whatsapp.connected ? t("ch.connected") : t("ch.notConnected")}</Row>
            <Row label={t("cat.inSync")}>{counts.synced}</Row>
            <Row label={t("cat.waitingMeta")}>{counts.pending}{catalog.dirty ? t("cat.queued") : ""}</Row>
            <Row label={t("cat.needAttention")}>{t("cat.rejectedSkipped", { failed: String(counts.failed), skipped: String(counts.skipped) })}</Row>
          </div>
          <div className="grid min-w-0 gap-5 xl:grid-cols-2">
            <section className="grid min-w-0 content-start gap-4">
              <CardHead
                title={t("cat.apiTitle")}
                sub={t("cat.apiSub")}
                action={catalog.id ? <Pill tone={catalog.lastSyncStatus === "error" ? "danger" : catalog.lastSyncStatus === "partial" ? "warning" : "success"} dot>{catalog.lastSyncStatus === "error" ? t("cat.lastSyncBad") : catalog.lastSyncStatus === "partial" ? t("cat.someRejected") : catalog.lastSyncAt ? t("cat.syncing") : t("cat.starting")}</Pill> : null}
              />
          {!view.whatsapp.connected ? (
              <div className="grid gap-3 rounded-[16px] bg-app-canvas p-4">
                <p className="m-0 text-[14px] leading-[1.55]">{t("cat.connectFirst")}</p>
                <div><PillLink href="/home/inbox/chatbot?tab=whatsapp" icon="whatsapp" tone="ink" size="sm">{t("cat.connectWa")}</PillLink></div>
              </div>
            ) : (
              <>
                {missing && (
                  <Notice tone="info">
                    {t("cat.tokenMissing")} <b>{(permissions.missing.length ? permissions.missing : ["catalog_management", "business_management"]).join(" + ")}</b>. {t("cat.tokenMissingAfter")}
                  </Notice>
                )}

                {catalog.id ? (
                  <>
                    <div className="divide-y divide-app-line">
                      <Row label={t("cat.catalog")}>{catalog.name ?? catalog.id}</Row>
                      <Row label={t("cat.catalogId")}><span className="break-all font-mono text-[12.5px]">{catalog.id}</span></Row>
                      <Row label={t("cat.linked")}>{catalog.linkedToWhatsApp ? <Pill tone="success">{t("yes")}</Pill> : <Pill tone="warning">{t("no")}</Pill>}</Row>
                      <Row label={t("cat.cart")}>{catalog.cartEnabled && catalog.catalogVisible ? <Pill tone="success">{t("cat.on")}</Pill> : <Pill tone="warning">{t("ch.off")}</Pill>}</Row>
                      <Row label={t("cat.lastSync")}>{catalog.syncing ? t("cat.running") : when(catalog.lastSyncAt, t, locale)}</Row>
                    </div>
                    {catalog.lastSyncError && <Notice tone="info">{catalog.lastSyncError}</Notice>}
                    <div className="flex flex-wrap gap-2">
                      {!(catalog.linkedToWhatsApp && catalog.cartEnabled && catalog.catalogVisible) && (
                        <PillButton size="sm" tone="white" busy={busy === "relink"} disabled={Boolean(busy)} onClick={() => act("relink", {}, afterSync)}>
                          <Icon name="link" size={14} /> {t("cat.relink")}
                        </PillButton>
                      )}
                      <PillButton size="sm" tone="white" busy={busy === "full"} disabled={Boolean(busy)} onClick={() => act("sync", { full: true }, afterSync, "full")}>
                        {t("cat.resend")}
                      </PillButton>
                      <PillButton
                        size="sm"
                        tone="ghost"
                        busy={busy === "disconnect"}
                        disabled={Boolean(busy)}
                        onClick={() => {
                          if (window.confirm(t("cat.stopConfirm"))) void act("disconnect");
                        }}
                      >
                        {t("cat.stop")}
                      </PillButton>
                    </div>
                  </>
                ) : (
                  <div className="grid gap-4">
                    <p className="m-0 text-[14px] leading-[1.55] text-app-ink-soft">
                      {t("cat.needsToken")} <b className="text-app-ink">catalog_management</b> + <b className="text-app-ink">business_management</b>. {t("cat.needsTokenAfter")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <PillButton size="sm" tone="white" busy={busy === "check_permissions"} disabled={Boolean(busy)} onClick={() => act("check_permissions", {}, () => setMessage(null))}>
                        <Icon name="shield" size={14} /> {t("cat.checkPerms")}
                      </PillButton>
                      <PillButton size="sm" busy={busy === "list_catalogs"} disabled={Boolean(busy)} onClick={() => act("list_catalogs", business, (r) => setCatalogs(r.catalogs ?? []))}>
                        <Icon name="search" size={14} /> {t("cat.find")}
                      </PillButton>
                    </div>
                    {permissions.state === "ok" && <Notice tone="success">{t("cat.permsOk")}</Notice>}
                    {permissions.state === "unknown" && permissions.checkedAt && <Notice tone="info">{t("cat.permsUnknown")}</Notice>}

                    {askBusiness && (
                      <label className="grid gap-1">
                        <span className="text-[12.5px] font-bold text-app-ink-soft">{t("cat.businessId")}</span>
                        <input className={input} inputMode="numeric" value={businessId} onChange={(e) => setBusinessId(e.target.value)} placeholder={t("cat.businessIdHint")} />
                      </label>
                    )}

                    {catalogs && (
                      <div className="grid gap-2">
                        <span className="text-[12.5px] font-bold text-app-ink-soft">{catalogs.length ? t("cat.yours") : t("cat.noneYet")}</span>
                        {catalogs.map((option) => (
                          <div key={option.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-[14px] border border-app-line px-3 py-2.5">
                            <span className="min-w-0">
                              <span className="block break-words text-[14px] font-semibold">{option.name}</span>
                              <span className="block break-all font-mono text-[12px] text-app-ink-soft">{option.id}{option.productCount !== null ? ` · ${t("cat.productCount", { count: option.productCount })}` : ""}</span>
                            </span>
                            <PillButton size="sm" tone="white" busy={busy === `select:${option.id}`} disabled={Boolean(busy)} onClick={() => act("select_catalog", { catalogId: option.id }, afterSync, `select:${option.id}`)}>
                              {t("cat.useThis")}
                            </PillButton>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="grid gap-2 rounded-[16px] bg-app-canvas p-4">
                      <span className="text-[14px] font-bold">{t("cat.orCreate")}</span>
                      <div className="flex min-w-0 flex-wrap gap-2">
                        <input className={`${input} flex-1 basis-[200px]`} value={newName} maxLength={100} onChange={(e) => setNewName(e.target.value)} aria-label={t("cat.newName")} />
                        <PillButton size="sm" busy={busy === "create_catalog"} disabled={Boolean(busy) || newName.trim().length < 2} onClick={() => act("create_catalog", { name: newName.trim(), ...business }, afterSync)} className="min-h-[44px]">
                          <Icon name="plus" size={14} /> {t("cat.createSync")}
                        </PillButton>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            </section>

            <section className="grid min-w-0 content-start gap-4">
              <CardHead title={t("cat.feedTitle")} sub={t("cat.feedSub")} action={<Pill tone="info">{t("cat.productCount", { count: view.feed.listed })}</Pill>} />
          <p role="note" className="m-0 rounded-[12px] border border-[#F2A93B]/40 bg-[#FDF0D5] px-3 py-2 text-[13px] text-[#5C3D00]">
              <b>{FEED_KEY_NOTICE}</b> {t("cat.keyAlso")}
            </p>
            <CopyRow label={t("cat.feedUrl")} value={view.feed.url} />
            <div className="divide-y divide-app-line">
              <Row label={t("cat.lastDownloaded")}>{when(view.feed.fetchedAt, t, locale)}</Row>
              <Row label={t("cat.leftOut")}>{view.feed.skipped ? t("cat.leftOutN", { count: String(view.feed.skipped) }) : t("wa.none")}</Row>
            </div>
            <details className="rounded-[16px] bg-app-canvas p-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[14px] font-bold">
                {t("cat.howTo")} <Icon name="chevDown" size={16} />
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
                  if (window.confirm(t("cat.rotateConfirm"))) void act("rotate_token", {}, () => setMessage({ tone: "success", text: t("cat.rotated") }));
                }}
              >
                <Icon name="refresh" size={14} /> {t("cat.newLink")}
              </PillButton>
              <span className="text-[12.5px] text-app-ink-soft">{view.feed.rotatedAt ? t("cat.lastChanged", { when: when(view.feed.rotatedAt, t, locale) }) : t("cat.changeIfLeaked")}</span>
            </div>
            </section>
          </div>
        </div>
      </TechFold>

      {/* Problems */}
      <Card className="grid min-w-0 gap-3 p-5">
        <CardHead title={t("cat.toFix")} sub={t("cat.toFixSub")} />
        {view.problems.length ? (
          <ul className="m-0 grid list-none divide-y divide-app-line p-0">
            {view.problems.map((problem) => (
              <li key={problem.productId} className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
                <span className="min-w-0 flex-1 basis-[220px]">
                  <a href={`/products/${problem.productId}`} className="block break-words text-[14px] font-semibold text-app-ink no-underline hover:underline">{problem.name}</a>
                  <span className="block break-words text-[13px] text-app-ink-soft">{problem.error ?? t("cat.saidNoProduct")}</span>
                </span>
                <Pill tone={problem.status === "failed" ? "danger" : "muted"}>{problem.status === "failed" ? t("cat.saidNo") : t("cat.notSent")}</Pill>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[14px] text-app-ink-soft">{catalog.id ? t("cat.allAccepted") : t("cat.emptyBefore")}</p>
        )}
      </Card>
    </div>
  );
}
