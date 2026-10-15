"use client";

import { useState } from "react";
import type React from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { StoreFootnote } from "@/components/storefront/shopper/StoreFooterBadges";
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

  return (
    <div className="min-h-full w-full" style={{ background: colours.background, color: colours.text }}>
      <main className="mx-auto flex w-full max-w-[480px] flex-col items-center px-4 pb-10 pt-10">
        {page.avatarUrl ? (
          <img src={page.avatarUrl} alt="" width={88} height={88} className="h-[88px] w-[88px] rounded-full object-cover" style={{ boxShadow: `0 0 0 3px ${colours.background}, 0 0 0 5px ${line}` }} />
        ) : (
          <span className="grid h-[88px] w-[88px] place-items-center rounded-full text-[32px] font-bold" style={{ background: colours.button, color: colours.buttonText }}>{page.title.slice(0, 1).toUpperCase()}</span>
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
            return <p key={block.id} className="whitespace-pre-line px-2 text-center text-[15px] leading-[1.5]" style={{ color: muted }}>{block.text}</p>;
          })}
        </div>
        {showFooter ? <StoreFootnote muted={muted} border={line} ink={colours.text} showPayments={false} className="mt-10 w-full" /> : null}
      </main>
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
