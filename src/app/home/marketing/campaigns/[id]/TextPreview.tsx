"use client";

import { fillVariables } from "@/lib/marketing/flows";
import { SAMPLE_VARIABLES } from "@/lib/marketing/email-layout";
import { smsSegments } from "@/lib/marketing/text-channels";
import { useT } from "@/components/i18n/I18nProvider";

/** SMS parts for a message (GSM-7: 160, or 153 per part; Unicode: 70, or 67 per part). */
export function smsParts(text: string) {
  return smsSegments(text).segments;
}

export function TextPreview({ channel, message, storeName }: { channel: "sms" | "whatsapp"; message: string; storeName?: string }) {
  const t = useT("emailBuilder");
  const text = fillVariables(message, { ...SAMPLE_VARIABLES, store: storeName ?? t("preview.yourShop"), store_url: "https://yourshop.shopinbos.com" }, "text");
  return (
    <div className="grid gap-2">
      <div className={channel === "whatsapp" ? "rounded-[18px] bg-[#E7FFDB] p-4" : "rounded-[18px] bg-app-canvas p-4"}>
        <p className="m-0 whitespace-pre-wrap break-words text-[14.5px] leading-[1.5]">{text || t("bubble.empty")}</p>
      </div>
      <p className="m-0 text-[12.5px] text-app-ink-soft">
        {t("textPreview.characters", { count: text.length })}{channel === "sms" ? ` · ${t("textPreview.smsPerPerson", { count: smsParts(text) })}` : ""} · {t("textPreview.sample")}
      </p>
    </div>
  );
}
