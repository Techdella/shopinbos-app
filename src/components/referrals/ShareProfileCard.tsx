"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

// "Share your profile" (supplier and delivery partner portals): the public profile link with the owner's invite code
// on it. Anyone who joins Shopinbos from that page counts as their referral (shared/referrals.ts, profile links).

const SHARE_TEXT: Record<"supplier" | "logistics_partner", string> = {
  supplier: "See my products and order from me on Shopinbos:",
  logistics_partner: "Book deliveries with us on Shopinbos:",
};

export function ShareProfileCard({
  link,
  role,
  verified,
  joined,
}: {
  link: string;
  role: "supplier" | "logistics_partner";
  verified: boolean;
  /** Businesses that joined from this profile so far. */
  joined: number;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const message = `${SHARE_TEXT[role]} ${link}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setError(null);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Press and hold the link to copy it.");
    }
  };

  return (
    <section aria-labelledby="share-profile" className="rounded-[18px] border border-app-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="share-profile" className="m-0 text-[16px] font-bold tracking-[-0.01em]">Share your profile</h2>
          <p className="mb-0 mt-1 max-w-[620px] text-[13.5px] leading-[1.55] text-app-ink-soft">
            Post your page on WhatsApp, Instagram or your website. It carries a &ldquo;Powered by Shopinbos&rdquo; badge, and anyone who joins Shopinbos from it counts as your referral: points as soon as they join, and your referral reward once they get going.
          </p>
        </div>
        <span className="rounded-full bg-[#EEF7F5] px-3 py-1 text-[12.5px] font-semibold text-[#1F5F5A]">
          {joined === 1 ? "1 business joined from it" : `${joined} businesses joined from it`}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-full border border-app-line bg-app-canvas/60 p-1.5 pl-4">
        <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{link.replace(/^https?:\/\//, "")}</span>
        <button type="button" onClick={() => void copy()} className="inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-full bg-[#0E2A38] px-4 text-[13.5px] font-bold text-white transition hover:bg-black">
          <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      {error && <p role="alert" className="mb-0 mt-2 text-[12.5px] text-app-danger">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-full bg-[#25D366] px-4 text-[13.5px] font-bold text-white no-underline transition hover:brightness-95">
          <Icon name="whatsapp" size={15} /> Share on WhatsApp
        </a>
        <a href={link} target="_blank" rel="noreferrer" className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-full border border-app-line bg-white px-4 text-[13.5px] font-bold text-app-ink no-underline transition hover:border-app-line-strong">
          <Icon name="eye" size={15} /> See your page
        </a>
      </div>

      {!verified && (
        <p className="mb-0 mt-3 text-[12.5px] leading-[1.5] text-app-ink-faint">
          Until we finish checking your business, your page says &ldquo;Being verified&rdquo; and {role === "supplier" ? "shops can't order from you or message you there yet" : "shops can't book or message you there yet"}. You can still share it.
        </p>
      )}
    </section>
  );
}
