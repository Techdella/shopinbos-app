"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead } from "@/components/app-kit";
import { Notice, PillButton, Toggle } from "@/components/app-ui";
import { Field, inputClass, selectClass, textareaClass } from "@/components/growth/kit";
import type { ChannelStatus } from "@/lib/marketing/channels";
import type { MessagingSettings } from "@/lib/marketing/messaging-settings";
import { CUSTOMER_EVENTS, type CustomerEvent, type CustomerEventSetting } from "@/lib/marketing/text-channels";
import { api, errorText } from "../_kit/client";
import { ChannelHelp, SmsCounter, TemplateStatusPill, WhatsAppBubble, useTemplateStatusLabel, type TemplateOption } from "../_kit/text";
import { useT } from "@/components/i18n/I18nProvider";
import type { MessageKey } from "@shared/i18n/catalog";
import { EVENT_COPY, friendlyName } from "../_kit/friendly";
import { AdvancedFold } from "@/components/simple/Fold";

const SMS_DETAILS: Array<{ token: string; label: MessageKey<"marketing"> }> = [
  { token: "{{name}}", label: "om.detail.name" },
  { token: "{{store}}", label: "om.detail.store" },
  { token: "{{order_number}}", label: "om.detail.orderNumber" },
  { token: "{{order_total}}", label: "om.detail.orderTotal" },
  { token: "{{tracking_link}}", label: "om.detail.tracking" },
  { token: "{{cart_url}}", label: "om.detail.cart" },
];

type Template = TemplateOption & { preset: string | null };

