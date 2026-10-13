"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { PillButton, Toggle, cx } from "@/components/app-ui";
import { disableWebPush, enableWebPush, refreshWebPush, webPushState, type WebPushState } from "@/lib/notifications/web-push-client";
import { useT } from "@/components/i18n/I18nProvider";

// "Turn on notifications" for this browser: a friendly card in the bell's panel (until turned on or dismissed for
// two weeks) and a switch in settings. Hidden when the browser can't do push or web push isn't set up.

const DISMISS_KEY = "shopinbos.pushPrompt.dismissedAt";
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return at > 0 && Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

function useWebPush() {
  const [state, setState] = useState<WebPushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useT("notifications");
  useEffect(() => {
    let live = true;
    void webPushState().then((next) => {
      if (!live) return;
      setState(next);
      if (next === "on") void refreshWebPush();
    });
    return () => {
      live = false;
    };
  }, []);
  const run = async (action: () => Promise<WebPushState>) => {
    setBusy(true);
    setError(null);
    try {
      setState(await action());
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : t("push.failed"));
    } finally {
      setBusy(false);
    }
  };
  return { state, busy, error, turnOn: () => run(enableWebPush), turnOff: () => run(disableWebPush) };
}

export function PushPromptCard({ className }: { className?: string }) {
  const push = useWebPush();
  const t = useT("notifications");
  const [hidden, setHidden] = useState(true);
  useEffect(() => setHidden(dismissedRecently()), []);
  if (hidden || push.state !== "off") return null;
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // fine: it shows again next time
    }
    setHidden(true);
  };
  return (
    <div className={cx("flex items-start gap-3 rounded-[18px] bg-app-mint p-3.5 text-app-forest", className)}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white"><Icon name="bell" size={16} /></span>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[14px] font-extrabold">{t("push.promptTitle")}</p>
        <p className="m-0 mt-0.5 text-[13px] leading-[1.45]">{t("push.promptText")}</p>
        {push.error && <p className="m-0 mt-1 text-[13px] font-bold text-app-danger">{push.error}</p>}
        <div className="mt-2.5 flex flex-wrap gap-2">
          <PillButton tone="ink" size="sm" busy={push.busy} onClick={() => void push.turnOn()}>{t("push.turnOn")}</PillButton>
          <PillButton tone="white" size="sm" onClick={dismiss}>{t("push.notNow")}</PillButton>
        </div>
      </div>
    </div>
  );
}

/** Settings row: this browser's push switch, with plain help when the browser blocked it. */
export function BrowserPushSwitch() {
  const push = useWebPush();
  const t = useT("notifications");
  if (push.state === null) return null;
  const text =
    push.state === "unsupported"
      ? t("push.unsupported")
      : push.state === "unavailable"
      ? t("push.unavailable")
      : push.state === "denied"
      ? t("push.denied")
      : push.state === "on"
      ? t("push.on")
      : t("push.off");
  const canSwitch = push.state === "on" || push.state === "off";
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-app-canvas"><Icon name="bell" size={17} /></span>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[14.5px] font-bold">{t("push.thisComputer")}</p>
        <p className="m-0 text-[13px] leading-[1.45] text-app-ink-soft">{text}</p>
        {push.error && <p className="m-0 mt-1 text-[13px] font-bold text-app-danger">{push.error}</p>}
      </div>
      {canSwitch && <Toggle on={push.state === "on"} label={t("push.thisComputer")} onChange={(on) => void (on ? push.turnOn() : push.turnOff())} />}
    </div>
  );
}
