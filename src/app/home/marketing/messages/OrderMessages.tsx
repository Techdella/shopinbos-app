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
import { ChannelHelp, SmsCounter, TemplateStatusPill, WhatsAppBubble, TEMPLATE_STATUS, type TemplateOption } from "../_kit/text";
import { EVENT_COPY, friendlyName } from "../_kit/friendly";
import { AdvancedFold, Fold } from "@/components/simple/Fold";
import { SetupHelpRequest } from "@/components/support/SetupHelpRequest";

const SMS_DETAILS: Array<{ token: string; label: string }> = [
  { token: "{{name}}", label: "Customer's name" },
  { token: "{{store}}", label: "Shop name" },
  { token: "{{order_number}}", label: "Order number" },
  { token: "{{order_total}}", label: "Order total" },
  { token: "{{tracking_link}}", label: "Tracking link" },
  { token: "{{cart_url}}", label: "Link to finish paying" },
];

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
          <ChannelHelp label="WhatsApp" howTo="Connect your WhatsApp Business number to send order updates on WhatsApp." href={channels.whatsapp.connectHref} linkLabel={channels.whatsapp.connectLabel} />
        </Notice>
      ) : null}
      {!smsReady ? (
        <div className="grid gap-2">
          <Notice tone="info">
            <ChannelHelp label="SMS" howTo="Texts need an SMS account. We can set it up for you." href={channels.sms.connectHref} linkLabel={channels.sms.connectLabel} />
          </Notice>
          <Fold summary="Ask us to set up SMS">
            <SetupHelpRequest title="Set up SMS for my order messages" description="We'll connect an SMS account for your shop and tell you when texts are ready to go." feature="sms" softwareQuestion="Do you already use an SMS company?" softwarePlaceholder="Termii, Africa's Talking, none…" />
          </Fold>
        </div>
      ) : null}

      <Card className="grid gap-2 p-5">
        <CardHead title="Who gets these" />
        <p className="m-0 text-[14px] leading-[1.55] text-app-ink-soft">
          Order messages go only to the phone number the customer typed when they ordered, and only about their own order. They don&apos;t need to say yes to offers, but anyone who replied STOP never gets them. No phone number, no message. Each message goes once per order.
        </p>
      </Card>

      {CUSTOMER_EVENTS.map((event) => {
        const s = settings.transactional[event.key];
        const auto = templates.find((t) => t.preset === event.preset && t.status === "APPROVED");
        const chosen = templates.find((t) => t.id === s.templateId) ?? null;
        const shown = chosen ?? auto ?? null;
        return (
          <Card key={event.key} className="grid gap-4 p-5">
            <CardHead title={EVENT_COPY[event.key]?.label ?? event.label} sub={EVENT_COPY[event.key]?.sub ?? event.sub} />
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="grid content-start gap-3">
                <label className="flex items-center justify-between gap-3 text-[14px] font-bold">
                  <span>WhatsApp</span>
                  <Toggle on={s.whatsapp} onChange={(on) => setEvent(event.key, { whatsapp: on })} label={`${EVENT_COPY[event.key]?.label ?? event.label} on WhatsApp`} />
                </label>
                {s.whatsapp ? (
                  <>
                    <Field label="Message" htmlFor={`tpl-${event.key}`} hint={auto && !s.templateId ? `Using “${friendlyName(auto.name)}” (approved).` : `Leave on automatic to use your approved “${event.preset.replace(/_/g, " ")}” message.`}>
                      <select id={`tpl-${event.key}`} className={selectClass} value={s.templateId ?? ""} onChange={(e) => setEvent(event.key, { templateId: e.target.value || null })}>
                        <option value="">Automatic{auto ? ` (${friendlyName(auto.name)})` : ""}</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id} disabled={t.status !== "APPROVED"}>
                            {friendlyName(t.name)}{t.status !== "APPROVED" ? ` · ${(TEMPLATE_STATUS[t.status]?.label ?? "not approved").toLowerCase()}` : ""}
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
                        No approved message yet, so nothing goes out on WhatsApp.{" "}
                        <a href="/home/marketing/whatsapp" className="underline">Use the ready-made “{event.preset.replace(/_/g, " ")}” message</a>.
                      </p>
                    )}
                  </>
                ) : null}
              </div>
              <div className="grid content-start gap-3">
                <label className="flex items-center justify-between gap-3 text-[14px] font-bold">
                  <span>SMS</span>
                  <Toggle on={s.sms} onChange={(on) => setEvent(event.key, { sms: on })} label={`${EVENT_COPY[event.key]?.label ?? event.label} by SMS`} />
                </label>
                {s.sms ? (
                  <>
                    <Field label="Text" htmlFor={`sms-${event.key}`} hint="Tap a button to add details that change for each customer. We fill them in when we send.">
                      <textarea id={`sms-${event.key}`} rows={3} className={textareaClass} value={s.smsText} maxLength={480} onChange={(e) => setEvent(event.key, { smsText: e.target.value })} />
                    </Field>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Add a customer detail">
                      {SMS_DETAILS.map((d) => (
                        <button key={d.token} type="button" className="min-h-[36px] rounded-full border border-app-line bg-white px-3 text-[13px] font-bold" onClick={() => setEvent(event.key, { smsText: `${s.smsText}${s.smsText && !/\s$/.test(s.smsText) ? " " : ""}${d.token}`.slice(0, 480) })}>
                          + {d.label}
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

      <AdvancedFold label="SMS settings (optional)" hint="The name texts come from, and the price per text">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name your texts come from" htmlFor="sms-sender" hint="3 to 11 letters or numbers, like ADIREHOUSE. Your SMS company has to approve it first. Leave it empty to use the usual name.">
            <input id="sms-sender" value={settings.smsSenderId ?? ""} onChange={(e) => setSettings({ ...settings, smsSenderId: e.target.value.slice(0, 11) || null })} className={inputClass} maxLength={11} placeholder="e.g. ADIREHOUSE" />
          </Field>
          <Field label={`Price per SMS part (${currency}, optional)`} htmlFor="sms-cost" hint="From your SMS company. We use it to tell you what a message to many customers costs.">
            <input id="sms-cost" type="number" min={0} step="0.01" value={settings.smsCostPerSegment ?? ""} onChange={(e) => setSettings({ ...settings, smsCostPerSegment: e.target.value === "" ? null : Number(e.target.value) })} className={inputClass} placeholder="e.g. 4.5" />
          </Field>
        </div>
      </AdvancedFold>

      <div className="flex flex-wrap gap-2">
        <PillButton size="md" busy={busy} onClick={() => void save()}>Save</PillButton>
      </div>
    </div>
  );
}
