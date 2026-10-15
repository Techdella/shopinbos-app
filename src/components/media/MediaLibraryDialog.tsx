"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { PillButton, Spinner, cx } from "@/components/app-ui";
import { useT } from "@/components/i18n/I18nProvider";
import { mediaLabel, type MediaKind } from "@shared/media";
import { acceptFor, chooseFile, chooseFiles, listMyMedia, removeFromMyMedia, uploadToMyMedia, type MediaAssetView } from "./media-client";

// "My media": a grid of the person's pictures (newest first) with search and an upload button. A bottom sheet on
// phones, a centred dialog from sm up. Picks one (tap, then "Use this picture") or several (`multiple`).

const SOURCE_KEYS = {
  upload: "src.upload",
  product: "src.product",
  logo: "src.logo",
  ai: "src.ai",
  editor: "src.editor",
  banner: "src.banner",
  collection: "src.collection",
  cms: "src.cms",
} as const;

export interface MediaLibraryDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (assets: MediaAssetView[]) => void;
  /** Let the person tick several pictures. */
  multiple?: boolean;
  /** "image" (default) shows pictures only; "any" also shows videos. */
  accept?: "image" | "any";
  title?: string;
}

export function MediaLibraryDialog(props: MediaLibraryDialogProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!props.open || !mounted) return null;
  return createPortal(<LibrarySheet {...props} />, document.body);
}

