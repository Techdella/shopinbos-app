"use client";

import { useState } from "react";
import { Card, CardHead, Pill, PillLink, StatGrid, StatTile } from "@/components/app-kit";
import { Notice, PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { SetupHelpRequest } from "@/components/support/SetupHelpRequest";
import { plainMetaError } from "@/components/simple/plain";
import { formatStamp, inboxApi } from "@/components/messaging/inbox-ui";
import type { CatalogView, SyncSummary } from "@/lib/whatsapp-catalog/server";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import type { Locale, TFunction } from "@shared/i18n";
import type { MessageKey } from "@shared/i18n/catalog";

type InboxT = TFunction<MessageKey<"inbox"> | MessageKey<"common">>;

// WhatsApp catalog page (simplicity rules, section 8A). The seller sees one plain status and one action: "Connect
// WhatsApp" (the one-tap card on /channels) when the number isn't connected, "Set it up now" when we can do it with
// their connected number, otherwise "Ask us to connect it" (SetupHelpRequest). Nothing technical is shown.

const API = "/api/app/whatsapp-catalog";

type ActionResult = { view?: CatalogView; warnings?: string[]; sync?: SyncSummary };
type Message = { tone: "error" | "info" | "success"; text: string } | null;

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
            <PillButton size="lg" busy={busy === "create_catalog"} disabled={Boolean(busy)} onClick={() => act("create_catalog", { name: `${storeName} WhatsApp` }, afterSync)} className="w-full sm:w-auto">
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

        {!view.whatsapp.connected && (
          <div className="grid gap-2">
            <div><PillLink href="/channels#whatsapp" icon="whatsapp" tone="ink">{t("cat.connectWa")}</PillLink></div>
            <p className="m-0 text-[13.5px] text-app-ink-soft">{t("cat.connectOnce")}</p>
          </div>
        )}
        {!showing && !canDoItNow && view.whatsapp.connected && (
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
