"use client";

import { useState } from "react";
import { toPng } from "html-to-image";
import { cx } from "@/components/app-ui";
import { pillButton } from "@/components/seller-core";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";

// Share one review: as an image (download, or the phone's share sheet for Instagram and WhatsApp status),
// or as text + link to the reviews wall on WhatsApp, Facebook and X.
export function ShareReview({ cardId, text, url, links }: { cardId: string; text: string; url: string; links: { whatsapp: string; facebook: string; x: string } }) {
  const t = useT("reviews");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function image() {
    const el = document.getElementById(cardId);
    if (!el) throw new Error("Card not found");
    const dataUrl = await toPng(el, { backgroundColor: "#ffffff", pixelRatio: 2, filter: (node) => !(node instanceof HTMLElement && node.dataset.exportSkip === "true") });
    const blob = await (await fetch(dataUrl)).blob();
    return { dataUrl, file: new File([blob], "review.png", { type: "image/png" }) };
  }

  async function shareImage(target: "instagram" | "any") {
    setBusy(true);
    setNote("");
    try {
      const { dataUrl, file } = await image();
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: `${text}\n${url}` });
        return;
      }
      const link = document.createElement("a");
      link.download = "review.png";
      link.href = dataUrl;
      link.click();
      await navigator.clipboard?.writeText(`${text}\n${url}`).catch(() => undefined);
      setNote(target === "instagram" ? t("share.instagramNote") : t("share.savedNote"));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setNote(t("share.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    await navigator.clipboard?.writeText(`${text}\n${url}`).then(() => setNote(t("share.copied")), () => setNote(t("share.copyFailed")));
  }

  const a = cx(pillButton.white, "no-underline");
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={pillButton.ink} onClick={() => shareImage("any")} disabled={busy}><Icon name="image" size={14} /> {busy ? t("share.making") : t("share.asImage")}</button>
        <button type="button" className={pillButton.white} onClick={() => shareImage("instagram")} disabled={busy}><Icon name="instagram" size={14} /> Instagram</button>
        <a className={a} href={links.whatsapp} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size={14} /> WhatsApp</a>
        <a className={a} href={links.facebook} target="_blank" rel="noopener noreferrer"><Icon name="facebook" size={14} /> Facebook</a>
        <a className={a} href={links.x} target="_blank" rel="noopener noreferrer">X</a>
        <button type="button" className={pillButton.white} onClick={copy}><Icon name="copy" size={14} /> {t("share.copyText")}</button>
      </div>
      {note ? <p role="status" className="m-0 text-[13px] text-app-ink-soft">{note}</p> : null}
    </div>
  );
}
