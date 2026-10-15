"use client";

import { confirmDialog } from "@/components/ui/dialogs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Notice, PillButton, Segmented } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { CampaignStatusTimer, useLiveStatus, useServerTimeSeed } from "@/components/campaigns/CampaignTimer";
import type { CampaignDetail } from "@/lib/store-campaigns/types";
import { api, errorText } from "../../marketing/_kit/client";
import { openCampaignPreview } from "../CampaignsManager";
import { campaignIsRunning, campaignRequest, type EditorStore } from "./editor-shared";
import { OverviewTab } from "./OverviewTab";
import { LookTab } from "./LookTab";
import { BlocksTab } from "./BlocksTab";
import { ReportTab } from "./ReportTab";

export type { EditorStore } from "./editor-shared";

type Tab = "overview" | "look" | "blocks" | "report";

/** The campaign editor: header with live status and timer, Preview, and the four tabs. */
export function CampaignEditor({ initial, store, serverNow }: { initial: CampaignDetail; store: EditorStore; serverNow: string }) {
  const t = useT("campaigns");
  const router = useRouter();
  const [campaign, setCampaign] = useState(initial);
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [seed, setSeed] = useState(serverNow);
  useServerTimeSeed(seed);
  const status = useLiveStatus(campaign, campaign.status);

  const save = useCallback(
    async (path: string, method: string, body?: unknown, options: { confirmLive?: boolean } = {}) => {
      // Editing a live campaign changes the store straight away: say so first.
      if (options.confirmLive !== false && campaignIsRunning(campaign) && !(await confirmDialog({ message: t("confirm.liveEdit"), tone: "warning" }))) return null;
      setBusy(true);
      setError(null);
      setSaved(null);
      try {
        const data = await campaignRequest(path, method, body);
        setCampaign(data.campaign);
        setSeed(data.serverNow);
        setSaved(t("saved"));
        return data.campaign;
      } catch (saveError) {
        setError(errorText(saveError));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [campaign, t],
  );

  async function lifecycle(action: string) {
    setError(null);
    if (action === "end-now" && !(await confirmDialog({ message: t("confirm.endNow", { name: campaign.name }), tone: "warning" }))) return;
    if (action === "duplicate") {
      setBusy(true);
      try {
        const data = await api<{ campaign: { id: string } }>(`/api/app/campaigns/${campaign.id}/duplicate`, "POST");
        router.push(`/home/campaigns/${data.campaign.id}`);
      } catch (dupError) {
        setError(errorText(dupError));
        setBusy(false);
      }
      return;
    }
    await save(`/api/app/campaigns/${campaign.id}/${action}`, "POST", undefined, { confirmLive: false });
  }

  const started = campaign.startsAt !== null && Date.parse(campaign.startsAt) <= Date.now();
  const tabs: Array<{ value: Tab; label: string }> = [
    { value: "overview", label: t("tab.overview") },
    { value: "look", label: t("tab.look") },
    { value: "blocks", label: t("tab.blocks") },
    { value: "report", label: t("tab.report") },
  ];
  const props = { campaign, store, save, busy };

  return (
    <div className="w-full px-4 py-6 font-app text-app-ink sm:px-6 xl:px-8 2xl:px-10">
      <Link href="/home/campaigns" className="mb-3 inline-flex items-center gap-1.5 text-[13.5px] font-bold text-app-ink-soft no-underline hover:text-app-ink">
        <Icon name="arrowLeft" size={14} /> {t("editor.back")}
      </Link>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 font-mono text-[11px] uppercase tracking-[0.16em] text-app-ink-soft">{t("editor.eyebrow")}</p>
          <h1 className="m-0 mt-1 break-words text-[28px] font-extrabold leading-[1.1] tracking-[-0.8px] sm:text-[30px]">{campaign.name}</h1>
          <div className="mt-2.5">
            <CampaignStatusTimer timing={campaign} initialStatus={campaign.status} timeZone={campaign.timezone} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PillButton tone="white" size="sm" disabled={busy} onClick={() => void openCampaignPreview(campaign.id).catch((previewError) => setError(errorText(previewError)))}>
            <Icon name="eye" size={15} /> {t("action.preview")}
          </PillButton>
          {status === "paused" ? (
            <PillButton tone="white" size="sm" disabled={busy} onClick={() => void lifecycle("resume")}><Icon name="play" size={15} /> {t("action.resume")}</PillButton>
          ) : status === "live" || status === "ending_soon" || status === "scheduled" ? (
            <PillButton tone="white" size="sm" disabled={busy} onClick={() => void lifecycle("pause")}><Icon name="pause" size={15} /> {t("action.pause")}</PillButton>
          ) : null}
          {(status === "live" || status === "ending_soon" || status === "paused") && started ? (
            <PillButton tone="white" size="sm" disabled={busy} onClick={() => void lifecycle("end-now")}>{t("action.endNow")}</PillButton>
          ) : null}
          <PillButton tone="white" size="sm" disabled={busy} onClick={() => void lifecycle("duplicate")}><Icon name="copy" size={15} /> {t("action.duplicate")}</PillButton>
          {status === "archived" ? (
            <PillButton tone="white" size="sm" disabled={busy} onClick={() => void lifecycle("unarchive")}>{t("action.unarchive")}</PillButton>
          ) : (
            <PillButton tone="white" size="sm" disabled={busy} onClick={() => void lifecycle("archive")}><Icon name="archive" size={15} /> {t("action.archive")}</PillButton>
          )}
        </div>
      </header>

      <div className="mb-4 overflow-x-auto">
        <Segmented options={tabs} value={tab} onChange={setTab} className="min-w-max" />
      </div>
      <div className="mb-4 grid gap-2" aria-live="polite">
        {error ? <Notice>{error}</Notice> : null}
        {saved && !error ? <Notice tone="success">{saved}</Notice> : null}
      </div>

      {tab === "overview" ? <OverviewTab {...props} /> : null}
      {tab === "look" ? <LookTab {...props} /> : null}
      {tab === "blocks" ? <BlocksTab {...props} /> : null}
      {tab === "report" ? <ReportTab campaign={campaign} /> : null}
    </div>
  );
}
