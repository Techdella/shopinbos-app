"use client";

import { SMS_ENABLED } from "@/lib/features";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead } from "@/components/app-kit";
import { Notice, PillButton, Toggle } from "@/components/app-ui";
import { Field, inputClass, selectClass, textareaClass } from "@/components/growth/kit";
import type { ChannelStatus } from "@/lib/marketing/channels";
import type { MessagingSettings } from "@/lib/marketing/messaging-settings";
import { CUSTOMER_EVENTS, DELIVERY_MESSAGE_PRESETS, ORDER_MESSAGE_PRESETS, type CustomerEvent, type CustomerEventSetting } from "@/lib/marketing/text-channels";
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

// Extra details for the delivery partner updates (Logistics marketplace). Plain English for now.
const DELIVERY_SMS_DETAILS: Array<{ token: string; label: string }> = [
  { token: "{{delivery_partner}}", label: "Delivery company" },
  { token: "{{delivery_code}}", label: "Delivery code" },
  { token: "{{pickup_point}}", label: "Pickup point" },
  { token: "{{delivery_problem}}", label: "What went wrong" },
  { token: "{{order_url}}", label: "Link to their order" },
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
  // The ready-made order templates on the seller's WhatsApp account (submitted by themselves on connect).
  const orderTemplates = [...ORDER_MESSAGE_PRESETS, ...DELIVERY_MESSAGE_PRESETS].map((key) => templates.find((tpl) => tpl.preset === key && ["APPROVED", "PENDING", "IN_APPEAL"].includes(tpl.status)) ?? null);
  const needsSetup = waReady && orderTemplates.some((tpl) => !tpl);
  const waitingForMeta = waReady && !needsSetup && orderTemplates.some((tpl) => tpl?.status !== "APPROVED");

  async function setUpWhatsApp() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api<{ settings: MessagingSettings }>("/api/app/marketing/messaging", "POST", { action: "setup_whatsapp" });
      setSettings(result.settings);
      setNotice(t("om.waSetupDone"));
      router.refresh();
    } catch (setupError) {
      setError(errorText(setupError));
    } finally {
      setBusy(false);
    }
  }

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
      {needsSetup ? (
        <Card className="grid gap-3 p-5">
          <CardHead title={t("om.waSetupTitle")} sub={t("om.waSetupBody")} />
          <div>
            <PillButton size="md" busy={busy} onClick={() => void setUpWhatsApp()}>{t("om.waSetupButton")}</PillButton>
          </div>
        </Card>
      ) : null}
      {waitingForMeta ? (
        <Notice tone="info">
          <span className="grid gap-2">
            <span>{t("om.waWaiting")}</span>
            <span>
              <PillButton size="sm" tone="ghost" busy={busy} onClick={() => void setUpWhatsApp()}>{t("om.waCheckAgain")}</PillButton>
            </span>
          </span>
        </Notice>
      ) : null}
      {SMS_ENABLED && !smsReady ? (
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

      {CUSTOMER_EVENTS.map((event, index) => {
        const s = settings.transactional[event.key];
        const firstDelivery = event.group === "delivery" && CUSTOMER_EVENTS[index - 1]?.group !== "delivery";
        const smsDetails = [
          ...SMS_DETAILS.filter((d) => event.group !== "delivery" || d.token !== "{{cart_url}}").map((d) => ({ token: d.token, label: t(d.label) })),
          ...(event.group === "delivery" ? DELIVERY_SMS_DETAILS : []),
        ];
        const auto = templates.find((tpl) => tpl.preset === event.preset && tpl.status === "APPROVED");
        const chosen = templates.find((tpl) => tpl.id === s.templateId) ?? null;
        const shown = chosen ?? auto ?? null;
        return (
          <div key={event.key} className="grid gap-5">
          {firstDelivery ? (
            <Card className="grid gap-2 p-5">
              <CardHead title="Delivery partner updates" />
              <p className="m-0 text-[14px] leading-[1.55] text-app-ink-soft">
                For orders your delivery partners carry. Your customer hears when the delivery is booked, gets the delivery code when the rider is on the way (or the pickup point&apos;s address and hours), and hears if a delivery doesn&apos;t go through. We show your delivery partner&apos;s name only if you show it at checkout. Delivered uses the Delivered message above.
              </p>
            </Card>
          ) : null}
          <Card className="grid gap-4 p-5">
            <CardHead title={eventLabel(event.key, event.label)} sub={t.dynamic(`om.event.${event.key}.sub`, EVENT_COPY[event.key]?.sub ?? event.sub)} />
            <div className={SMS_ENABLED ? "grid gap-4 lg:grid-cols-2" : "grid gap-4"}>
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
              {SMS_ENABLED && (
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
                      {smsDetails.map((d) => (
                        <button key={d.token} type="button" className="min-h-[36px] rounded-full border border-app-line bg-white px-3 text-[13px] font-bold" onClick={() => setEvent(event.key, { smsText: `${s.smsText}${s.smsText && !/\s$/.test(s.smsText) ? " " : ""}${d.token}`.slice(0, 480) })}>
                          + {d.label}
                        </button>
                      ))}
                    </div>
                    <SmsCounter text={s.smsText.replace(/{{\s*[a-z_]+\s*}}/g, "XXXXXXXX")} />
                  </>
                ) : null}
              </div>
              )}
            </div>
          </Card>
          </div>
        );
      })}

      {SMS_ENABLED && (
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
      )}

      <div className="flex flex-wrap gap-2">
        <PillButton size="md" busy={busy} onClick={() => void save()}>{t("save")}</PillButton>
      </div>
    </div>
  );
}
