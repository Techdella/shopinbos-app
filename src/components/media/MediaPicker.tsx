"use client";

import { useId, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Spinner, cx } from "@/components/app-ui";
import { useT } from "@/components/i18n/I18nProvider";
import { isHttpsMediaUrl } from "@shared/media";
import { acceptFor, chooseFile, isVideoUrl, uploadToMyMedia } from "./media-client";
import { MediaLibraryDialog } from "./MediaLibraryDialog";

// One picture field for the whole app: a thumbnail with "Upload", "Choose from my media" and "Remove", plus a small
// "Paste a link instead" for people who already have a link. Uploads go to the person's media library
// (/api/app/media), so the same picture can be picked again anywhere.
//
// Two ways to use it:
//   * server-action / plain forms: <MediaPicker name="imageUrl" defaultValue={...} /> writes the link into a hidden
//     input called `name`;
//   * client state: <MediaPicker value={url} onChange={setUrl} />.

export interface MediaPickerProps {
  /** Hidden input name, for forms that post. */
  name?: string;
  /** Controlled value. Leave undefined to let the field keep its own (starting from defaultValue). */
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (url: string) => void;
  label?: string;
  help?: string;
  /** "image" (default): pictures only. "any": pictures or videos. */
  accept?: "image" | "any";
  /** Show "Paste a link instead" (default true). */
  allowLink?: boolean;
  shape?: "square" | "wide";
  /** Smaller thumbnail and buttons, for narrow side panels. */
  compact?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function MediaPicker({
  name,
  value,
  defaultValue,
  onChange,
  label,
  help,
  accept = "image",
  allowLink = true,
  shape = "wide",
  compact = false,
  disabled = false,
  className,
  id,
}: MediaPickerProps) {
  const t = useT("media");
  const autoId = useId();
  const fieldId = id ?? autoId;
  const controlled = value !== undefined;
  const [own, setOwn] = useState(defaultValue ?? "");
  const url = (controlled ? value : own) ?? "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const set = (next: string) => {
    setError("");
    if (!controlled) setOwn(next);
    onChange?.(next);
  };

  const upload = async () => {
    const file = await chooseFile(acceptFor(accept));
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const asset = await uploadToMyMedia(file, accept);
      set(asset.url);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("field.uploadFailed"));
    } finally {
      setBusy(false);
    }
  };

  const applyLink = () => {
    const next = draft.trim();
    if (!next) return;
    if (!isHttpsMediaUrl(next)) {
      setError(t("field.linkBad"));
      return;
    }
    set(next);
    setLinkOpen(false);
  };

  const button = cx(
    "inline-flex items-center gap-1.5 rounded-full border border-app-line bg-white font-bold text-app-ink hover:border-app-line-strong disabled:opacity-60",
    compact ? "min-h-[36px] px-3 text-[12.5px]" : "min-h-[42px] px-4 text-[13.5px]",
  );
  const thumb = cx(
    "relative grid shrink-0 place-items-center overflow-hidden border border-app-line bg-app-canvas",
    shape === "square" ? (compact ? "h-14 w-14 rounded-[12px]" : "h-20 w-20 rounded-[14px]") : compact ? "h-14 w-[96px] rounded-[12px]" : "h-[84px] w-[150px] rounded-[14px]",
  );
  const showVideo = Boolean(url) && isVideoUrl(url);

  return (
    <div className={cx("grid gap-1.5", className)} data-media-picker="">
      {label ? <label htmlFor={`${fieldId}-choose`} className="block text-[14px] font-extrabold text-app-ink">{label}</label> : null}
      {name ? <input type="hidden" name={name} value={url} /> : null}
      <div className="flex flex-wrap items-center gap-3">
        <div className={thumb} aria-label={url ? t("field.preview") : undefined} role={url ? "img" : undefined}>
          {busy ? (
            <Spinner />
          ) : url ? (
            showVideo ? (
              <video src={`${url}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="" className="h-full w-full object-cover" />
            )
          ) : (
            <span className="px-1.5 text-center text-[11.5px] font-semibold leading-tight text-app-ink-soft">
              <Icon name="image" size={compact ? 16 : 20} className="mx-auto mb-0.5" />
              {!compact ? (accept === "any" ? t("field.emptyVideo") : t("field.empty")) : null}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <button type="button" className={button} onClick={() => void upload()} disabled={disabled || busy}>
            <Icon name="upload" size={14} /> {busy ? t("field.uploading") : url ? t("field.change") : t("field.upload")}
          </button>
          <button type="button" id={`${fieldId}-choose`} className={button} onClick={() => setLibraryOpen(true)} disabled={disabled || busy}>
            <Icon name="grid" size={14} /> {t("field.choose")}
          </button>
          {url && !busy ? (
            <button type="button" onClick={() => set("")} disabled={disabled} className={cx("font-semibold text-app-ink-soft hover:text-app-danger", compact ? "min-h-[36px] px-1.5 text-[12.5px]" : "min-h-[42px] px-2 text-[13.5px]")}>
              {t("field.remove")}
            </button>
          ) : null}
        </div>
      </div>

      {allowLink ? (
        linkOpen ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={`${fieldId}-link`}
              type="url"
              inputMode="url"
              aria-label={t("field.linkLabel")}
              placeholder={t("field.linkPh")}
              value={draft}
              disabled={disabled}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyLink();
                }
              }}
              className="min-h-[42px] min-w-0 flex-1 basis-[200px] rounded-[12px] border border-app-line bg-white px-3 text-[14px] text-app-ink outline-none focus:border-app-ink"
            />
            <button type="button" className={button} onClick={applyLink} disabled={disabled || !draft.trim()}>{t("field.linkUse")}</button>
            <button type="button" className="min-h-[36px] px-1 text-[12.5px] font-semibold text-app-ink-soft hover:text-app-ink" onClick={() => setLinkOpen(false)}>{t("field.hideLink")}</button>
          </div>
        ) : (
          <button type="button" className="inline-flex min-h-[32px] w-fit items-center gap-1 text-[12.5px] font-semibold text-app-ink-soft underline-offset-2 hover:text-app-ink hover:underline" onClick={() => { setDraft(url); setLinkOpen(true); }} disabled={disabled}>
            <Icon name="link" size={13} /> {t("field.pasteLink")}
          </button>
        )
      ) : null}

      {help ? <p className="m-0 text-[13px] leading-[1.5] text-app-ink-soft">{help}</p> : null}
      {error ? <p className="m-0 text-[13px] font-semibold text-app-danger" role="alert">{error}</p> : null}

      <MediaLibraryDialog
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        accept={accept}
        onSelect={(assets) => assets[0] && set(assets[0].url)}
      />
    </div>
  );
}