export function OrderMessages({ initial, channels, templates, currency }: { initial: MessagingSettings; channels: { sms: ChannelStatus; whatsapp: ChannelStatus }; templates: Template[]; currency: string }) {
  const router = useRouter();
  const t = useT("marketing", "common");
  const statusLabel = useTemplateStatusLabel();
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const setEvent = (key: CustomerEvent, patch: Partial<CustomerEventSetting>) => setSettings((s) => ({ ...s, transactional: { ...s.transactional, [key]: { ...s.transactional[key], ...patch } } }));
  const eventLabel = (key: string, fallback: string) => t.dynamic(`om.event.${key}.label`, EVENT_COPY[key]?.label ?? fallback);
  const waReady = Boolean(channels.whatsapp.templates);
  const smsReady = channels.sms.ready;

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await api<MessagingSettings>("/api/app/marketing/messaging", "PUT", {
        smsSenderId: settings.smsSenderId || null,
        smsCostPerSegment: settings.smsCostPerSegment,
        transactional: Object.fromEntries(CUSTOMER_EVENTS.map((e) => [e.key, settings.transactional[e.key]])),
      });
      setSettings(saved);
      setNotice(t("editor.saved"));
      router.refresh();
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      {error ? <Notice>{error}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {!waReady ? (
        <Notice tone="info">
          <ChannelHelp label="WhatsApp" howTo={t("om.waHow")} href={channels.whatsapp.connectHref} linkLabel={channels.whatsapp.connectLabel} />
        </Notice>
      ) : null}
      {!smsReady ? (
        <Notice tone="info">
          <ChannelHelp label="SMS" howTo={t("om.smsHow")} href={channels.sms.connectHref} linkLabel={channels.sms.connectLabel} />
        </Notice>
      ) : null}

      <Card className="grid gap-2 p-5">
        <CardHead title={t("om.whoGets")} />
        <p className="m-0 text-[14px] leading-[1.55] text-app-ink-soft">
          {t("om.whoGetsBody")}
        </p>
      </Card>

      {CUSTOMER_EVENTS.map((event) => {
        const s = settings.transactional[event.key];
        const auto = templates.find((tpl) => tpl.preset === event.preset && tpl.status === "APPROVED");
        const chosen = templates.find((tpl) => tpl.id === s.templateId) ?? null;
        const shown = chosen ?? auto ?? null;
        return (
          <Card key={event.key} className="grid gap-4 p-5">
            <CardHead title={eventLabel(event.key, event.label)} sub={t.dynamic(`om.event.${event.key}.sub`, EVENT_COPY[event.key]?.sub ?? event.sub)} />
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="grid content-start gap-3">
                <label className="flex items-center justify-between gap-3 text-[14px] font-bold">
                  <span>WhatsApp</span>
                  <Toggle on={s.whatsapp} onChange={(on) => setEvent(event.key, { whatsapp: on })} label={t("om.onWhatsApp", { event: eventLabel(event.key, event.label) })} />
                </label>
                {s.whatsapp ? (
                  <>
                    <Field label={t("campaign.template")} htmlFor={`tpl-${event.key}`} hint={auto && !s.templateId ? t("om.using", { name: friendlyName(auto.name) }) : t("om.leaveAuto", { preset: event.preset.replace(/_/g, " ") })}>
                      <select id={`tpl-${event.key}`} className={selectClass} value={s.templateId ?? ""} onChange={(e) => setEvent(event.key, { templateId: e.target.value || null })}>
                        <option value="">{t("om.automatic")}{auto ? ` (${friendlyName(auto.name)})` : ""}</option>
                        {templates.map((tpl) => (
                          <option key={tpl.id} value={tpl.id} disabled={tpl.status !== "APPROVED"}>
                            {friendlyName(tpl.name)}{tpl.status !== "APPROVED" ? ` · ${statusLabel(tpl.status).toLowerCase()}` : ""}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {shown ? (
                      <div className="grid gap-2">
                        <TemplateStatusPill status={shown.status} />
                        <WhatsAppBubble content={shown.content} mapping={shown.variables} />
                      </div>
                    ) : (
                      <p className="m-0 text-[13px] font-semibold text-app-accent-ink">
                        {t("om.noApproved")}{" "}
                        <a href="/home/marketing/whatsapp" className="underline">{t("om.submitPreset", { preset: event.preset.replace(/_/g, " ") })}</a>.
                      </p>
                    )}
                  </>
                ) : null}
              </div>
              <div className="grid content-start gap-3">
                <label className="flex items-center justify-between gap-3 text-[14px] font-bold">
                  <span>SMS</span>
                  <Toggle on={s.sms} onChange={(on) => setEvent(event.key, { sms: on })} label={t("om.bySms", { event: eventLabel(event.key, event.label) })} />
                </label>
                {s.sms ? (
                  <>
                    <Field label={t("rewards.text")} htmlFor={`sms-${event.key}`} hint={t("om.textHint")}>
                      <textarea id={`sms-${event.key}`} rows={3} className={textareaClass} value={s.smsText} maxLength={480} onChange={(e) => setEvent(event.key, { smsText: e.target.value })} />
                    </Field>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("wa.addDetail")}>
                      {SMS_DETAILS.map((d) => (
                        <button key={d.token} type="button" className="min-h-[36px] rounded-full border border-app-line bg-white px-3 text-[13px] font-bold" onClick={() => setEvent(event.key, { smsText: `${s.smsText}${s.smsText && !/\s$/.test(s.smsText) ? " " : ""}${d.token}`.slice(0, 480) })}>
                          + {t(d.label)}
                        </button>
                      ))}
                    </div>
                    <SmsCounter text={s.smsText.replace(/{{\s*[a-z_]+\s*}}/g, "XXXXXXXX")} />
                  </>
                ) : null}
              </div>
            </div>
          </Card>
        );
      })}

      <AdvancedFold label={t("om.smsSettings")} hint={t("om.smsSettingsHint")}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("editor.senderName")} htmlFor="sms-sender" hint={t("om.senderHint")}>
            <input id="sms-sender" value={settings.smsSenderId ?? ""} onChange={(e) => setSettings({ ...settings, smsSenderId: e.target.value.slice(0, 11) || null })} className={inputClass} maxLength={11} placeholder={t("editor.senderPlaceholder")} />
          </Field>
          <Field label={t("om.price", { currency })} htmlFor="sms-cost" hint={t("om.priceHint")}>
            <input id="sms-cost" type="number" min={0} step="0.01" value={settings.smsCostPerSegment ?? ""} onChange={(e) => setSettings({ ...settings, smsCostPerSegment: e.target.value === "" ? null : Number(e.target.value) })} className={inputClass} placeholder={t("om.pricePlaceholder")} />
          </Field>
        </div>
      </AdvancedFold>

      <div className="flex flex-wrap gap-2">
        <PillButton size="md" busy={busy} onClick={() => void save()}>{t("save")}</PillButton>
      </div>
    </div>
  );
}
