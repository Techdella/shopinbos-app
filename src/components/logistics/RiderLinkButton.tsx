"use client";

import { useState, useTransition } from "react";
import { createRiderLink, type RiderLinkResult } from "@/app/actions/logistics";
import { Notice, PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";

/**
 * Makes a rider's private Riders app link. The link is only ever shown here, once, right after it's made;
 * the server keeps just a hash, so "New link" is also how a lost or shared link gets switched off.
 */
export function RiderLinkButton({ teamMemberId, riderName, hasLink }: { teamMemberId: string; riderName: string; hasLink: boolean }) {
  const [result, setResult] = useState<RiderLinkResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function make() {
    if (hasLink && !result && !window.confirm(`Make a new link for ${riderName}? Their old link stops working.`)) return;
    setCopied(false);
    startTransition(async () => setResult(await createRiderLink(teamMemberId)));
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const link = result?.ok ? result : null;
  const message = link ? `Hi ${link.riderName.split(" ")[0]}, this is your Shopinbos Riders app link. Keep it private: ${link.url}` : "";

  return (
    <div className="grid w-full min-w-0 gap-2">
      <div>
        <PillButton tone={hasLink || link ? "white" : "ink"} size="sm" busy={pending} onClick={make} className="min-h-[40px]">
          <Icon name="link" size={15} />
          {hasLink || link ? "New link" : "Riders app link"}
        </PillButton>
      </div>
      {result && !result.ok && <Notice>{result.error}</Notice>}
      {link && (
        <div className="grid gap-2 rounded-[16px] bg-app-mint p-3.5" role="status">
          <p className="m-0 text-[13px] font-bold text-app-forest">Send this to {link.riderName} now. You won&apos;t see it again.</p>
          <label htmlFor={`link-${teamMemberId}`} className="sr-only">Riders app link for {link.riderName}</label>
          <input
            id={`link-${teamMemberId}`}
            readOnly
            value={link.url}
            onFocus={(event) => event.currentTarget.select()}
            className="h-11 w-full min-w-0 rounded-[12px] border border-app-line bg-white px-3 font-mono text-[12.5px] text-app-ink outline-none focus:border-app-ink"
          />
          <div className="flex flex-wrap gap-2">
            <PillButton tone="ink" size="sm" onClick={() => copy(link.url)} className="min-h-[40px]">
              <Icon name="copy" size={15} />
              {copied ? "Copied" : "Copy link"}
            </PillButton>
            <a
              href={`https://wa.me/${link.whatsapp ?? ""}?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[40px] items-center gap-2 rounded-full bg-app-success px-4 text-[13px] font-bold text-white no-underline"
            >
              <Icon name="whatsapp" size={15} />
              {link.whatsapp ? "Send on WhatsApp" : "Share on WhatsApp"}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
