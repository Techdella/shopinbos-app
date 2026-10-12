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
import { ChannelHelp, SmsCounter, TemplateStatusPill, WhatsAppBubble, type TemplateOption } from "../_kit/text";

type Template = TemplateOption & { preset: string | null };

export function OrderMessages({ initial, channels, templates, currency }: { initial: MessagingSettings; channels: { sms: ChannelStatus; whatsapp: ChannelStatus }; templates: Template[]; currency: string }) {
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const setEvent = (key: CustomerEvent, patch: Partial<CustomerEventSetting>) => setSettings((s) => ({ ...s, transactional: { ...s.transactional, [key]: { ...s.transactional[key], ...patch } } }));
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
      setNotice("Saved.");
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
          <ChannelHelp label="WhatsApp" howTo={channels.whatsapp.howTo} href={channels.whatsapp.connectHref} linkLabel={channels.whatsapp.connectLabel} />
        </Notice>
      ) : null}
      {!smsReady ? (
        <Notice tone="info">
          <ChannelHelp label="SMS" howTo={channels.sms.howTo} href={channels.sms.connectHref} linkLabel={channels.sms.connectLabel} />
        </Notice>
      ) : null}

      <Card className="grid gap-2 p-5">
        <CardHead title="Who gets these" />
        <p className="m-0 text-[14px] leading-[1.55] text-app-ink-soft">
          Order messages go only to the phone number the buyer typed at checkout, and only about their own order or cart. They don't need a marketing opt-in, but anyone who replied STOP never gets them. No phone number, no message. Each message goes once per order.
        </p>
      </Card>

      {CUSTOMER_EVENTS.map((event) => {
        const s = settings.transactional[event.key];
        const auto = templates.find((t) => t.preset === event.preset && t.status === "APPROVED");
        const chosen = templates.find((t) => t.id === s.templateId) ?? null;
        const shown = chosen ?? auto ?? null;
        return (
          <Card key={event.key} className="grid gap-4 p-5">
            <CardHead title={event.label} sub={event.sub} />
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="grid content-start gap-3">
                <label className="flex items-center justify-between gap-3 text-[14px] font-bold">
                  <span>WhatsApp</span>
                  <Toggle on={s.whatsapp} onChange={(on) => setEvent(event.key, { whatsapp: on })} label={`${event.label} on WhatsApp`} />
                </label>
                {s.whatsapp ? (
                  <>
                    <Field label="Template" htmlFor={`tpl-${event.key}`} hint={auto && !s.templateId ? `Using ${auto.name} (approved).` : `Leave on automatic to use your approved “${event.preset.replace(/_/g, " ")}” template.`}>
                      <select id={`tpl-${event.key}`} className={selectClass} value={s.templateId ?? ""} onChange={(e) => setEvent(event.key, { templateId: e.target.value || null })}>
                        <option value="">Automatic{auto ? ` (${auto.name})` : ""}</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id} disabled={t.status !== "APPROVED"}>
                            {t.name} ({t.language}){t.status !== "APPROVED" ? ` · ${t.status.toLowerCase()}` : ""}
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
                        No approved template yet, so nothing goes out on WhatsApp.{" "}
                        <a href="/home/marketing/whatsapp" className="underline">Submit the ready-made “{event.preset.replace(/_/g, " ")}” template</a>.
                      </p>
                    )}
                  </>
                ) : null}
              </div>
              <div className="grid content-start gap-3">
                <label className="flex items-center justify-between gap-3 text-[14px] font-bold">
                  <span>SMS</span>
                  <Toggle on={s.sms} onChange={(on) => setEvent(event.key, { sms: on })} label={`${event.label} by SMS`} />
                </label>
                {s.sms ? (
                  <>
                    <Field label="Text" htmlFor={`sms-${event.key}`} hint="{{name}}, {{store}}, {{order_number}}, {{order_total}}, {{tracking_code}}, {{tracking_link}}, {{cart_url}} are filled in.">
                      <textarea id={`sms-${event.key}`} rows={3} className={textareaClass} value={s.smsText} maxLength={480} onChange={(e) => setEvent(event.key, { smsText: e.target.value })} />
                    </Field>
                    <SmsCounter text={s.smsText.replace(/{{\s*[a-z_]+\s*}}/g, "XXXXXXXX")} />
                  </>
                ) : null}
              </div>
            </div>
          </Card>
        );
      })}

      <Card className="grid gap-4 p-5">
        <CardHead title="SMS settings" />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Sender ID" htmlFor="sms-sender" hint="3-11 letters or numbers, registered with your SMS provider. Empty uses your account's default.">
            <input id="sms-sender" value={settings.smsSenderId ?? ""} onChange={(e) => setSettings({ ...settings, smsSenderId: e.target.value.slice(0, 11) || null })} className={inputClass} maxLength={11} placeholder="e.g. ADIREHOUSE" />
          </Field>
          <Field label={`Price per SMS part (${currency}, optional)`} htmlFor="sms-cost" hint="From your SMS provider. Used for cost estimates in campaigns.">
            <input id="sms-cost" type="number" min={0} step="0.01" value={settings.smsCostPerSegment ?? ""} onChange={(e) => setSettings({ ...settings, smsCostPerSegment: e.target.value === "" ? null : Number(e.target.value) })} className={inputClass} placeholder="e.g. 4.5" />
          </Field>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <PillButton size="md" busy={busy} onClick={() => void save()}>Save</PillButton>
      </div>
    </div>
  );
}
