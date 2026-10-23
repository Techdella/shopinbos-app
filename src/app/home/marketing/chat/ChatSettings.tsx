"use client";

import { useState } from "react";
import { Card, CardHead } from "@/components/app-kit";
import { Notice, PillButton, Toggle, cx } from "@/components/app-ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Field, checkClass, inputClass, selectClass, textareaClass } from "@/components/growth/kit";
import { useT } from "@/components/i18n/I18nProvider";
import type { MessageKey } from "@shared/i18n/catalog";
import { friendlyError } from "@/lib/errors/report-client";

type ChatMode = "contact_form" | "whatsapp" | "messaging" | "multiple";

export interface ChatSettingsValue {
  mode: ChatMode;
  whatsappNumber: string;
  whatsappGreeting: string;
  whatsappPosition: "left" | "right";
  whatsappColor: string;
  showOnMobile: boolean;
  showOnDesktop: boolean;
  widgetStyle: "bubble" | "bar" | "drawer";
  contactEmail: string;
  contactPhone: string;
  greeting: string;
}

type Key = MessageKey<"marketing">;
const MODES: { value: ChatMode; label: Key; sub: Key; icon: IconName }[] = [
  { value: "contact_form", label: "chat.mode.form", sub: "chat.mode.formSub", icon: "mail" },
  { value: "whatsapp", label: "chat.mode.whatsapp", sub: "chat.mode.whatsappSub", icon: "whatsapp" },
  { value: "messaging", label: "chat.mode.live", sub: "chat.mode.liveSub", icon: "chat" },
  { value: "multiple", label: "chat.mode.both", sub: "chat.mode.bothSub", icon: "layers" },
];

const WIDGET_STYLES: ReadonlyArray<{ value: string; label: Key }> = [
  { value: "bubble", label: "chat.style.bubble" },
  { value: "bar", label: "chat.style.bar" },
  { value: "drawer", label: "chat.style.drawer" },
];

const WHATSAPP_PATH =
  "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z";

function Preview({ config }: { config: ChatSettingsValue }) {
  const showWhatsApp = config.mode === "whatsapp" || config.mode === "multiple";
  const showContact = config.mode === "contact_form";
  const side = config.whatsappPosition === "left" ? "left-3" : "right-3";
  return (
    <div aria-hidden className="relative mx-auto aspect-[9/16] max-h-[460px] w-full max-w-[260px] overflow-hidden rounded-[28px] border-[8px] border-app-ink bg-app-canvas">
      <div className="flex h-11 items-center bg-white px-3">
        <span className="h-2 w-14 rounded-full bg-app-track" />
        <span className="ml-auto flex gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="h-2 w-6 rounded-full bg-app-line" />)}</span>
      </div>
      <div className="grid gap-2 p-3">
        <div className="h-20 rounded-[12px] bg-app-peach" />
        <div className="h-3 w-[70%] rounded-full bg-app-track" />
        <div className="h-2 w-[90%] rounded-full bg-app-line" />
        <div className="flex gap-2">{[0, 1].map((i) => <div key={i} className="h-16 flex-1 rounded-[10px] bg-white" />)}</div>
      </div>

      {showWhatsApp && config.widgetStyle === "bubble" && config.mode !== "multiple" && (
        <div className={cx("absolute bottom-4 grid h-11 w-11 place-items-center rounded-full shadow-lg", side)} style={{ background: config.whatsappColor }}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="white"><path d={WHATSAPP_PATH} /></svg>
        </div>
      )}
      {showWhatsApp && config.widgetStyle === "bar" && config.mode !== "multiple" && (
        <div className="absolute inset-x-3 bottom-4 flex items-center justify-center gap-2 rounded-full py-2 text-[11px] font-bold text-white shadow-lg" style={{ background: config.whatsappColor }}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d={WHATSAPP_PATH} /></svg> Chat with us
        </div>
      )}
      {(showContact || (showWhatsApp && config.widgetStyle === "drawer" && config.mode !== "multiple")) && (
        <div className="absolute inset-x-0 bottom-0 rounded-t-[14px] bg-white p-3.5 shadow-[0_-4px_16px_rgba(0,0,0,0.1)]">
          <div className="mb-2 truncate text-[11px] font-bold">{(showContact ? config.greeting : config.whatsappGreeting) || "Talk to us"}</div>
          <div className="mb-1.5 h-6 rounded-[6px] bg-app-canvas" />
          <div className="mb-2 h-6 rounded-[6px] bg-app-canvas" />
          <div className="h-7 rounded-full" style={{ background: showContact ? "#16141F" : config.whatsappColor }} />
        </div>
      )}
      {config.mode === "messaging" && (
        <div className="absolute bottom-4 right-3 grid h-11 w-11 place-items-center rounded-full bg-app-ink text-white shadow-lg"><Icon name="chat" size={20} /></div>
      )}
      {config.mode === "multiple" && (
        <div className="absolute bottom-4 right-3 flex flex-col items-end gap-1.5">
          <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[10px] font-bold shadow">
            <svg viewBox="0 0 24 24" width="12" height="12" fill={config.whatsappColor}><path d={WHATSAPP_PATH} /></svg> WhatsApp
          </span>
          <span className="rounded-full bg-app-ink px-3 py-1.5 text-[10px] font-bold text-white shadow">Send a message</span>
        </div>
      )}
    </div>
  );
}

