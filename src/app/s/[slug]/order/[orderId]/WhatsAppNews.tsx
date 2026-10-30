"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel, PrimaryButton } from "@/components/storefront/shopper/ShopperShell";
import type { ShopperTheme } from "@/components/storefront/shopper/theme";
import { setWhatsAppNews } from "./actions";

// "Get news from <shop> on WhatsApp" (Notify my followers, shared/follower-blasts.ts): the buyer's opt-in to the
// shop's news on WhatsApp. Off until they tap it; they can turn it off again here, or reply STOP to any message.
// Shown only while the shop has the notify_followers pilot feature and the order has a phone number.

export function WhatsAppNews({ theme, orderId, storeName, initial }: { theme: ShopperTheme; orderId: string; storeName: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (next: boolean) =>
    start(async () => {
      setError(null);
      const result = await setWhatsAppNews(orderId, next).catch(() => ({ ok: false as const, error: "We couldn't save that. Try again." }));
      if (result.ok) setOn(result.on);
      else setError(result.error);
    });

  return (
    <Panel theme={theme} className="p-5" aria-labelledby="whatsapp-news">
      <h2 id="whatsapp-news" className="flex items-center gap-2 text-[18px] font-semibold" style={{ fontFamily: theme.heading }}>
        <Icon name="whatsapp" size={18} /> Get news from {storeName} on WhatsApp
      </h2>
      {on ? (
        <>
          <p className="mt-2 text-[14.5px] leading-6" style={{ color: theme.muted }}>
            You&apos;re in. {storeName} can message you about new drops, pre-orders and lives, a few times a week at most. Reply STOP to any message to stop.
          </p>
          <button type="button" disabled={pending} onClick={() => toggle(false)} className="mt-3 cursor-pointer border-0 bg-transparent p-0 text-[14px] font-semibold underline disabled:opacity-50" style={{ color: theme.ink }}>
            {pending ? "Saving…" : "Stop WhatsApp news"}
          </button>
        </>
      ) : (
        <>
          <p className="mt-2 text-[14.5px] leading-6" style={{ color: theme.muted }}>
            Hear first about new drops, pre-orders and lives from {storeName}, a few times a week at most. You can stop any time.
          </p>
          <PrimaryButton theme={theme} className="mt-3" disabled={pending} onClick={() => toggle(true)}>
            {pending ? "Saving…" : "Yes, send me news on WhatsApp"}
          </PrimaryButton>
        </>
      )}
      {error ? <p role="alert" className="mt-2 text-[13.5px]" style={{ color: "#B6452E" }}>{error}</p> : null}
    </Panel>
  );
}
