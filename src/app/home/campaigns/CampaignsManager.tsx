"use client";

import { confirmDialog } from "@/components/ui/dialogs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, EmptyState } from "@/components/app-kit";
import { Notice, PillButton } from "@/components/app-ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Modal } from "@/components/growth/Modal";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatMoney } from "@shared/i18n";
import { CampaignStatusTimer, useLiveStatus, useServerTimeSeed } from "@/components/campaigns/CampaignTimer";
import type { CampaignSummary } from "@/lib/store-campaigns/types";
import type { CampaignStatus, CampaignTab } from "@/lib/store-campaigns/status";
import type { CampaignBlockType } from "@/lib/store-campaigns/blocks";
import { api, errorText } from "../marketing/_kit/client";
import { formatZoned } from "./format";

export interface PresetCard {
  id: string;
  swatch: [string, string, string];
  startsAt: string | null;
  endsAt: string | null;
}

const BLOCK_ICON: Record<CampaignBlockType, IconName> = { announcement: "megaphone", popup: "message", badge: "tag", countdown: "clock" };

/** Opens the signed preview link in a new tab (the window opens first so phones don't block it). */
export async function openCampaignPreview(id: string, at?: string | null) {
  const win = window.open("", "_blank");
  try {
    const data = await api<{ url: string; path: string }>(`/api/app/campaigns/${id}/preview-token`, "POST", at ? { at } : {});
    const target = new URL(data.url).host === window.location.host ? data.path : data.url;
    if (win) win.location.href = target;
    else window.location.href = target;
  } catch (error) {
    win?.close();
    throw error;
  }
}

