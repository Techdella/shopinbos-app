"use client";

import { useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { Icon } from "@/components/ui/Icon";
import { useSectionCampaign } from "../../campaign/CampaignContext";
import { choice, str } from "./block-logic";
import type { BlockContext } from "./shared";

/**
 * Promo code strip: a slim band with a discount code and a copy button. The code is the seller's, or the code of the
 * discount linked to the running campaign; with no code at all only the words show.
 */
export function CampaignPromoStrip({ ctx }: { ctx: BlockContext }) {
  const t = useT("campaigns");
  const campaign = useSectionCampaign();
  const { copy, settings, look } = ctx;
  const [copied, setCopied] = useState(false);
  const code = (str(copy.code) || campaign?.discountCode || "").toUpperCase();
  const words = str(copy.text);
  const tone = choice(settings.tone, ["dark", "accent", "light"] as const, "accent");
  const background = tone === "accent" ? look.tokens.accent : tone === "light" ? look.tokens.cardBg : look.tokens.ink;
  const color = tone === "accent" ? look.onAccent : tone === "light" ? look.tokens.ink : look.tokens.paperBg;
  if (!words && !code) return ctx.editorHint(t("section.stripHint"));
  return (
    <section aria-label={t("section.stripAria")} style={{ background, color }}>
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-center gap-x-4 gap-y-2 px-5 py-3.5 text-center text-[14.5px] font-semibold">
        {words ? <span>{words}</span> : null}
        {code ? (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(code).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              }).catch(() => null);
            }}
            className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[14px] font-bold"
            style={{ border: `1.5px dashed ${color}`, background: "transparent", color, cursor: "pointer", letterSpacing: "0.08em" }}
            aria-label={t("section.copyCode", { code })}
          >
            {code}
            <Icon name={copied ? "check" : "copy"} size={14} />
            <span className="sr-only" aria-live="polite">{copied ? t("section.copied") : ""}</span>
          </button>
        ) : null}
      </div>
    </section>
  );
}
