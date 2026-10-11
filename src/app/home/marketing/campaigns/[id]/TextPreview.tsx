"use client";

import { fillVariables } from "@/lib/marketing/flows";
import { SAMPLE_VARIABLES } from "@/lib/marketing/email-layout";

/** SMS segments: 160 characters for plain text (153 when split), 70 (67) when it needs Unicode. */
export function smsParts(text: string) {
  const unicode = /[^\u0000-\u007F£¥èéùìòÇØøÅå€]/.test(text);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return text.length <= single ? 1 : Math.ceil(text.length / multi);
}

export function TextPreview({ channel, message, storeName = "your shop" }: { channel: "sms" | "whatsapp"; message: string; storeName?: string }) {
  const text = fillVariables(message, { ...SAMPLE_VARIABLES, store: storeName, store_url: "https://yourshop.shopinbos.com" }, "text");
  return (
    <div className="grid gap-2">
      <div className={channel === "whatsapp" ? "rounded-[18px] bg-[#E7FFDB] p-4" : "rounded-[18px] bg-app-canvas p-4"}>
        <p className="m-0 whitespace-pre-wrap break-words text-[14.5px] leading-[1.5]">{text || "Your message will show here."}</p>
      </div>
      <p className="m-0 text-[12.5px] text-app-ink-soft">
        {text.length} characters{channel === "sms" ? ` · ${smsParts(text)} SMS per person` : ""} · preview uses a sample customer (Ada)
      </p>
    </div>
  );
}
