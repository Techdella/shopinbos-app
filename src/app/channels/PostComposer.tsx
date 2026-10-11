"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { buttonClass, inputClass, selectClass, textareaClass } from "@/components/growth/kit";
import { cx } from "@/components/app-ui/cx";
import { SHARE_CHANNELS, captionRoom, postText, shareIntentUrl, taggedProductLink, type ShareChannel } from "@/lib/social/share";
import { CopyField } from "./ChannelClient";

export interface ComposerProduct {
  id: string;
  name: string;
  price: string;
  image: string | null;
  url: string;
}

// Pick a product and an app, let Peggy write the caption, edit it, then copy, download the photo or open the
// app's share page. Nothing is posted for the seller; links carry utm tags so results show under that channel.
export function PostComposer({ products }: { products: ComposerProduct[] }) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [channel, setChannel] = useState<ShareChannel>("whatsapp");
  const [angle, setAngle] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  useEffect(() => setCanNativeShare(typeof navigator.share === "function"), []);

  const product = products.find((item) => item.id === productId) ?? null;
  const link = useMemo(() => (product ? taggedProductLink(product.url, channel) : ""), [product, channel]);
  const room = link ? captionRoom(channel, link) : 0;
  const spec = SHARE_CHANNELS.find((item) => item.key === channel)!;
  const intent = product && caption.trim() ? shareIntentUrl(channel, caption, link) : null;

  async function write() {
    if (!product) return;
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/app/social/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, channel, ...(angle.trim() ? { angle: angle.trim() } : {}) }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setNote({ ok: false, text: json?.error?.message ?? "Peggy couldn't write that just now. Try again." });
        return;
      }
      setCaption(json.data.caption);
      setNote(json.data.ai ? { ok: true, text: "Peggy wrote this. Edit anything before you post." } : { ok: false, text: "AI writing isn't set up, so this is a plain caption from the product details." });
    } catch {
      setNote({ ok: false, text: "Couldn't reach Peggy. Check your connection." });
    } finally {
      setBusy(false);
    }
  }

  async function copyPost() {
    try {
      await navigator.clipboard.writeText(postText(channel, caption, link));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  async function nativeShare() {
    if (!product) return;
    const text = postText(channel, caption, link);
    try {
      if (product.image) {
        const response = await fetch(`/api/app/social/image?productId=${encodeURIComponent(product.id)}`);
        if (response.ok) {
          const blob = await response.blob();
          const file = new File([blob], `${product.name.slice(0, 40) || "product"}.${blob.type.split("/")[1] ?? "jpg"}`, { type: blob.type });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], text });
            return;
          }
        }
      }
      await navigator.share({ text, url: link });
    } catch {
      // Cancelled or unsupported; the other buttons still work.
    }
  }

  if (!products.length) {
    return <p className="m-0 text-[14px] text-app-ink-soft">Publish a product to start posting it.</p>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-3">
        <label className="grid gap-1 text-[13.5px] font-bold">
          Product
          <select value={productId} onChange={(event) => { setProductId(event.target.value); setCaption(""); setNote(null); }} className={selectClass}>
            {products.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.price}</option>)}
          </select>
        </label>
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-1.5 text-[13.5px] font-bold">Post to</legend>
          <div className="flex flex-wrap gap-2">
            {SHARE_CHANNELS.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={channel === item.key}
                onClick={() => setChannel(item.key)}
                className={cx(
                  "inline-flex min-h-[40px] items-center rounded-full border px-4 text-[13.5px] font-bold transition",
                  channel === item.key ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white hover:border-app-line-strong",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="grid gap-1 text-[13.5px] font-bold">
          Anything to mention? <span className="font-normal text-app-ink-soft">Optional, e.g. new arrival, weekend sale</span>
          <input value={angle} onChange={(event) => setAngle(event.target.value)} maxLength={200} className={inputClass} />
        </label>
        <button type="button" onClick={write} disabled={busy} className={buttonClass("accent")}>
          <Icon name="sparkle" size={16} />
          {busy ? "Peggy is writing…" : caption ? "Write it again" : "Ask Peggy to write it"}
        </button>
        <div>
          <div className="mb-1.5 text-[13.5px] font-bold">Tagged link for {spec.label}</div>
          <CopyField value={link} label={`${spec.label} product link`} />
          <p className="mb-0 mt-1.5 text-[12.5px] text-app-ink-soft">Visits and orders from this link show under {spec.label} in Analytics.</p>
        </div>
      </div>

      <div className="grid content-start gap-3">
        <div className="flex gap-3 rounded-[18px] bg-app-canvas p-3">
          {product?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image} alt="" className="h-24 w-24 shrink-0 rounded-[14px] object-cover" />
          ) : (
            <span className="grid h-24 w-24 shrink-0 place-items-center rounded-[14px] bg-white text-[12px] text-app-ink-soft">No photo</span>
          )}
          <label className="grid min-w-0 flex-1 gap-1 text-[13px] font-bold">
            Caption
            <textarea
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              rows={6}
              placeholder="Ask Peggy, or write your own"
              className={cx(textareaClass, "text-[14px]")}
            />
            <span className={cx("text-[12px] font-normal", caption.length > room ? "text-app-danger" : "text-app-ink-soft")}>
              {caption.length} of {room} characters{caption.length > room ? " (it will be shortened)" : ""}
            </span>
          </label>
        </div>
        {note && <p role="status" className={cx("m-0 rounded-[12px] px-3 py-2 text-[13px]", note.ok ? "bg-app-mint" : "bg-app-peach")}>{note.text}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={copyPost} disabled={!caption.trim()} className={buttonClass("ink", "sm")}>
            <Icon name={copied ? "check" : "copy"} size={15} />
            <span aria-live="polite">{copied ? "Copied" : "Copy post"}</span>
          </button>
          {product?.image && (
            <a href={`/api/app/social/image?productId=${encodeURIComponent(product.id)}`} download className={buttonClass("white", "sm")}>
              <Icon name="download" size={15} />
              Download photo
            </a>
          )}
          {intent && (
            <a href={intent} target="_blank" rel="noopener noreferrer" className={buttonClass("white", "sm")}>
              <Icon name={channel === "whatsapp" ? "whatsapp" : channel === "facebook" ? "facebook" : "send"} size={15} />
              Open {spec.label}
            </a>
          )}
          {canNativeShare && caption.trim() && (
            <button type="button" onClick={nativeShare} className={buttonClass("white", "sm")}>
              <Icon name="send" size={15} />
              Share from this device
            </button>
          )}
        </div>
        <p className="m-0 text-[12.5px] leading-[1.5] text-app-ink-soft">
          {channel === "instagram" || channel === "tiktok"
            ? `${spec.label} has no web share page: download the photo, copy the post, and paste them in the app. Put the tagged link in your bio.`
            : channel === "facebook"
              ? "Facebook only takes the link from the share page, so copy the post first and paste the caption there."
              : `Opens ${spec.label} with the caption and link filled in. You choose who to send it to.`}
        </p>
      </div>
    </div>
  );
}
