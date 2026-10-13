"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { buttonClass, inputClass } from "@/components/growth/kit";
import { cx } from "@/components/app-ui/cx";
import { connectMetaCatalog, syncChannel, type ChannelActionState } from "./actions";
import { useT } from "@/components/i18n/I18nProvider";

/** Read-only value with a copy button (feed URLs, tagged links). */
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

function Message({ state }: { state: ChannelActionState }) {
  if (!state.message) return null;
  return (
    <p role="status" className={cx("m-0 rounded-[12px] px-3 py-2 text-[13px] leading-[1.45]", state.ok ? "bg-app-success-tint text-app-success" : "bg-app-danger-tint text-app-danger")}>
      {state.message}
    </p>
  );
}

/** Catalog ID + token form for Meta catalog API sync (Facebook/Instagram Shop or WhatsApp catalog). */
export function MetaConnectForm({ channel, canStoreTokens }: { channel: "meta" | "whatsapp"; canStoreTokens: boolean }) {
  const t = useT("social");
  const [state, action, pending] = useActionState(connectMetaCatalog, {});
  if (!canStoreTokens) {
    return (
      <p className="m-0 text-[13px] leading-[1.5] text-app-ink-soft">
        {t("meta.off")}
      </p>
    );
  }
  return (
    <form action={action} className="grid gap-2.5">
      <input type="hidden" name="channel" value={channel} />
      <label className="grid gap-1 text-[13px] font-bold">
        {t("meta.catalogId")}
        <input name="catalogId" inputMode="numeric" autoComplete="off" required placeholder="e.g. 123456789012345" className={inputClass} />
      </label>
      <label className="grid gap-1 text-[13px] font-bold">
        {t("meta.token")}
        <input name="token" type="password" autoComplete="off" required placeholder={t("meta.tokenHint")} className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={buttonClass("ink", "sm")}>{pending ? t("meta.checking") : t("meta.connect")}</button>
      <Message state={state} />
    </form>
  );
}

export function SyncButton({ channel }: { channel: "meta" | "whatsapp" }) {
  const t = useT("social");
  const [state, action, pending] = useActionState(syncChannel, {});
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="channel" value={channel} />
      <button type="submit" disabled={pending} className={buttonClass("ink", "sm")}>
        <Icon name="refresh" size={15} />
        {pending ? t("sync.sending") : t("sync.now")}
      </button>
      <Message state={state} />
    </form>
  );
}

/**
 * One plain action per channel ("Show my products on Facebook and Instagram"). Tapping it opens what's inside:
 * the "Ask us to connect it" request and Peggy's steps. Children are rendered by the server page.
 */
export function ChannelAction({ label, done, children }: { label: string; done?: boolean; children: ReactNode }) {
  const t = useT("social", "common");
  const [open, setOpen] = useState(false);
  return (
    <div className="grid min-w-0 gap-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={buttonClass(open || done ? "white" : "ink", "md")}
      >
        {open ? t("close") : done ? t("action.help") : label}
      </button>
      {open && <div className="grid min-w-0 gap-3">{children}</div>}
    </div>
  );
}
