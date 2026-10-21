"use client";

import { useState } from "react";
import type React from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { StoreFootnote } from "@/components/storefront/shopper/StoreFooterBadges";
import { StoreLogo } from "@/components/storefront/StoreLogo";
import { formatStoreMoney } from "@/lib/storefront/shopper-info";
import type { PublicBioBlock, PublicBioPage } from "@/lib/bio/service.server";
import type { SocialKey } from "@/lib/bio/pure";

// The link in bio page shoppers open from Instagram or TikTok: the store's photo, name and line, then the seller's
// blocks as big tap targets. Each tap is counted (sendBeacon, so leaving the page doesn't lose it). Also the editor's
// live phone preview (preview: taps don't count or leave).

const SOCIAL_ICON: Partial<Record<SocialKey, IconName>> = { whatsapp: "whatsapp", instagram: "instagram", tiktok: "tiktok", facebook: "facebook", youtube: "play" };

export interface BioColours {
  background: string;
  text: string;
  button: string;
  buttonText: string;
}

function track(slug: string, blockId: string) {
  try {
    const body = JSON.stringify({ blockId });
    const url = `/api/public/store/${encodeURIComponent(slug)}/links/click`;
    if (navigator.sendBeacon) navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    else void fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
  } catch {}
}

export function BioPageView({ slug, page, colours, preview = false, showFooter = true }: { slug: string; page: PublicBioPage; colours: BioColours; preview?: boolean; showFooter?: boolean }) {
  const tap = (block: PublicBioBlock) => (event: React.MouseEvent) => {
    if (preview) {
      event.preventDefault();
      return;
    }
    track(slug, block.id);
  };
  const muted = `${colours.text}B3`;
  const line = `${colours.text}26`;
  // The store's logo (no photo of the page's own, or the same picture) is drawn for the page's background, so a
  // dark theme gets the logo's dark-background version.
  const logoUrl = page.storeLogo?.logoUrl || null;
  const usesStoreLogo = Boolean(logoUrl && (!page.avatarUrl || page.avatarUrl === logoUrl));
  const initial = <span className="grid h-[88px] w-[88px] place-items-center rounded-full text-[32px] font-bold" style={{ background: colours.button, color: colours.buttonText }}>{page.title.slice(0, 1).toUpperCase()}</span>;

  return (
    <div className="min-h-full w-full" style={{ background: colours.background, color: colours.text }}>
      <main className="mx-auto flex w-full max-w-[480px] flex-col items-center px-4 pb-10 pt-10">
        {usesStoreLogo ? (
          <StoreLogo
            store={{ logoUrl: page.storeLogo!.logoUrl, brandSettings: { logoVariants: page.storeLogo!.logoVariants } }}
            background={colours.background}
            className="h-[88px] w-auto max-w-[220px]"
            fallback={initial}
          />
        ) : page.avatarUrl ? (
          <img src={page.avatarUrl} alt="" width={88} height={88} className="h-[88px] w-[88px] rounded-full object-cover" style={{ boxShadow: `0 0 0 3px ${colours.background}, 0 0 0 5px ${line}` }} />
        ) : (
          initial
        )}
        <h1 className="mt-4 text-center text-[22px] font-bold leading-tight">{page.title}</h1>
        {page.bio ? <p className="mt-1.5 whitespace-pre-line text-center text-[15px] leading-[1.5]" style={{ color: muted }}>{page.bio}</p> : null}

        <div className="mt-6 grid w-full gap-3">
          {page.blocks.map((block) => {
            if (block.type === "product") {
              return block.featured ? (
                <a key={block.id} href={block.href} onClick={tap(block)} className="block overflow-hidden rounded-[20px] no-underline" style={{ background: colours.button, color: colours.buttonText }}>
                  {block.image ? <img src={block.image} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" /> : null}
                  <span className="flex items-center gap-3 px-4 py-3.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-bold">{block.name}</span>
                      <span className="block text-[14px] opacity-80">{formatStoreMoney(block.price, page.currency)}</span>
                    </span>
                    <span className="shrink-0 rounded-full px-4 py-2 text-[14px] font-bold" style={{ background: colours.buttonText, color: colours.button }}>{block.cta}</span>
                  </span>
                </a>
              ) : (
                <a key={block.id} href={block.href} onClick={tap(block)} className="flex min-h-[64px] items-center gap-3 rounded-[18px] border p-2 pr-4 no-underline" style={{ borderColor: line, color: colours.text }}>
                  <span className="block h-12 w-12 shrink-0 overflow-hidden rounded-[12px]" style={{ background: line }}>{block.image ? <img src={block.image} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{block.name}</span>
                    <span className="block text-[13.5px]" style={{ color: muted }}>{formatStoreMoney(block.price, page.currency)}</span>
                  </span>
                  <span className="shrink-0 text-[13.5px] font-bold underline underline-offset-4">{block.cta}</span>
                </a>
              );
            }
            if (block.type === "link" || block.type === "whatsapp") {
              return (
                <a key={block.id} href={block.href} onClick={tap(block)} target={block.type === "link" && !preview ? "_blank" : undefined} rel="noopener noreferrer nofollow" className="flex min-h-[56px] items-center justify-center gap-2 rounded-full px-5 text-center text-[15.5px] font-bold no-underline" style={{ background: colours.button, color: colours.buttonText }}>
                  {block.type === "whatsapp" ? <Icon name="whatsapp" size={18} /> : null}
                  {block.label}
                </a>
              );
            }
            if (block.type === "socials") {
              return (
                <div key={block.id} className="flex flex-wrap justify-center gap-2 py-1">
                  {block.links.map((social) => (
                    <a key={social.key} href={social.href} onClick={tap(block)} target={preview ? undefined : "_blank"} rel="noopener noreferrer nofollow" aria-label={social.label} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-semibold no-underline" style={{ borderColor: line, color: colours.text }}>
                      {SOCIAL_ICON[social.key] ? <Icon name={SOCIAL_ICON[social.key]!} size={15} /> : null}
                      {social.label}
                    </a>
                  ))}
                </div>
              );
            }
            if (block.type === "signup") return <SignupBlock key={block.id} slug={slug} block={block} colours={colours} preview={preview} />;
            if (block.type === "shop") {
              return (
                <a key={block.id} href={block.href} onClick={tap(block)} className="flex min-h-[60px] items-center gap-3 rounded-full px-6 text-[17px] font-bold no-underline shadow-[0_8px_24px_rgba(0,0,0,0.12)]" style={{ background: colours.button, color: colours.buttonText }}>
                  <Icon name="bag" size={19} />
                  <span className="min-w-0 flex-1 text-center">{block.label}</span>
                  <Icon name="chevRight" size={18} />
                </a>
              );
            }
            if (block.type === "arrivals") {
              return (
                <section key={block.id} aria-label={block.label} className="grid gap-2">
                  <h2 className="m-0 px-1 text-[15px] font-bold">{block.label}</h2>
                  <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0">
                    {block.products.map((product) => (
                      <li key={product.id}>
                        <a href={product.href} onClick={tap(block)} className="block overflow-hidden rounded-[16px] border no-underline" style={{ borderColor: line, color: colours.text }}>
                          <span className="block aspect-square w-full" style={{ background: line }}>{product.image ? <img src={product.image} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}</span>
                          <span className="block px-2.5 py-2">
                            <span className="block truncate text-[13.5px] font-semibold">{product.name}</span>
                            <span className="block text-[13px]" style={{ color: muted }}>{formatStoreMoney(product.price, page.currency)}</span>
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            }
            if (block.type === "track") return <TrackBlock key={block.id} slug={slug} block={block} colours={colours} preview={preview} onOpen={() => { if (!preview) track(slug, block.id); }} />;
            return <p key={block.id} className="whitespace-pre-line px-2 text-center text-[15px] leading-[1.5]" style={{ color: muted }}>{block.text}</p>;
          })}
        </div>
        {showFooter ? <StoreFootnote muted={muted} border={line} ink={colours.text} showPayments={false} badgeRef="bio_badge" className="mt-10 w-full" /> : null}
      </main>
    </div>
  );
}

/**
 * "Track my order": a button that opens the store's order lookup (the order number and the email or phone the order
 * was placed with, the same check as the store's "Track an order"), then goes to that order's page.
 */
function TrackBlock({ slug, block, colours, preview, onOpen }: { slug: string; block: Extract<PublicBioBlock, { type: "track" }>; colours: BioColours; preview: boolean; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formId = `track-${block.id}`;
  const line = `${colours.text}26`;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (preview) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/store/${encodeURIComponent(slug)}/orders/lookup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderNumber: orderNumber.trim(), contact: contact.trim() }) });
      const json = await res.json().catch(() => null);
      const orderId = json?.data?.orderId;
      if (!res.ok || typeof orderId !== "string") {
        setError(json?.error?.message ?? "We couldn't find that order.");
        return;
      }
      window.location.href = `${block.orderHref}/${encodeURIComponent(orderId)}`;
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }
  const field = "mt-1 h-12 w-full rounded-full border bg-white px-4 text-[16px] text-[#16141F] outline-none";
  return (
    <div className="grid gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={formId}
        onClick={() => {
          if (!open) onOpen();
          setOpen((value) => !value);
        }}
        className="flex min-h-[56px] items-center justify-center gap-2 rounded-full border-2 px-5 text-[15.5px] font-bold"
        style={{ borderColor: colours.button, color: colours.text, background: "transparent" }}
      >
        <Icon name="truck" size={18} />
        {block.label}
      </button>
      {open ? (
        <form id={formId} onSubmit={submit} className="grid gap-3 rounded-[18px] border p-4" style={{ borderColor: line }}>
          <p className="m-0 text-[14px] leading-[1.5]" style={{ color: `${colours.text}B3` }}>Enter the order number from your confirmation message and the email or phone you ordered with.</p>
          <label className="block text-[14px] font-semibold">
            Order number
            <input value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} required minLength={4} maxLength={40} placeholder="SB-…" autoCapitalize="characters" className={field} style={{ borderColor: line }} />
          </label>
          <label className="block text-[14px] font-semibold">
            Email or phone
            <input value={contact} onChange={(event) => setContact(event.target.value)} required minLength={4} maxLength={120} autoComplete="email" className={field} style={{ borderColor: line }} />
          </label>
          {error ? <p role="alert" className="m-0 text-[13.5px]">{error}</p> : null}
          <button type="submit" disabled={busy} className="h-12 rounded-full px-5 text-[15px] font-bold disabled:opacity-60" style={{ background: colours.button, color: colours.buttonText }}>
            {busy ? "Looking…" : "Find my order"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

function SignupBlock({ slug, block, colours, preview }: { slug: string; block: Extract<PublicBioBlock, { type: "signup" }>; colours: BioColours; preview: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (preview) return;
    setState("busy");
    setError(null);
    try {
      const res = await fetch(`/api/public/store/${encodeURIComponent(slug)}/links/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blockId: block.id, email: email.trim() }) });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error?.message ?? "That didn't work. Try again.");
        setState("idle");
        return;
      }
      setState("done");
    } catch {
      setError("Network error. Try again.");
      setState("idle");
    }
  }
  return (
    <form onSubmit={submit} className="rounded-[18px] border p-4" style={{ borderColor: `${colours.text}26` }}>
      <p className="m-0 text-center text-[15px] font-semibold">{block.title}</p>
      {state === "done" ? (
        <p className="mt-2 text-center text-[14px]">You're on the list. Thank you!</p>
      ) : (
        <div className="mt-3 flex gap-2">
          <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Your email" aria-label="Your email" className="h-12 min-w-0 flex-1 rounded-full border bg-white px-4 text-[16px] text-[#16141F] outline-none" style={{ borderColor: `${colours.text}26` }} />
          <button type="submit" disabled={state === "busy"} className="h-12 shrink-0 rounded-full px-5 text-[15px] font-bold disabled:opacity-60" style={{ background: colours.button, color: colours.buttonText }}>{block.buttonLabel}</button>
        </div>
      )}
      {error ? <p role="alert" className="mt-2 text-center text-[13.5px]">{error}</p> : null}
    </form>
  );
}