export function ChatSettings({ initial }: { initial: ChatSettingsValue }) {
  const t = useT("marketing");
  const [config, setConfig] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const set = (patch: Partial<ChatSettingsValue>) => {
    setConfig((current) => ({ ...current, ...patch }));
    setResult(null);
  };

  async function save() {
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch("/api/store/chat", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: config.mode,
          whatsappNumber: config.whatsappNumber.trim(),
          whatsappGreeting: config.whatsappGreeting,
          whatsappPosition: config.whatsappPosition,
          whatsappColor: config.whatsappColor,
          showOnMobile: config.showOnMobile,
          showOnDesktop: config.showOnDesktop,
          widgetStyle: config.widgetStyle,
          greeting: config.greeting,
          // The API wants a valid email or nothing at all.
          contactEmail: config.contactEmail.trim() || undefined,
          contactPhone: config.contactPhone.trim(),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? t("chat.saveFailed"));
      setResult({ tone: "success", text: t("chat.saved") });
    } catch (saveError) {
      setResult({ tone: "error", text: saveError instanceof Error ? friendlyError(saveError) : t("chat.saveFailed") });
    } finally {
      setSaving(false);
    }
  }

  const showWhatsApp = config.mode === "whatsapp" || config.mode === "multiple";
  const showContact = config.mode === "contact_form" || config.mode === "multiple";

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid min-w-0 content-start gap-5">
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-3 p-0 text-[17px] font-extrabold">{t("chat.howReach")}</legend>
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {MODES.map((mode) => {
              const on = config.mode === mode.value;
              return (
                <button
                  key={mode.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ mode: mode.value })}
                  className={cx("flex min-h-[72px] items-center gap-3 rounded-[18px] border bg-white p-4 text-left transition", on ? "border-app-ink ring-1 ring-app-ink" : "border-app-line hover:border-app-line-strong")}
                >
                  <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-[12px]", on ? "bg-app-ink text-white" : "bg-app-canvas")}><Icon name={mode.icon} size={18} /></span>
                  <span className="min-w-0">
                    <span className="block text-[14.5px] font-extrabold">{t(mode.label)}</span>
                    <span className="block text-[12.5px] text-app-ink-soft">{t(mode.sub)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {showWhatsApp && (
          <Card className="p-5">
            <CardHead title="WhatsApp" />
            <div className="mt-4 grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label={t("chat.waNumber")} htmlFor="wa-number" hint={t("chat.waNumberHint")}>
                  <input id="wa-number" type="tel" value={config.whatsappNumber} onChange={(e) => set({ whatsappNumber: e.target.value })} className={inputClass} placeholder="+2348012345678" />
                </Field>
                <Field label={t("chat.buttonColour")} htmlFor="wa-color-text">
                  <div className="flex gap-2">
                    <input type="color" aria-label={t("chat.pickColour")} value={config.whatsappColor} onChange={(e) => set({ whatsappColor: e.target.value })} className="h-[48px] w-[56px] shrink-0 cursor-pointer rounded-[14px] border border-app-line bg-white p-1" />
                    <input id="wa-color-text" value={config.whatsappColor} onChange={(e) => set({ whatsappColor: e.target.value })} className={`${inputClass} font-mono text-[14px]`} />
                  </div>
                </Field>
              </div>
              <Field label={t("chat.prefill")} htmlFor="wa-greeting" hint={t("chat.prefillHint")}>
                <textarea id="wa-greeting" value={config.whatsappGreeting} onChange={(e) => set({ whatsappGreeting: e.target.value })} className={textareaClass} rows={2} maxLength={200} />
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label={t("chat.buttonStyle")} htmlFor="wa-style">
                  <select id="wa-style" value={config.widgetStyle} onChange={(e) => set({ widgetStyle: e.target.value as ChatSettingsValue["widgetStyle"] })} className={selectClass}>
                    {WIDGET_STYLES.map((style) => <option key={style.value} value={style.value}>{t(style.label)}</option>)}
                  </select>
                </Field>
                <fieldset className="m-0 min-w-0 border-0 p-0">
                  <legend className="mb-1.5 p-0 text-[13.5px] font-bold">{t("chat.side")}</legend>
                  <div className="flex gap-2">
                    {(["left", "right"] as const).map((position) => (
                      <label key={position} className="flex min-h-[48px] flex-1 cursor-pointer items-center gap-2.5 rounded-[14px] border border-app-line px-3.5 text-[14px] has-[:checked]:border-app-ink">
                        <input type="radio" name="position" value={position} checked={config.whatsappPosition === position} onChange={() => set({ whatsappPosition: position })} className={checkClass} />
                        {position === "left" ? t("chat.left") : t("chat.right")}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  { key: "showOnMobile", label: t("chat.showPhones") },
                  { key: "showOnDesktop", label: t("chat.showComputers") },
                ] as const).map(({ key, label }) => (
                  <div key={key} className="flex min-h-[52px] items-center justify-between gap-3 rounded-[14px] bg-app-canvas px-4">
                    <span className="text-[14px] font-semibold">{label}</span>
                    <Toggle on={config[key]} onChange={(on) => set(key === "showOnMobile" ? { showOnMobile: on } : { showOnDesktop: on })} label={label} />
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {showContact && (
          <Card className="p-5">
            <CardHead title={t("chat.contactForm")} />
            <div className="mt-4 grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label={t("chat.contactEmail")} htmlFor="cf-email" hint={t("chat.contactEmailHint")}>
                  <input id="cf-email" type="email" value={config.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} className={inputClass} placeholder="hello@yourbrand.com" />
                </Field>
                <Field label={t("chat.contactPhone")} htmlFor="cf-phone">
                  <input id="cf-phone" type="tel" value={config.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} className={inputClass} placeholder="+2348012345678" />
                </Field>
              </div>
              <Field label={t("chat.greeting")} htmlFor="cf-greeting">
                <textarea id="cf-greeting" value={config.greeting} onChange={(e) => set({ greeting: e.target.value })} className={textareaClass} rows={2} maxLength={200} />
              </Field>
            </div>
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <PillButton size="md" busy={saving} onClick={() => void save()}>{t("chat.save")}</PillButton>
        </div>
        {result && <Notice tone={result.tone}>{result.text}</Notice>}
      </div>

      <aside className="min-w-0">
        <div className="xl:sticky xl:top-4">
          <h2 className="m-0 mb-3 text-[17px] font-extrabold">{t("chat.preview")}</h2>
          <Card className="p-5">
            <Preview config={config} />
            <p className="mb-0 mt-3 text-center text-[13px] text-app-ink-soft">{t("chat.howLooks")}</p>
          </Card>
        </div>
      </aside>
    </div>
  );
}
