"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { Card, CardHead } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { FIELD_HELP, FIELD_INPUT, FIELD_LABEL } from "@/components/seller-settings/fields";
import { ShopShareCard } from "@/components/shop-link/ShopShareCard";
import { handleProblem, normaliseHandle, PLUG_LIVE } from "@shared/shop-handle";

// Shop link & QR (/home/store/share): the @handle (the owner can change it), the short link with Copy, WhatsApp and
// Share, the card customers see, and "Download for print" (a PNG of the card) plus the sticker and flyer sheets.

export interface ShopLinkData {
  handle: string;
  shortUrl: string;
  shortHost: string;
  storeUrl: string;
  storeName: string;
  logoUrl: string | null;
  canEdit: boolean;
}

const BTN = "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 text-[14px] font-bold transition disabled:opacity-50";
const BTN_WHITE = `${BTN} border border-app-line bg-white text-app-ink hover:border-app-line-strong no-underline`;
const BTN_INK = `${BTN} bg-app-ink text-white hover:bg-black`;

export function ShopLinkPanel({ initial, plug = PLUG_LIVE }: { initial: ShopLinkData; plug?: boolean }) {
  const t = useT("shopLink");
  const [link, setLink] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial.handle);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [png, setPng] = useState<"idle" | "busy" | "failed">("idle");
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const wanted = normaliseHandle(draft);
  const shape = wanted && wanted !== link.handle ? handleProblem(wanted) : null;
  const message = t("shareText", { handle: `@${link.handle}`, url: link.shortUrl });

  async function save() {
    if (shape) return setNote({ ok: false, text: t(`problem.${shape}`) });
    if (wanted === link.handle) return setEditing(false);
    setSaving(true);
    setNote(null);
    try {
      const response = await fetch("/api/app/store/handle", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: wanted }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const code = body?.error?.code as string | undefined;
        const known = code && ["short", "long", "start", "chars", "underscore", "reserved", "taken", "rate_limited"].includes(code);
        setNote({ ok: false, text: known ? t.dynamic(`problem.${code}`, t("problem.generic")) : response.status === 403 ? t("handle.ownerOnly") : t("problem.generic") });
        return;
      }
      setLink((current) => ({ ...current, ...body.data }));
      setDraft(body.data.handle);
      setEditing(false);
      setNote({ ok: true, text: t("handle.saved") });
    } catch {
      setNote({ ok: false, text: t("problem.generic") });
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link.shortUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // The link is on screen to select by hand.
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: link.storeName, text: message });
    } catch {
      // Closing the share sheet throws; nothing to do.
    }
  }

  async function downloadPng() {
    if (!cardRef.current) return;
    setPng("busy");
    try {
      const { toPng } = await import("html-to-image");
      // About 1200px wide: sharp when printed at flyer size.
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 4, backgroundColor: "#FFFFFF", cacheBust: true });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${link.handle}-shop-qr.png`;
      a.click();
      setPng("idle");
    } catch {
      setPng("failed");
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
      <div className="grid min-w-0 content-start gap-4">
        <Card className="grid gap-4 p-5">
          <CardHead title={t("handle.label")} />
          {editing ? (
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <label htmlFor="shop-handle" className={`${FIELD_LABEL} sr-only`}>{t("handle.label")}</label>
              <div className="flex items-center gap-2">
                <span className="text-[18px] font-extrabold text-app-ink-soft" aria-hidden>@</span>
                <input
                  id="shop-handle"
                  className={FIELD_INPUT}
                  value={draft}
                  maxLength={40}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setNote(null);
                  }}
                  aria-describedby="shop-handle-help"
                  aria-invalid={Boolean(shape)}
                />
              </div>
              <p id="shop-handle-help" className={FIELD_HELP}>{shape ? t(`problem.${shape}`) : t("handle.help")}</p>
              <p className="m-0 rounded-[14px] bg-app-canvas px-3 py-2 text-[13px] leading-[1.5] text-app-ink-soft">{t("handle.warn")}</p>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className={BTN_INK} disabled={saving || Boolean(shape)}>{t("handle.save")}</button>
                <button
                  type="button"
                  className={BTN_WHITE}
                  onClick={() => {
                    setEditing(false);
                    setDraft(link.handle);
                    setNote(null);
                  }}
                >
                  {t("handle.cancel")}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="min-w-0 break-all text-[26px] font-extrabold tracking-[-0.02em]">@{link.handle}</span>
              {link.canEdit ? (
                <button type="button" className={BTN_WHITE} onClick={() => setEditing(true)}>
                  <Icon name="edit" size={16} /> {t("handle.change")}
                </button>
              ) : (
                <span className="text-[13px] text-app-ink-soft">{t("handle.ownerOnly")}</span>
              )}
            </div>
          )}
          {note ? (
            <p role="status" className={`m-0 text-[14px] font-bold ${note.ok ? "text-app-success" : "text-app-danger"}`}>{note.text}</p>
          ) : null}
        </Card>

        <Card className="grid gap-3 p-5">
          <CardHead title={t("link.label")} sub={t("link.opens", { url: link.storeUrl.replace(/^https?:\/\//, "") })} />
          <div className="break-all rounded-[14px] bg-app-canvas px-4 py-3 font-mono text-[15px]">{link.shortHost}</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BTN_WHITE} onClick={() => void copy()}>
              <Icon name={copied ? "check" : "copy"} size={16} /> {copied ? t("copied") : t("copy")}
            </button>
            <a className={BTN_WHITE} href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
              <Icon name="whatsapp" size={16} /> {t("whatsapp")}
            </a>
            {canShare ? (
              <button type="button" className={BTN_WHITE} onClick={() => void nativeShare()}>
                <Icon name="send" size={16} /> {t("share")}
              </button>
            ) : null}
            <a className={BTN_WHITE} href={link.shortUrl} target="_blank" rel="noopener noreferrer">
              <Icon name="eye" size={16} /> {t("open")}
            </a>
          </div>
          <span className="sr-only" aria-live="polite">{copied ? t("copied") : ""}</span>
        </Card>

        <Card className="grid gap-3 p-5">
          <CardHead title={t("print.title")} sub={t("print.sub")} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BTN_INK} onClick={() => void downloadPng()} disabled={png === "busy"}>
              <Icon name="download" size={16} /> {png === "busy" ? t("print.saving") : t("print.png")}
            </button>
            <Link className={BTN_WHITE} href="/home/store/share/print?size=sticker" target="_blank">
              <Icon name="document" size={16} /> {t("print.stickers")}
            </Link>
            <Link className={BTN_WHITE} href="/home/store/share/print?size=flyer" target="_blank">
              <Icon name="document" size={16} /> {t("print.flyer")}
            </Link>
          </div>
          {png === "failed" ? <p role="alert" className="m-0 text-[14px] font-bold text-app-danger">{t("print.failed")}</p> : null}
        </Card>
      </div>

      <div className="grid content-start justify-items-center gap-2">
        <p className="m-0 text-[12px] font-bold uppercase tracking-[0.14em] text-app-ink-soft">{t("card.preview")}</p>
        <ShopShareCard
          ref={cardRef}
          name={link.storeName}
          logoUrl={link.logoUrl}
          handle={link.handle}
          shortUrl={link.shortUrl}
          shortHost={link.shortHost}
          plug={plug}
        />
      </div>
    </div>
  );
}
