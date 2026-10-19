"use client";

import { confirmDialog } from "@/components/ui/dialogs";
import Link from "next/link";
import { useState } from "react";
import { Card, Pill, StatGrid, StatTile } from "@/components/app-kit";
import { Notice, PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { plainMetaError } from "@/components/simple/plain";
import { formatStamp, inboxApi } from "@/components/messaging/inbox-ui";
import { EmbeddedSignupError, runEmbeddedSignup } from "@/components/meta/embedded-signup";
import type { CatalogView, SyncSummary } from "@/lib/whatsapp-catalog/server";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import type { TFunction } from "@shared/i18n";
import type { MessageKey } from "@shared/i18n/catalog";

type InboxT = TFunction<MessageKey<"inbox"> | MessageKey<"common">>;

// WhatsApp catalog, one click: "Show my products on WhatsApp" connects WhatsApp with Facebook when it isn't yet
// (Embedded Signup, whose configuration also grants the catalog permissions), then creates the catalog, links it
// to the number and sends every product. After that: how many products are showing, "Update now", and the products
// Meta turned down.

const API = "/api/app/whatsapp-catalog";
const input = "h-11 w-full min-w-0 rounded-[14px] border border-app-line bg-white px-3 text-[15px] outline-none focus:border-app-ink";

type ActionResult = { view?: CatalogView; warnings?: string[]; sync?: SyncSummary };
type Message = { tone: "error" | "info" | "success"; text: string } | null;

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

export function WhatsAppCatalogClient({ initial, storeName, signup }: { initial: CatalogView; storeName: string; signup: { appId: string; configId: string } | null }) {
  const t = useT("inbox", "common");
  const locale = useLocale();
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [businessId, setBusinessId] = useState("");
  const [askBusiness, setAskBusiness] = useState(false);

  async function act(action: string, body: Record<string, unknown> = {}) {
    const result = await inboxApi<ActionResult>(API, { method: "POST", body: JSON.stringify({ action, ...body }) });
    if (result.view) setView(result.view);
    const notes = (result.warnings ?? []).map(plainError);
    if (result.sync) notes.unshift(syncText(result.sync, t));
    const bad = result.sync?.status === "error" || (result.warnings?.length ?? 0) > 0;
    setMessage(notes.length ? { tone: bad ? "error" : "success", text: notes.join(" ") } : null);
  }

  async function run(key: string, work: () => Promise<void>) {
    setBusy(key);
    setMessage(null);
    try {
      await work();
    } catch (error) {
      const code = error instanceof EmbeddedSignupError ? error.code : null;
      const text = code === "closed" ? t("wa.signupClosed") : code === "no_number" ? t("wa.noNumber") : error instanceof Error ? error.message : t("cat.failed");
      if (/Business ID/i.test(text)) setAskBusiness(true);
      setMessage({ tone: code === "closed" ? "info" : "error", text: plainError(text) });
      inboxApi<CatalogView>(API).then(setView).catch(() => null);
    } finally {
      setBusy(null);
    }
  }

  /** The one click: connect WhatsApp (or reconnect for the catalog permissions) when needed, then set up the catalog. */
  const setUp = (reconnect: boolean) =>
    run("setup", async () => {
      if ((!view.whatsapp.connected || reconnect) && signup) {
        const info = await runEmbeddedSignup(signup);
        await inboxApi("/api/app/inbox/whatsapp", { method: "POST", body: JSON.stringify({ action: "embedded_signup", code: info.code, phoneNumberId: info.phoneNumberId, wabaId: info.wabaId }) });
      }
      await act("create_catalog", { name: `${storeName} WhatsApp`, ...(businessId.trim() ? { businessId: businessId.trim() } : {}) });
    });

  const { catalog, counts, permissions } = view;
  const missing = permissions.state === "missing";
  const showing = Boolean(catalog.id && catalog.linkedToWhatsApp && catalog.cartEnabled && catalog.catalogVisible) && catalog.lastSyncStatus !== "error";
  const syncFailed = Boolean(catalog.id) && catalog.lastSyncStatus === "error";
  const canSetUp = !catalog.id && view.storeLive && (view.whatsapp.connected || Boolean(signup));
  const when = (iso: string | null) => (iso ? formatStamp(iso, locale) : t("wa.never"));

  return (
    <div className="grid min-w-0 max-w-[760px] gap-5">
      <Card className="grid min-w-0 gap-4 p-6">
        <div className="flex flex-wrap items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#25D366] text-white" aria-hidden="true"><Icon name="whatsapp" size={22} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[20px] font-extrabold leading-tight">{showing ? t("cat.showingTitle") : t("cat.showTitle")}</h2>
            <p className="mb-0 mt-1 text-[15px] leading-[1.5] text-app-ink-soft">{showing ? t("cat.showingSub") : t("cat.oneSub")}</p>
          </div>
          {catalog.id && <Pill tone={syncFailed ? "danger" : showing ? "success" : "warning"} dot>{syncFailed ? t("cat.needsHelp") : showing ? t("cat.showing") : t("cat.almost")}</Pill>}
        </div>

        {!view.storeLive && <Notice tone="info">{t("cat.notLive")}</Notice>}

        {catalog.id && (
          <StatGrid>
            <StatTile label={t("cat.showing")} value={counts.synced} hint={catalog.lastSyncAt ? t("cat.updated", { when: when(catalog.lastSyncAt) }) : t("cat.starting")} />
            <StatTile label={t("cat.waitingCheck")} value={counts.pending} hint={t("cat.fewMinutes")} />
            <StatTile label={t("cat.needFixing")} value={counts.failed + counts.skipped} hint={counts.failed + counts.skipped ? t("cat.seeList") : t("cat.nothingToFix")} />
          </StatGrid>
        )}
        {syncFailed && catalog.lastSyncError && <Notice>{plainMetaError(catalog.lastSyncError)}</Notice>}

        {canSetUp && (
          <div className="grid gap-2">
            {askBusiness && (
              <label className="grid gap-1">
                <span className="text-[12.5px] font-bold text-app-ink-soft">{t("cat.businessId")}</span>
                <input className={input} inputMode="numeric" value={businessId} onChange={(e) => setBusinessId(e.target.value)} placeholder={t("cat.businessIdHint")} />
              </label>
            )}
            <div>
              <PillButton size="lg" busy={busy === "setup"} disabled={Boolean(busy)} onClick={() => void setUp(missing && Boolean(signup))}>
                <Icon name="whatsapp" size={18} /> {view.whatsapp.connected ? t("cat.setUpNow") : t("cat.oneClick")}
              </PillButton>
            </div>
            <p className="m-0 text-[13.5px] text-app-ink-soft">
              {view.whatsapp.connected ? (view.whatsapp.displayName ? t("cat.usesNumberNamed", { name: view.whatsapp.displayName }) : t("cat.usesNumber")) : t("cat.oneClickSub")}
            </p>
          </div>
        )}
        {!catalog.id && !canSetUp && view.storeLive && (
          <Notice tone="info">
            {t("cat.connectFirst")} <Link href="/home/inbox/channels" className="font-bold underline">{t("ar.channels")}</Link>.
          </Notice>
        )}

        {catalog.id && (
          <div className="flex flex-wrap items-center gap-2">
            <PillButton size="md" tone="white" busy={busy === "sync"} disabled={Boolean(busy)} onClick={() => void run("sync", () => act(showing ? "sync" : "relink"))}>
              <Icon name="refresh" size={14} /> {showing ? t("cat.sendNow") : t("cat.relink")}
            </PillButton>
            <PillButton
              size="md"
              tone="ghost"
              disabled={Boolean(busy)}
              onClick={async () => {
                if (await confirmDialog(t("cat.stopConfirm"))) void run("disconnect", () => act("disconnect"));
              }}
            >
              {t("cat.stop")}
            </PillButton>
          </div>
        )}
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
      </Card>

      {view.problems.length > 0 && (
        <Card className="grid min-w-0 gap-3 p-5">
          <h3 className="m-0 text-[16px] font-extrabold">{t("cat.toFix")}</h3>
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
        </Card>
      )}
    </div>
  );
}
