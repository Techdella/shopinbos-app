"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardHead } from "@/components/app-kit";
import { Notice, PillButton, Toggle } from "@/components/app-ui";
import { Field, inputClass, selectClass } from "@/components/growth/kit";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { CAMPAIGN_TIME_ZONES, utcToZonedInput, zonedInputToUtc } from "@/lib/store-campaigns/time";
import { discountDatesMismatch } from "@/lib/store-campaigns/status";
import { errorText } from "../../marketing/_kit/client";
import { openCampaignPreview } from "../CampaignsManager";
import { formatZoned } from "../format";
import type { EditorProps } from "./editor-shared";

/** Overview: name, schedule in the campaign's time zone, priority, ending-soon hours and the linked discount. */
export function OverviewTab({ campaign, store, save, busy }: EditorProps) {
  const t = useT("campaigns");
  const locale = useLocale();
  const [name, setName] = useState(campaign.name);
  const [zone, setZone] = useState(campaign.timezone);
  const [start, setStart] = useState(utcToZonedInput(campaign.startsAt ?? campaign.suggested?.startsAt ?? null, campaign.timezone));
  const [end, setEnd] = useState(utcToZonedInput(campaign.endsAt ?? campaign.suggested?.endsAt ?? null, campaign.timezone));
  const [priority, setPriority] = useState(String(campaign.priority));
  const [soon, setSoon] = useState(String(campaign.endingSoonHours));
  const [discountId, setDiscountId] = useState(campaign.discountId ?? "");
  const [auto, setAuto] = useState(campaign.discountAutoToggle);
  const [previewAt, setPreviewAt] = useState("");
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    setName(campaign.name);
    setPriority(String(campaign.priority));
    setSoon(String(campaign.endingSoonHours));
    setDiscountId(campaign.discountId ?? "");
    setAuto(campaign.discountAutoToggle);
  }, [campaign]);

  // Changing the time zone keeps the wall-clock times the seller typed (27 Nov 00:00 stays 27 Nov 00:00).
  const startsAt = start ? zonedInputToUtc(start, zone) : null;
  const endsAt = end ? zonedInputToUtc(end, zone) : null;
  const orderProblem = startsAt && endsAt && endsAt.getTime() <= startsAt.getTime();
  const halfDates = Boolean(start) !== Boolean(end);
  const discount = store.discounts.find((entry) => entry.id === discountId) ?? null;
  const mismatch = useMemo(() => discountDatesMismatch({ startsAt: startsAt?.toISOString() ?? null, endsAt: endsAt?.toISOString() ?? null }, discount), [startsAt, endsAt, discount]);
  const isDraft = !campaign.startsAt;
  const usingSuggestion = isDraft && Boolean(campaign.suggested) && Boolean(start);

  function submit(withDates: boolean) {
    const body = {
      name: name.trim() || campaign.name,
      timezone: zone,
      priority: Math.max(-100, Math.min(100, Math.round(Number(priority) || 0))),
      endingSoonHours: Math.max(0, Math.min(720, Math.round(Number(soon) || 0))),
      discountId: discountId || null,
      discountAutoToggle: Boolean(discountId) && auto,
      ...(withDates ? { startsAt: startsAt?.toISOString() ?? null, endsAt: endsAt?.toISOString() ?? null } : {}),
    };
    void save(`/api/app/campaigns/${campaign.id}`, "PATCH", body);
  }

  const zones = CAMPAIGN_TIME_ZONES.includes(zone as (typeof CAMPAIGN_TIME_ZONES)[number]) ? CAMPAIGN_TIME_ZONES : [zone, ...CAMPAIGN_TIME_ZONES];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid content-start gap-5">
        <Card className="p-5">
          <CardHead title={t("overview.basics")} />
          <div className="mt-4 grid gap-4">
            <Field label={t("overview.name")} htmlFor="campaign-name">
              <input id="campaign-name" className={inputClass} value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <CardHead title={t("overview.schedule")} sub={isDraft ? t("overview.scheduleDraft") : t("overview.scheduleSub")} />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={t("overview.starts")} htmlFor="campaign-start">
              <input id="campaign-start" type="datetime-local" className={inputClass} value={start} onChange={(event) => setStart(event.target.value)} />
            </Field>
            <Field label={t("overview.ends")} htmlFor="campaign-end">
              <input id="campaign-end" type="datetime-local" className={inputClass} value={end} min={start || undefined} onChange={(event) => setEnd(event.target.value)} />
            </Field>
            <Field label={t("overview.timezone")} htmlFor="campaign-zone" hint={t("overview.timezoneHint")} className="sm:col-span-2">
              <select id="campaign-zone" className={selectClass} value={zone} onChange={(event) => setZone(event.target.value)}>
                {zones.map((entry) => <option key={entry} value={entry}>{entry.replace(/_/g, " ")}</option>)}
              </select>
            </Field>
          </div>
          <div className="mt-4 grid gap-2">
            {usingSuggestion ? <Notice tone="info">{t("overview.suggested")}</Notice> : null}
            {orderProblem ? <Notice>{t("overview.endAfterStart")}</Notice> : null}
            {halfDates ? <Notice>{t("overview.bothDates")}</Notice> : null}
            {campaign.warnings.overlaps.length ? (
              <Notice tone="info">{t("overview.overlap", { names: campaign.warnings.overlaps.map((entry) => entry.name).join(", ") })}</Notice>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <PillButton tone="ink" size="md" disabled={busy || Boolean(orderProblem) || halfDates || !start} onClick={() => submit(true)}>
              {isDraft ? t("overview.scheduleButton") : t("overview.save")}
            </PillButton>
            {!isDraft ? (
              <PillButton tone="white" size="md" disabled={busy} onClick={() => { setStart(""); setEnd(""); void save(`/api/app/campaigns/${campaign.id}`, "PATCH", { startsAt: null, endsAt: null }); }}>
                {t("overview.unschedule")}
              </PillButton>
            ) : null}
          </div>
        </Card>

        <Card className="p-5">
          <CardHead title={t("overview.discount")} sub={t("overview.discountSub")} />
          <div className="mt-4 grid gap-4">
            <Field label={t("overview.linkedDiscount")} htmlFor="campaign-discount" hint={store.discounts.length ? undefined : t("overview.noDiscounts")}>
              <select id="campaign-discount" className={selectClass} value={discountId} onChange={(event) => setDiscountId(event.target.value)}>
                <option value="">{t("overview.none")}</option>
                {store.discounts.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.automatic ? entry.name : `${entry.code} · ${entry.name}`}</option>
                ))}
              </select>
            </Field>
            {discountId ? (
              <div className="flex items-center justify-between gap-4 rounded-[16px] bg-app-canvas px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold">{t("overview.autoToggle")}</span>
                  <span className="mt-0.5 block text-[12.5px] text-app-ink-soft">{t("overview.autoToggleHint")}</span>
                </span>
                <Toggle on={auto} onChange={setAuto} label={t("overview.autoToggle")} />
              </div>
            ) : null}
            {mismatch && discount ? (
              <Notice tone="info">{t("overview.discountMismatch", { start: formatZoned(discount.startsAt, zone, locale) || "—", end: formatZoned(discount.expiresAt, zone, locale) || "—" })}</Notice>
            ) : null}
            {campaign.discountId === null && campaign.discount === null && campaign.discountAutoToggle ? <Notice tone="info">{t("overview.discountGone")}</Notice> : null}
          </div>
        </Card>
      </div>

      <div className="grid content-start gap-5">
        <Card className="p-5">
          <CardHead title={t("overview.rules")} />
          <div className="mt-4 grid gap-4">
            <Field label={t("overview.priority")} htmlFor="campaign-priority" hint={t("overview.priorityHint")}>
              <input id="campaign-priority" type="number" inputMode="numeric" min={-100} max={100} className={inputClass} value={priority} onChange={(event) => setPriority(event.target.value)} />
            </Field>
            <Field label={t("overview.endingSoon")} htmlFor="campaign-soon" hint={t("overview.endingSoonHint")}>
              <input id="campaign-soon" type="number" inputMode="numeric" min={0} max={720} className={inputClass} value={soon} onChange={(event) => setSoon(event.target.value)} />
            </Field>
            <PillButton tone="ink" size="md" disabled={busy} onClick={() => submit(false)}>{t("overview.save")}</PillButton>
          </div>
        </Card>

        <Card className="p-5">
          <CardHead title={t("overview.previewTitle")} sub={t("overview.previewSub")} />
          <div className="mt-4 grid gap-3">
            <Field label={t("overview.previewAt")} htmlFor="campaign-preview-at" hint={t("overview.previewAtHint")}>
              <input id="campaign-preview-at" type="datetime-local" className={inputClass} value={previewAt} onChange={(event) => setPreviewAt(event.target.value)} />
            </Field>
            {previewError ? <Notice>{previewError}</Notice> : null}
            <PillButton
              tone="white"
              size="md"
              onClick={() => {
                setPreviewError(null);
                const at = previewAt ? zonedInputToUtc(previewAt, zone)?.toISOString() ?? null : null;
                void openCampaignPreview(campaign.id, at).catch((error) => setPreviewError(errorText(error)));
              }}
            >
              {t("overview.previewButton")}
            </PillButton>
          </div>
        </Card>
      </div>
    </div>
  );
}
