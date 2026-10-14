"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { buttonClass, inputClass } from "@/components/growth/kit";
import { cx } from "@/components/app-ui/cx";
import { useT } from "@/components/i18n/I18nProvider";
import { PlatformLogo, type LogoPlatform } from "@/components/channels/PlatformLogo";
import { EmbeddedSignupError, runEmbeddedSignup } from "@/components/meta/embedded-signup";
import type { CardState, ComingSoonPlatform, LivePlatform } from "@/lib/sales-channels/pure";
import { connectWhatsAppAction, disconnectAction, notifyMeAction, retryAction } from "./actions";

/** Read-only value with a copy button (tagged links in the post composer). */
export function CopyField({ value, label }: { value: string; label: string }) {
  const t = useT("social", "common");
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <input readOnly value={value} aria-label={label} onFocus={(event) => event.currentTarget.select()} className={cx(inputClass, "h-[44px] font-mono text-[12.5px]")} />
      <button type="button" onClick={copy} className={buttonClass("white", "sm")} aria-label={t("copy.label", { label })}>
        <Icon name={copied ? "check" : "copy"} size={15} />
        <span aria-live="polite">{copied ? t("copied") : t("copy")}</span>
      </button>
    </div>
  );
}

const cardClass = "flex min-w-0 flex-col gap-4 rounded-[22px] border border-app-line bg-white p-5";
const smallLink = "min-h-[40px] cursor-pointer border-0 bg-transparent px-1 text-[13px] font-bold text-app-ink-soft underline underline-offset-2 hover:text-app-ink disabled:opacity-50";

/**
 * One platform: logo, name, one line, one button. Connected: "Connected ✓ · n products showing" and a small
 * Disconnect. Facebook & Instagram, TikTok and Google sign in through /api/app/sales-channels/<platform>/connect;
 * WhatsApp runs Meta's Embedded Signup here when the number isn't connected yet, then sets up the catalog.
 */