function LibrarySheet({ onClose, onSelect, multiple = false, accept = "image", title }: MediaLibraryDialogProps) {
  const t = useT("media");
  const titleId = useId();
  const searchId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<MediaKind | null>(accept === "image" ? "image" : null);
  const [items, setItems] = useState<MediaAssetView[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [picked, setPicked] = useState<MediaAssetView[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [reload, setReload] = useState(0);

  // Focus, Escape and page scroll lock.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("input")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [onClose]);

  // First page, again whenever the search or filter changes.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setLoadError("");
      listMyMedia({ q, kind, page: 1, signal: controller.signal })
        .then((result) => {
          setItems(result.data);
          setPage(1);
          setHasMore(result.meta.hasMore);
        })
        .catch(() => {
          if (!controller.signal.aborted) setLoadError(t("lib.loadFailed"));
        })
        .finally(() => !controller.signal.aborted && setLoading(false));
    }, q ? 250 : 0);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [q, kind, reload, t]);

  const loadMore = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listMyMedia({ q, kind, page: page + 1 });
      setItems((current) => [...current, ...result.data.filter((row) => !current.some((entry) => entry.id === row.id))]);
      setPage(page + 1);
      setHasMore(result.meta.hasMore);
    } catch {
      setLoadError(t("lib.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [q, kind, page, t]);

  const finish = (assets: MediaAssetView[]) => {
    if (!assets.length) return;
    onSelect(assets);
    onClose();
  };

  const upload = async () => {
    const files = multiple ? await chooseFiles(acceptFor(accept)) : [await chooseFile(acceptFor(accept))].filter((file): file is File => Boolean(file));
    if (!files.length) return;
    setUploading(true);
    setMessage(null);
    try {
      const uploaded: MediaAssetView[] = [];
      for (const file of files) uploaded.push(await uploadToMyMedia(file, accept));
      if (!multiple) {
        finish(uploaded);
        return;
      }
      setItems((current) => [...uploaded, ...current.filter((entry) => !uploaded.some((asset) => asset.url === entry.url))]);
      setPicked((current) => [...current, ...uploaded.filter((asset) => !current.some((entry) => entry.url === asset.url))]);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : t("field.uploadFailed") });
    } finally {
      setUploading(false);
    }
  };

  const toggle = (asset: MediaAssetView) => {
    setMessage(null);
    if (!multiple) {
      setPicked((current) => (current[0]?.url === asset.url ? [] : [asset]));
      return;
    }
    setPicked((current) => (current.some((entry) => entry.url === asset.url) ? current.filter((entry) => entry.url !== asset.url) : [...current, asset]));
  };

  const removeSelected = async () => {
    const target = picked[0];
    if (!target?.id) return;
    try {
      await removeFromMyMedia(target.id);
      setItems((current) => current.filter((entry) => entry.id !== target.id));
      setPicked([]);
      setMessage({ tone: "ok", text: t("lib.removed") });
    } catch {
      setMessage({ tone: "error", text: t("lib.removeFailed") });
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/45 font-app text-app-ink sm:items-center sm:p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[24px] bg-white shadow-xl sm:max-w-[760px] sm:rounded-[24px]">
        <div className="flex items-center gap-3 border-b border-app-line px-4 py-3 sm:px-5">
          <h2 id={titleId} className="m-0 min-w-0 flex-1 truncate text-[17px] font-extrabold">{title ?? (multiple ? t("lib.titleMany") : t("lib.title"))}</h2>
          <PillButton tone="white" size="sm" onClick={() => void upload()} busy={uploading} aria-label={t("lib.upload")}>
            <Icon name="upload" size={15} /> <span>{t("lib.upload")}</span>
          </PillButton>
          <button type="button" onClick={onClose} aria-label={t("lib.close")} className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-app-canvas">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="grid gap-2 border-b border-app-line px-4 py-3 sm:px-5">
          <label htmlFor={searchId} className="sr-only">{t("lib.search")}</label>
          <div className="flex min-h-[44px] items-center gap-2 rounded-full border border-app-line px-4 focus-within:border-app-ink">
            <Icon name="search" size={16} />
            <input id={searchId} type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder={t("lib.searchPh")} className="min-w-0 flex-1 border-0 bg-transparent text-[15px] outline-none" />
          </div>
          {accept === "any" ? (
            <div className="flex gap-1.5" role="group" aria-label={t("lib.search")}>
              {([null, "image", "video"] as const).map((value) => (
                <button key={value ?? "all"} type="button" aria-pressed={kind === value} onClick={() => setKind(value)} className={cx("min-h-9 rounded-full border px-3.5 text-[13px] font-bold", kind === value ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink")}>
                  {value === null ? t("lib.all") : value === "image" ? t("lib.images") : t("lib.videos")}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="min-h-[220px] flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          {message ? (
            <p role={message.tone === "error" ? "alert" : "status"} className={cx("m-0 mb-3 rounded-[12px] px-3 py-2 text-[13.5px] font-semibold", message.tone === "error" ? "bg-app-danger-tint text-app-danger" : "bg-app-canvas text-app-ink")}>{message.text}</p>
          ) : null}
          {loadError && !items.length ? (
            <div className="grid place-items-center gap-3 py-10 text-center">
              <p className="m-0 text-[14px] text-app-ink-soft">{loadError}</p>
              <PillButton tone="white" size="sm" onClick={() => setReload((n) => n + 1)}>{t("lib.retry")}</PillButton>
            </div>
          ) : loading && !items.length ? (
            <div className="flex items-center justify-center gap-2 py-12 text-[14px] text-app-ink-soft" role="status"><Spinner /> {t("lib.loading")}</div>
          ) : !items.length ? (
            <div className="grid place-items-center gap-3 py-10 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-app-canvas text-app-ink-soft"><Icon name="image" size={24} /></span>
              <p className="m-0 max-w-[340px] text-[14px] leading-[1.5] text-app-ink-soft">{q ? t("lib.noMatch", { q }) : t("lib.empty")}</p>
              {!q ? <PillButton tone="ink" size="md" onClick={() => void upload()} busy={uploading}><Icon name="upload" size={16} /> {t("lib.upload")}</PillButton> : null}
            </div>
          ) : (
            <>
              <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-4 md:grid-cols-5">
                {items.map((asset) => {
                  const on = picked.some((entry) => entry.url === asset.url);
                  const sourceKey = SOURCE_KEYS[asset.source as keyof typeof SOURCE_KEYS];
                  const label = mediaLabel(asset) || (sourceKey ? t(sourceKey) : asset.kind === "video" ? t("lib.video") : t("lib.picture"));
                  return (
                    <li key={asset.id || asset.url}>
                      <button
                        type="button"
                        onClick={() => toggle(asset)}
                        onDoubleClick={() => !multiple && finish([asset])}
                        aria-pressed={on}
                        aria-label={t("lib.pick", { name: label })}
                        title={label}
                        className={cx("relative block aspect-square w-full overflow-hidden rounded-[12px] border bg-app-canvas outline-none focus-visible:ring-2 focus-visible:ring-app-ink", on ? "border-app-ink ring-2 ring-app-ink" : "border-app-line")}
                      >
                        {asset.kind === "video" ? (
                          <>
                            <video src={`${asset.url}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                            <span className="absolute bottom-1.5 left-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"><Icon name="play" size={11} /></span>
                          </>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={asset.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                        )}
                        {on ? <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-app-ink text-white"><Icon name="check" size={13} /></span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {hasMore ? (
                <div className="mt-4 flex justify-center">
                  <PillButton tone="white" size="sm" onClick={() => void loadMore()} busy={loading}>{t("lib.more")}</PillButton>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-app-line px-4 py-3 sm:px-5" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          {!multiple && picked[0]?.id ? (
            <button type="button" onClick={() => void removeSelected()} className="mr-auto min-h-[40px] px-1 text-[13px] font-semibold text-app-ink-soft underline-offset-2 hover:text-app-danger hover:underline">
              {t("lib.removeFromLib")}
            </button>
          ) : null}
          <PillButton tone="white" size="md" onClick={onClose}>{t("lib.cancel")}</PillButton>
          <PillButton tone="ink" size="md" disabled={!picked.length} onClick={() => finish(picked)}>
            {multiple ? t("lib.useMany", { count: picked.length }) : t("lib.use")}
          </PillButton>
        </div>
      </div>
    </div>
  );
}
