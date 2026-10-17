"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Spinner, cx } from "@/components/app-ui";
import { useT } from "@/components/i18n/I18nProvider";
import { isHttpsMediaUrl } from "@shared/media";
import { chooseFile, uploadToMyMedia } from "./media-client";
import { MediaLibraryDialog } from "./MediaLibraryDialog";

// Several pictures in order (the first is the cover): "Upload", "Choose from my media" (tick several), remove, move
// earlier, and "Paste links instead" (one per line). Writes the links, one per line, into a hidden input called
// `name` for server-action forms, and/or calls onChange.

export function MediaListField({
  name,
  defaultValue = [],
  onChange,
  max = 12,
  className,
  id,
}: {
  /** Given to the Upload button, so a <label htmlFor> points at the field. */
  id?: string;
  name?: string;
  defaultValue?: string[];
  onChange?: (urls: string[]) => void;
  max?: number;
  className?: string;
}) {
  const t = useT("media");
  const [urls, setUrls] = useState<string[]>(defaultValue.filter(Boolean).slice(0, max));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [linksDraft, setLinksDraft] = useState("");

  const update = (next: string[]) => {
    const clean = [...new Set(next.filter(Boolean))].slice(0, max);
    setUrls(clean);
    onChange?.(clean);
  };

  const upload = async () => {
    const file = await chooseFile("image/jpeg,image/png,image/webp,image/gif");
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const asset = await uploadToMyMedia(file, "image");
      update([...urls, asset.url]);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("field.uploadFailed"));
    } finally {
      setBusy(false);
    }
  };

  const applyLinks = () => {
    const lines = linksDraft.split(/[\n,]/).map((line) => line.trim()).filter(Boolean);
    const bad = lines.find((line) => !isHttpsMediaUrl(line));
    if (bad) {
      setError(t("field.linkBad"));
      return;
    }
    setError("");
    update(lines);
    setLinksOpen(false);
  };

  const move = (index: number) => {
    if (index <= 0) return;
    const next = [...urls];
    [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
    update(next);
  };

  const button = "inline-flex min-h-[42px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13.5px] font-bold text-app-ink hover:border-app-line-strong disabled:opacity-60";

  return (
    <div className={cx("grid gap-2.5", className)}>
      {name ? <input type="hidden" name={name} value={urls.join("\n")} /> : null}
      {urls.length ? (
        <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-4">
          {urls.map((url, index) => (
            <li key={url} className="relative aspect-square overflow-hidden rounded-[12px] border border-app-line bg-app-canvas">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
              {index === 0 ? <span className="absolute bottom-1.5 left-1.5 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold">{t("list.cover")}</span> : (
                <button type="button" onClick={() => move(index)} aria-label={t("list.earlier", { n: index + 1 })} className="absolute bottom-1.5 left-1.5 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-app-ink">
                  <Icon name="arrowLeft" size={14} />
                </button>
              )}
              <button type="button" onClick={() => update(urls.filter((_, i) => i !== index))} aria-label={t("list.remove", { n: index + 1 })} className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full bg-app-ink/70 text-white hover:bg-app-ink">
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 rounded-[14px] border border-dashed border-app-line-strong bg-app-canvas px-4 py-6 text-center text-[13.5px] text-app-ink-soft">{t("list.empty")}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" id={id} className={button} onClick={() => void upload()} disabled={busy || urls.length >= max}>
          {busy ? <Spinner className="h-4 w-4" /> : <Icon name="upload" size={14} />} {busy ? t("field.uploading") : t("field.upload")}
        </button>
        <button type="button" className={button} onClick={() => setLibraryOpen(true)} disabled={busy || urls.length >= max}>
          <Icon name="grid" size={14} /> {t("field.choose")}
        </button>
        <button type="button" className="inline-flex min-h-[32px] items-center gap-1 text-[12.5px] font-semibold text-app-ink-soft underline-offset-2 hover:text-app-ink hover:underline" onClick={() => { setLinksDraft(urls.join("\n")); setLinksOpen(!linksOpen); }}>
          <Icon name="link" size={13} /> {t("list.pasteLinks")}
        </button>
      </div>
      {linksOpen ? (
        <div className="grid gap-2">
          <textarea
            aria-label={t("list.pasteLinks")}
            rows={4}
            value={linksDraft}
            onChange={(event) => setLinksDraft(event.target.value)}
            placeholder={t("field.linkPh")}
            className="w-full rounded-[14px] border border-app-line bg-white px-3.5 py-2.5 font-mono text-[13px] text-app-ink outline-none focus:border-app-ink"
          />
          <p className="m-0 text-[12.5px] text-app-ink-soft">{t("list.linksHint")}</p>
          <button type="button" className={cx(button, "w-fit")} onClick={applyLinks}>{t("field.linkUse")}</button>
        </div>
      ) : null}
      {error ? <p className="m-0 text-[13px] font-semibold text-app-danger" role="alert">{error}</p> : null}
      <MediaLibraryDialog
        open={libraryOpen}
        multiple
        onClose={() => setLibraryOpen(false)}
        onSelect={(assets) => update([...urls, ...assets.map((asset) => asset.url)])}
      />
    </div>
  );
}
