"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { formatMoney } from "@shared/i18n";
import { useLocale } from "@/components/i18n/I18nProvider";
import { preorderShareText } from "@shared/preorder";
import { whatsappShareLink } from "@shared/product-codes";
import { withChannelRef } from "@shared/channels";

/**
 * "Share your preorder": a ready-made post (name, price, ship date, link) for WhatsApp, Facebook and X, plus copy for
 * Instagram captions (Instagram has no web share link) and the phone's own share sheet. Each link carries its
 * channel (?ref=…) so the orders it brings count in the right place.
 */
export function SharePreorder({ product }: { product: { name: string; price: number; shipsOn: string | null; url: string } }) {
  const locale = useLocale();
  const [copied, setCopied] = useState(false);
  // The phone's share sheet, where there is one (known only in the browser, after the first render).
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === "function"), []);
  const price = formatMoney(Math.round(product.price), locale);
  const text = (channel?: "whatsapp" | "instagram" | "facebook" | "tiktok") => preorderShareText({ name: product.name, price, shipsOn: product.shipsOn, url: channel ? withChannelRef(product.url, channel) : product.url });
  const links: Array<{ label: string; icon: IconName; href: string }> = [
    { label: "WhatsApp", icon: "whatsapp", href: whatsappShareLink(text("whatsapp")) },
    { label: "Facebook", icon: "facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(withChannelRef(product.url, "facebook"))}` },
    { label: "X", icon: "send", href: `https://x.com/intent/post?text=${encodeURIComponent(text())}` },
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(text("instagram"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard (old browser): the links above still work.
    }
  }

  async function shareSheet() {
    try {
      await navigator.share({ title: product.name, text: text() });
    } catch {
      // Closed, or no share sheet here.
    }
  }

  return (
    <div className="grid gap-3 rounded-[16px] border border-app-line p-4">
      <div>
        <span className="block text-[14px] font-bold">Share your preorder</span>
        <span className="block text-[13px] text-app-ink-soft">Post it where your customers are. Each link counts the orders it brings.</span>
      </div>
      <p className="m-0 rounded-[12px] bg-app-canvas px-3 py-2.5 text-[13px] leading-[1.5]">{text("whatsapp")}</p>
      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <a key={link.label} href={link.href} target="_blank" rel="noreferrer" className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-app-line bg-white px-4 text-[13.5px] font-bold text-app-ink no-underline hover:border-app-line-strong">
            <Icon name={link.icon} size={15} /> {link.label}
          </a>
        ))}
        <button type="button" onClick={() => void copy()} className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-app-line bg-white px-4 text-[13.5px] font-bold text-app-ink hover:border-app-line-strong">
          <Icon name={copied ? "check" : "copy"} size={15} /> {copied ? "Copied" : "Copy for Instagram"}
        </button>
        {canShare ? (
          <button type="button" onClick={() => void shareSheet()} className="inline-flex min-h-[40px] items-center gap-2 rounded-full bg-app-ink px-4 text-[13.5px] font-bold text-white hover:bg-black">
            <Icon name="upload" size={15} /> More
          </button>
        ) : null}
      </div>
    </div>
  );
}