export function ConnectCard({
  platform,
  name,
  line,
  state,
  accountUrl,
  signup,
}: {
  platform: LivePlatform;
  name: string;
  line: string;
  state: CardState;
  accountUrl: string | null;
  signup: { appId: string; configId: string } | null;
}) {
  const t = useT("social");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connectHref = `/api/app/sales-channels/${platform}/connect`;
  const working = pending || busy;

  function retry() {
    setError(null);
    startTransition(async () => {
      await retryAction(platform);
      router.refresh();
    });
  }

  function disconnect() {
    if (!window.confirm(t("card.confirm", { name }))) return;
    startTransition(async () => {
      await disconnectAction(platform);
      router.refresh();
    });
  }

  async function connectWhatsApp() {
    setBusy(true);
    setError(null);
    try {
      let result = await connectWhatsAppAction();
      if (!result.ok && "needsSignup" in result) {
        if (!signup) throw new Error(t("card.waFailed"));
        const info = await runEmbeddedSignup(signup);
        const res = await fetch("/api/app/inbox/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "embedded_signup", ...info }) });
        if (!res.ok) throw new Error("signup");
        result = await connectWhatsAppAction();
      }
      if (!result.ok) setError(t("card.waFailed"));
    } catch (caught) {
      // Closing Facebook's window isn't a problem worth a red line.
      if (!(caught instanceof EmbeddedSignupError && caught.code === "closed")) setError(t("card.waFailed"));
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  const connectButton = (label: string) =>
    platform === "whatsapp" ? (
      <button type="button" onClick={connectWhatsApp} disabled={working} className={buttonClass("ink", "md", "w-full")}>
        {working ? t("card.connecting") : label}
      </button>
    ) : (
      <a href={connectHref} className={buttonClass("ink", "md", "w-full")}>{label}</a>
    );

  const disconnectButton = (
    <button type="button" onClick={disconnect} disabled={working} className={smallLink}>{t("card.disconnect")}</button>
  );

  let body: ReactNode;
  switch (state.kind) {
    case "soon":
      body = <button type="button" disabled className={buttonClass("white", "md", "w-full")}>{t("card.soon")}</button>;
      break;
    case "connect":
      body = connectButton(t("card.connect"));
      break;
    case "syncing":
      body = (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-[14px] font-bold text-app-ink-soft" role="status">
            <Icon name="refresh" size={15} className="animate-spin" />
            {t("card.syncing")}
          </span>
          {disconnectButton}
        </div>
      );
      break;
    case "connected":
      body = (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[14px] font-bold text-app-success" role="status">
            {t("card.connected")}
            {state.count !== null && <span className="font-semibold text-app-ink-soft"> · {t("card.showing", { count: state.count })}</span>}
          </span>
          {disconnectButton}
        </div>
      );
      break;
    case "error":
      body = (
        <div className="grid gap-2.5">
          <p className="m-0 text-[14px] text-app-danger">{t("card.failed", { name })}</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={retry} disabled={working} className={buttonClass("ink", "sm")}>{working ? t("card.syncing") : t("card.tryAgain")}</button>
            {disconnectButton}
          </div>
        </div>
      );
      break;
    case "reauth":
      body = (
        <div className="grid gap-2.5">
          <p className="m-0 text-[14px] text-app-danger">{t("card.reauth", { name })}</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {connectButton(t("card.connectAgain"))}
            {disconnectButton}
          </div>
        </div>
      );
      break;
    case "needs_account": {
      const which = platform === "whatsapp" ? "meta" : platform;
      body = (
        <div className="grid gap-2.5">
          <p className="m-0 text-[14px]">{t(`card.needs.${which}`)}</p>
          {accountUrl && (
            <a href={accountUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("white", "sm")}>
              {t(`card.create.${which}`)}
              <Icon name="arrow" size={14} />
            </a>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={retry} disabled={working} className={buttonClass("ink", "sm")}>{working ? t("card.connecting") : t("card.done")}</button>
            {disconnectButton}
          </div>
        </div>
      );
      break;
    }
  }

  return (
    <li id={platform} className={cx(cardClass, state.kind === "soon" && "opacity-70")}>
      <div className="flex items-start gap-3">
        <PlatformLogo platform={platform as LogoPlatform} />
        <div className="min-w-0 flex-1">
          <h3 className="m-0 text-[17px] font-extrabold">{name}</h3>
          <p className="mb-0 mt-1 text-[14px] leading-[1.45] text-app-ink-soft">{line}</p>
        </div>
      </div>
      <div className="mt-auto">{body}</div>
      {error && <p role="alert" className="m-0 text-[13.5px] text-app-danger">{error}</p>}
    </li>
  );
}

/** A platform we can't connect yet: greyed, "Coming soon", and "Tell me when it's ready" (saved per store). */
export function SoonCard({ platform, name, noted }: { platform: ComingSoonPlatform; name: string; noted: boolean }) {
  const t = useT("social");
  const [done, setDone] = useState(noted);
  const [pending, startTransition] = useTransition();
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-[18px] border border-app-line bg-white/70 p-3 sm:p-4">
      <div className="flex items-center gap-2.5">
        <PlatformLogo platform={platform} size={36} className="opacity-60 grayscale-[35%]" />
        <div className="min-w-0">
          <h3 className="m-0 truncate text-[15px] font-extrabold text-app-ink-soft">{name}</h3>
          <span className="mt-0.5 inline-flex whitespace-nowrap rounded-full bg-app-canvas px-2 py-0.5 text-[11px] font-bold text-app-ink-soft">{t("card.soon")}</span>
        </div>
      </div>
      {done ? (
        <p className="m-0 mt-auto flex min-h-[40px] items-center gap-1.5 text-[13px] font-bold text-app-success" role="status">
          <Icon name="check" size={14} />
          {t("soon.noted")}
        </p>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await notifyMeAction(platform);
              if (result.ok) setDone(true);
            })
          }
          className={buttonClass("white", "sm", "mt-auto w-full px-2.5 text-[12.5px] leading-tight")}
        >
          {t("soon.notify")}
        </button>
      )}
    </li>
  );
}
