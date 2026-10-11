"use client";

import { useActionState, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { buttonClass, inputClass } from "@/components/growth/kit";
import { cx } from "@/components/app-ui/cx";
import { connectMetaCatalog, syncChannel, type ChannelActionState } from "./actions";

/** Read-only value with a copy button (feed URLs, tagged links). */
export function CopyField({ value, label }: { value: string; label: string }) {
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
      <button type="button" onClick={copy} className={buttonClass("white", "sm")} aria-label={`Copy ${label}`}>
        <Icon name={copied ? "check" : "copy"} size={15} />
        <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
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
  const [state, action, pending] = useActionState(connectMetaCatalog, {});
  if (!canStoreTokens) {
    return (
      <p className="m-0 text-[13px] leading-[1.5] text-app-ink-soft">
        API sync needs token storage switched on for this workspace (the INBOX_ENCRYPTION_KEY setting). The feed URL above works without it.
      </p>
    );
  }
  return (
    <form action={action} className="grid gap-2.5">
      <input type="hidden" name="channel" value={channel} />
      <label className="grid gap-1 text-[13px] font-bold">
        Catalog ID
        <input name="catalogId" inputMode="numeric" autoComplete="off" required placeholder="e.g. 123456789012345" className={inputClass} />
      </label>
      <label className="grid gap-1 text-[13px] font-bold">
        Access token
        <input name="token" type="password" autoComplete="off" required placeholder="System user token with catalog_management" className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={buttonClass("ink", "sm")}>{pending ? "Checking with Meta…" : "Connect catalog"}</button>
      <Message state={state} />
    </form>
  );
}

export function SyncButton({ channel }: { channel: "meta" | "whatsapp" }) {
  const [state, action, pending] = useActionState(syncChannel, {});
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="channel" value={channel} />
      <button type="submit" disabled={pending} className={buttonClass("ink", "sm")}>
        <Icon name="refresh" size={15} />
        {pending ? "Sending products…" : "Sync now"}
      </button>
      <Message state={state} />
    </form>
  );
}