function Row({ campaign, onAction, busy }: { campaign: CampaignSummary; onAction: (campaign: CampaignSummary, action: string) => void; busy: boolean }) {
  const t = useT("campaigns");
  const locale = useLocale();
  const status: CampaignStatus = useLiveStatus(campaign, campaign.status);
  const [menu, setMenu] = useState(false);
  const started = campaign.startsAt !== null && Date.parse(campaign.startsAt) <= Date.now();
  const actions: Array<{ key: string; label: string; icon: IconName; danger?: boolean }> = [
    { key: "preview", label: t("action.preview"), icon: "eye" },
    { key: "duplicate", label: t("action.duplicate"), icon: "copy" },
  ];
  if (status === "live" || status === "ending_soon" || status === "scheduled") actions.push({ key: "pause", label: t("action.pause"), icon: "pause" });
  if (status === "paused") actions.push({ key: "resume", label: t("action.resume"), icon: "play" });
  if ((status === "live" || status === "ending_soon" || status === "paused") && started) actions.push({ key: "end-now", label: t("action.endNow"), icon: "x", danger: true });
  if (status !== "archived") actions.push({ key: "archive", label: t("action.archive"), icon: "archive" });
  else actions.push({ key: "unarchive", label: t("action.unarchive"), icon: "undo" });
  if (status === "draft" || status === "ended" || status === "archived") actions.push({ key: "delete", label: t("action.delete"), icon: "trash", danger: true });

  return (
    <li className="relative grid gap-3 border-b border-app-line px-4 py-4 last:border-b-0 sm:px-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <Link href={`/home/campaigns/${campaign.id}`} className="block truncate text-[15.5px] font-extrabold text-app-ink no-underline hover:underline">{campaign.name}</Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-app-ink-soft">
          {campaign.startsAt ? <span>{t("list.dates", { start: formatZoned(campaign.startsAt, campaign.timezone, locale), end: formatZoned(campaign.endsAt, campaign.timezone, locale) })}</span> : <span>{t("list.noDates")}</span>}
          {campaign.blockTypes.length ? (
            <span className="inline-flex items-center gap-1.5" aria-label={t("list.blocks")}>
              {campaign.blockTypes.map((type) => <Icon key={type} name={BLOCK_ICON[type]} size={13} />)}
            </span>
          ) : null}
        </div>
      </div>
      <div className="min-w-0">
        <CampaignStatusTimer timing={campaign} initialStatus={campaign.status} timeZone={campaign.timezone} />
      </div>
      <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-[13px]">
        <span className="min-w-0 truncate text-app-ink-soft">{campaign.discount ? t("list.discount", { code: campaign.discount.automatic ? campaign.discount.name : campaign.discount.code }) : t("list.noDiscount")}</span>
        <span className="font-bold">{t("list.revenue", { amount: formatMoney(Math.round(campaign.revenue), locale) })}</span>
      </div>
      <div className="flex items-center gap-2 lg:justify-end">
        <Link href={`/home/campaigns/${campaign.id}`} className="inline-flex min-h-[38px] items-center rounded-full border border-app-line px-4 text-[13px] font-bold text-app-ink no-underline hover:border-app-line-strong">{t("action.edit")}</Link>
        <button type="button" aria-haspopup="menu" aria-expanded={menu} aria-label={t("action.more", { name: campaign.name })} disabled={busy} onClick={() => setMenu((open) => !open)} className="grid h-[38px] w-[38px] place-items-center rounded-full border border-app-line bg-white hover:border-app-line-strong disabled:opacity-50">
          <Icon name="moreHorizontal" size={16} />
        </button>
        {menu ? (
          <>
            <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-10 cursor-default bg-transparent" onClick={() => setMenu(false)} />
            <ul role="menu" className="absolute right-4 top-[calc(100%-12px)] z-20 m-0 min-w-[200px] list-none rounded-[16px] border border-app-line bg-white p-1.5 shadow-lg" onKeyDown={(event) => event.key === "Escape" && setMenu(false)}>
              {actions.map((action) => (
                <li key={action.key}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      onAction(campaign, action.key);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[14px] font-semibold hover:bg-app-canvas ${action.danger ? "text-app-danger" : "text-app-ink"}`}
                  >
                    <Icon name={action.icon} size={15} /> {action.label}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </li>
  );
}

function PresetPicker({ presets, onClose }: { presets: PresetCard[]; onClose: () => void }) {
  const t = useT("campaigns");
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function create(id: string) {
    setBusy(id);
    setError(null);
    try {
      const data = await api<{ campaign: { id: string } }>("/api/app/campaigns", "POST", { preset: id });
      router.push(`/home/campaigns/${data.campaign.id}`);
    } catch (createError) {
      setError(errorText(createError));
      setBusy(null);
    }
  }
  return (
    <Modal title={t("create.title")} onClose={onClose} wide="xl">
      <div className="overflow-y-auto p-5">
        <p className="m-0 mb-4 text-[14px] text-app-ink-soft">{t("create.sub")}</p>
        {error ? <div className="mb-4"><Notice>{error}</Notice></div> : null}
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {presets.map((preset) => (
            <li key={preset.id}>
              <button
                type="button"
                onClick={() => void create(preset.id)}
                disabled={busy !== null}
                className="flex h-full w-full flex-col gap-3 rounded-[18px] border border-app-line bg-white p-4 text-left hover:border-app-line-strong disabled:opacity-60"
              >
                <span className="flex h-12 w-full overflow-hidden rounded-[12px]" aria-hidden>
                  {preset.swatch.map((colour) => <span key={colour} className="flex-1" style={{ background: colour }} />)}
                </span>
                <span>
                  <span className="block text-[15px] font-extrabold text-app-ink">{t.dynamic(`preset.${preset.id}.name`)}</span>
                  <span className="mt-1 block text-[13px] leading-[1.45] text-app-ink-soft">{t.dynamic(`preset.${preset.id}.description`)}</span>
                </span>
                <span className="mt-auto text-[12.5px] font-bold text-app-ink">
                  {busy === preset.id ? t("create.making") : preset.startsAt ? t("create.suggested", { start: formatZoned(preset.startsAt, "Africa/Lagos", locale, false), end: formatZoned(preset.endsAt, "Africa/Lagos", locale, false) }) : t("create.anyTime")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

export function CampaignsManager({ campaigns, total, tab, presets, serverNow, startCreating }: { campaigns: CampaignSummary[]; total: number; tab: CampaignTab; presets: PresetCard[]; serverNow: string; startCreating: boolean }) {
  const t = useT("campaigns");
  const router = useRouter();
  const [creating, setCreating] = useState(startCreating);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useServerTimeSeed(serverNow);
  useEffect(() => setCreating(startCreating), [startCreating]);

  async function onAction(campaign: CampaignSummary, action: string) {
    setError(null);
    if (action === "end-now" && !(await confirmDialog({ message: t("confirm.endNow", { name: campaign.name }), tone: "warning" }))) return;
    if (action === "delete" && !(await confirmDialog({ message: t("confirm.delete", { name: campaign.name }), tone: "danger" }))) return;
    setBusy(campaign.id);
    try {
      if (action === "preview") await openCampaignPreview(campaign.id);
      else if (action === "delete") await api(`/api/app/campaigns/${campaign.id}`, "DELETE");
      else if (action === "duplicate") {
        const data = await api<{ campaign: { id: string } }>(`/api/app/campaigns/${campaign.id}/duplicate`, "POST");
        router.push(`/home/campaigns/${data.campaign.id}`);
        return;
      } else await api(`/api/app/campaigns/${campaign.id}/${action}`, "POST");
      router.refresh();
    } catch (actionError) {
      setError(errorText(actionError));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[14px] text-app-ink-soft">{t("list.count", { count: total })}</p>
        <PillButton tone="ink" size="md" onClick={() => setCreating(true)}>
          <Icon name="plus" size={16} /> {t("create.button")}
        </PillButton>
      </div>
      {error ? <Notice>{error}</Notice> : null}
      {campaigns.length ? (
        <Card className="overflow-visible">
          <ul className="m-0 list-none p-0">
            {campaigns.map((campaign) => <Row key={campaign.id} campaign={campaign} onAction={onAction} busy={busy === campaign.id} />)}
          </ul>
        </Card>
      ) : (
        <EmptyState icon="calendar" title={tab === "all" ? t("empty.title") : t("empty.tab")} action={tab === "all" ? <PillButton tone="ink" size="md" onClick={() => setCreating(true)}>{t("create.button")}</PillButton> : undefined}>
          {tab === "all" ? t("empty.body") : null}
        </EmptyState>
      )}
      {creating ? <PresetPicker presets={presets} onClose={() => setCreating(false)} /> : null}
    </div>
  );
}
