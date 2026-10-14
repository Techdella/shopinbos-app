"use client";

import Link from "next/link";
import { useState } from "react";
import { Spinner, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { rexCardAction, rexProductChoices } from "./api";

const pill = "inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-full px-4 text-[13.5px] font-bold no-underline disabled:opacity-50";
const secondary = cx(pill, "border border-app-line bg-white text-app-ink hover:border-app-line-strong");

/**
 * What a seller can do with a picture Rex made: keep it in their media library, put it on a product (picked here
 * when Rex made it without one), turn it into a social post or an ad, or download it.
 */
export function RexImageActions({ url, name, withProductPicker = true, className }: { url: string; name?: string | null; withProductPicker?: boolean; className?: string }) {
  const t = useT("builder", "common");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string; href?: string } | null>(null);
  const [products, setProducts] = useState<Array<{ id: string; name: string; image: string | null }> | null>(null);
  const [productId, setProductId] = useState("");
  const encoded = encodeURIComponent(url);

  async function saveToMedia() {
    setBusy("media");
    setMessage(null);
    try {
      const result = await rexCardAction({ action: "save_to_media", url, kind: "image", name: name ?? null });
      setSaved(true);
      setMessage({ ok: true, text: result.message });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : t("rex.cd.notSaved") });
    } finally {
      setBusy(null);
    }
  }

  async function openPicker() {
    setBusy("products");
    setMessage(null);
    try {
      const list = await rexProductChoices();
      setProducts(list);
      setProductId(list[0]?.id ?? "");
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : t("rex.cd.notSaved") });
    } finally {
      setBusy(null);
    }
  }

  async function addToProduct() {
    if (!productId) return;
    setBusy("add");
    try {
      const result = await rexCardAction({ action: "save_product_image", productId, imageUrl: url, mode: "add", replaceIndex: null });
      setMessage({ ok: true, text: result.message, href: result.href });
      setProducts(null);
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : t("rex.cd.notSaved") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondary} disabled={saved || busy !== null} onClick={() => void saveToMedia()}>
          {busy === "media" ? <Spinner className="h-4 w-4" /> : <Icon name={saved ? "check" : "image"} size={15} />} {saved ? t("rex.cd.savedMedia") : t("rex.cd.saveMedia")}
        </button>
        {withProductPicker && products === null ? (
          <button type="button" className={secondary} disabled={busy !== null} onClick={() => void openPicker()}>
            {busy === "products" ? <Spinner className="h-4 w-4" /> : <Icon name="box" size={15} />} {t("rex.cd.toProduct")}
          </button>
        ) : null}
        <Link href={`/channels?tab=post&image=${encoded}`} className={secondary}>
          <Icon name="send" size={15} /> {t("rex.cd.post")}
        </Link>
        <Link href={`/home/ads?image=${encoded}`} className={secondary}>
          <Icon name="megaphone" size={15} /> {t("rex.cd.ad")}
        </Link>
        <a href={url} target="_blank" rel="noopener noreferrer" download className={secondary}>
          <Icon name="download" size={15} /> {t("rex.cd.download")}
        </a>
      </div>

      {products !== null ? (
        products.length ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <label htmlFor={`pick-${encoded.slice(-24)}`} className="sr-only">{t("rex.cd.pickProduct")}</label>
            <select
              id={`pick-${encoded.slice(-24)}`}
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-full border border-app-line bg-white px-3 text-[13.5px]"
            >
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
            <button type="button" className={cx(pill, "bg-app-ink text-white")} disabled={busy !== null || !productId} onClick={() => void addToProduct()}>
              {busy === "add" ? <Spinner className="h-4 w-4" /> : <Icon name="plus" size={15} />} {t("rex.cd.addPick")}
            </button>
          </div>
        ) : (
          <p className="m-0 mt-2 text-[13px] text-app-ink-soft">{t("rex.cd.noProducts")}</p>
        )
      ) : null}

      {message ? (
        <p role="status" className={cx("m-0 mt-2 flex flex-wrap items-center gap-x-2 text-[13px] font-bold", message.ok ? "text-app-success" : "text-app-danger")}>
          {message.ok ? <Icon name="checkCircle" size={15} /> : null} {message.text}
          {message.href ? <Link href={message.href} className="font-bold text-app-ink underline">{t("rex.view")}</Link> : null}
        </p>
      ) : null}
    </div>
  );
}
