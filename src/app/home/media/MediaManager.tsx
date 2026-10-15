"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { Card, EmptyState, cx } from "@/components/app-kit";
import { PillButton, Spinner } from "@/components/app-ui";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatDate } from "@shared/i18n";
import { MEDIA_ALT_MAX, MEDIA_TITLE_MAX, cleanMediaText, mediaLabel, mediaSizeLabel, type MediaKind } from "@shared/media";
import { acceptFor, chooseFile, listMyMedia, removeFromMyMedia, updateMyMedia, uploadToMyMedia, type MediaAssetView } from "@/components/media/media-client";

// The Media page's grid: search, Pictures / Videos filter, upload, "Show more" (pages of /api/app/media), and per
// file a details sheet to set its title and alt text, copy or open its link, or remove it from the library.

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

type T = ReturnType<typeof useT<["media"]>>;

function nameOf(asset: MediaAssetView, t: T) {
  const sourceKey = SOURCE_KEYS[asset.source as keyof typeof SOURCE_KEYS];
  return mediaLabel(asset) || (sourceKey ? t(sourceKey) : asset.kind === "video" ? t("lib.video") : t("lib.picture"));
}

/** Copies text, falling back to a hidden textarea where the Clipboard API is missing (older phones, http). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let done = false;
    try {
      done = document.execCommand("copy");
    } catch {
      done = false;
    }
    area.remove();
    return done;
  }
}

function useCopyLink() {
  const t = useT("media");
  const { toast } = useToast();
  return useCallback(
    async (url: string) => {
      const copied = await copyText(url);
      toast(copied ? t("page.copied") : t("page.copyFailed"), copied ? "success" : "error");
    },
    [t, toast],
  );
}

function Preview({ asset, className, controls = false }: { asset: MediaAssetView; className?: string; controls?: boolean }) {
  if (asset.kind === "video") {
    return <video src={controls ? asset.url : `${asset.url}#t=0.1`} muted={!controls} controls={controls} playsInline preload="metadata" className={className} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={asset.url} alt={asset.alt ?? ""} loading="lazy" className={className} />;
}

export function MediaManager() {
  const t = useT("media");
  const locale = useLocale();
  const { toast } = useToast();
  const copyLink = useCopyLink();
  const searchId = useId();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<MediaKind | null>(null);
  const [items, setItems] = useState<MediaAssetView[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

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
          setTotal(result.meta.total);
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

  const loadMore = async () => {
    setLoading(true);
    try {
      const result = await listMyMedia({ q, kind, page: page + 1 });
      setItems((current) => [...current, ...result.data.filter((row) => !current.some((entry) => entry.id === row.id))]);
      setPage(page + 1);
      setTotal(result.meta.total);
      setHasMore(result.meta.hasMore);
    } catch {
      toast(t("lib.loadFailed"), "error");
    } finally {
      setLoading(false);
    }
  };

  const upload = async () => {
    const file = await chooseFile(acceptFor("any"));
    if (!file) return;
    setUploading(true);
    try {
      const asset = await uploadToMyMedia(file, "any");
      if (!kind || kind === asset.kind) {
        setItems((current) => [asset, ...current.filter((entry) => entry.url !== asset.url)]);
        setTotal((n) => n + 1);
      }
      toast(t("page.uploaded"), "success");
      if (asset.id) setOpenId(asset.id);
    } catch (error) {
      toast(error instanceof Error && error.message ? error.message : t("field.uploadFailed"), "error");
    } finally {
      setUploading(false);
    }
  };

  const open = items.find((entry) => entry.id === openId) ?? null;

  return (
    <div className="grid gap-4">
      <Card className="grid gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={searchId} className="sr-only">{t("lib.search")}</label>
          <div className="flex min-h-[44px] min-w-0 flex-1 basis-[240px] items-center gap-2 rounded-full border border-app-line px-4 focus-within:border-app-ink">
            <Icon name="search" size={16} />
            <input id={searchId} type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder={t("lib.searchPh")} className="min-w-0 flex-1 border-0 bg-transparent text-[15px] outline-none" />
          </div>
          <PillButton tone="ink" size="md" onClick={() => void upload()} busy={uploading}>
            <Icon name="upload" size={16} /> {t("page.upload")}
          </PillButton>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex gap-1.5" role="group" aria-label={t("lib.search")}>
            {([null, "image", "video"] as const).map((value) => (
              <button key={value ?? "all"} type="button" aria-pressed={kind === value} onClick={() => setKind(value)} className={cx("min-h-9 rounded-full border px-3.5 text-[13px] font-bold", kind === value ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink")}>
                {value === null ? t("lib.all") : value === "image" ? t("lib.images") : t("lib.videos")}
              </button>
            ))}
          </div>
          {!loading || items.length ? <span className="ml-auto text-[13px] font-semibold text-app-ink-soft" aria-live="polite">{t("page.count", { count: total })}</span> : null}
        </div>
      </Card>

      {loadError && !items.length ? (
        <EmptyState icon="image" title={loadError} action={<PillButton tone="white" size="sm" onClick={() => setReload((n) => n + 1)}>{t("lib.retry")}</PillButton>} />
      ) : loading && !items.length ? (
        <div className="flex items-center justify-center gap-2 py-16 text-[14px] text-app-ink-soft" role="status"><Spinner /> {t("lib.loading")}</div>
      ) : !items.length ? (
        <EmptyState icon="image" title={q ? t("page.noMatch", { q }) : t("lib.title")} action={!q ? <PillButton tone="ink" size="md" onClick={() => void upload()} busy={uploading}><Icon name="upload" size={16} /> {t("page.upload")}</PillButton> : undefined}>
          {!q ? t("page.empty") : undefined}
        </EmptyState>
      ) : (
        <>
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {items.map((asset) => {
              const name = nameOf(asset, t);
              const meta = [mediaSizeLabel(asset.bytes), formatDate(asset.createdAt, locale)].filter(Boolean).join(" · ");
              return (
                <li key={asset.id || asset.url} className="flex min-w-0 flex-col overflow-hidden rounded-[18px] border border-app-line bg-white">
                  <button
                    type="button"
                    onClick={() => asset.id && setOpenId(asset.id)}
                    aria-label={t("page.details", { name })}
                    className="relative block aspect-square w-full overflow-hidden bg-app-canvas outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-app-ink"
                  >
                    <Preview asset={asset} className="h-full w-full object-cover" />
                    {asset.kind === "video" ? <span className="absolute bottom-2 left-2 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white"><Icon name="play" size={12} /></span> : null}
                  </button>
                  <div className="grid gap-0.5 px-3 pb-1 pt-2.5">
                    <p className="m-0 truncate text-[14px] font-bold" title={name}>{name}</p>
                    <p className="m-0 truncate text-[12.5px] text-app-ink-soft">{meta}</p>
                    {asset.kind === "image" && !asset.alt ? <p className="m-0 text-[12px] font-semibold text-app-ink-soft">{t("page.noAlt")}</p> : null}
                  </div>
                  <div className="mt-auto flex items-center gap-1 px-1.5 pb-1.5">
                    <button type="button" onClick={() => void copyLink(asset.url)} className="inline-flex min-h-[40px] min-w-0 flex-1 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-bold hover:bg-app-canvas">
                      <Icon name="copy" size={14} /> <span className="truncate">{t("page.copyLink")}</span>
                    </button>
                    <a href={asset.url} target="_blank" rel="noopener noreferrer" aria-label={t("page.openNew")} title={t("page.openNew")} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-app-ink hover:bg-app-canvas">
                      <Icon name="arrow" size={15} />
                    </a>
                    {asset.id ? (
                      <button type="button" onClick={() => setOpenId(asset.id)} aria-label={t("page.details", { name })} title={t("page.details", { name })} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-app-ink hover:bg-app-canvas">
                        <Icon name="edit" size={15} />
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          {hasMore ? (
            <div className="flex justify-center">
              <PillButton tone="white" size="md" onClick={() => void loadMore()} busy={loading}>{t("lib.more")}</PillButton>
            </div>
          ) : null}
        </>
      )}

      {open ? (
        <DetailsSheet
          key={open.id}
          asset={open}
          onClose={() => setOpenId(null)}
          onSaved={(saved) => setItems((current) => current.map((entry) => (entry.id === saved.id ? saved : entry)))}
          onRemoved={(id) => {
            setItems((current) => current.filter((entry) => entry.id !== id));
            setTotal((n) => Math.max(0, n - 1));
            setOpenId(null);
          }}
        />
      ) : null}
    </div>
  );
}

function DetailsSheet({ asset, onClose, onSaved, onRemoved }: { asset: MediaAssetView; onClose: () => void; onSaved: (asset: MediaAssetView) => void; onRemoved: (id: string) => void }) {
  const t = useT("media");
  const locale = useLocale();
  const { toast } = useToast();
  const copyLink = useCopyLink();
  const titleId = useId();
  const fieldId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [title, setTitle] = useState(asset.title ?? "");
  const [alt, setAlt] = useState(asset.alt ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const name = nameOf(asset, t);
  const isImage = asset.kind === "image";
  const changed = cleanMediaText(title, MEDIA_TITLE_MAX) !== (asset.title ?? null) || (isImage && cleanMediaText(alt, MEDIA_ALT_MAX) !== (asset.alt ?? null));

  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => setMounted(true), []);

  // Focus, Escape and page scroll lock (once per sheet: saving re-renders the page behind it).
  useEffect(() => {
    if (!mounted) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("input")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close.current();
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
  }, [mounted]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const saved = await updateMyMedia(asset.id, isImage ? { title: title.trim() || null, alt: alt.trim() || null } : { title: title.trim() || null });
      onSaved(saved);
      setTitle(saved.title ?? "");
      setAlt(saved.alt ?? "");
      toast(t("page.saved"), "success");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("page.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      await removeFromMyMedia(asset.id);
      toast(t("lib.removed"), "success");
      onRemoved(asset.id);
    } catch {
      setRemoving(false);
      setError(t("lib.removeFailed"));
    }
  };

  if (!mounted) return null;

  const facts: Array<[string, string]> = [
    [t("page.fileName"), asset.name ?? "—"],
    [t("page.size"), mediaSizeLabel(asset.bytes) || "—"],
    ...(asset.width && asset.height ? [[t("page.dimensions"), `${asset.width} × ${asset.height}`] as [string, string]] : []),
    [t("page.added"), formatDate(asset.createdAt, locale)],
    [t("page.from"), SOURCE_KEYS[asset.source as keyof typeof SOURCE_KEYS] ? t(SOURCE_KEYS[asset.source as keyof typeof SOURCE_KEYS]) : asset.source],
  ];
  const input = "min-h-[44px] w-full rounded-[12px] border border-app-line bg-white px-3 text-[15px] text-app-ink outline-none focus:border-app-ink";

  return createPortal(
    <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/45 font-app text-app-ink sm:items-center sm:p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[24px] bg-white shadow-xl sm:max-w-[900px] sm:rounded-[24px]">
        <div className="flex items-center gap-3 border-b border-app-line px-4 py-3 sm:px-5">
          <h2 id={titleId} className="m-0 min-w-0 flex-1 truncate text-[17px] font-extrabold">{name}</h2>
          <button type="button" onClick={onClose} aria-label={t("lib.close")} className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-app-canvas">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid place-items-center bg-app-canvas p-4">
            <Preview asset={asset} controls className="max-h-[52dvh] w-auto max-w-full rounded-[12px] object-contain" />
          </div>

          <div className="grid content-start gap-4 p-4 sm:p-5">
            <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13.5px]">
              {facts.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="font-semibold text-app-ink-soft">{label}</dt>
                  <dd className="m-0 truncate" title={value}>{value}</dd>
                </div>
              ))}
            </dl>

            <div className="grid gap-1.5">
              <label htmlFor={`${fieldId}-title`} className="text-[14px] font-extrabold">{t("page.titleLabel")}</label>
              <input id={`${fieldId}-title`} value={title} maxLength={MEDIA_TITLE_MAX} onChange={(event) => setTitle(event.target.value)} placeholder={asset.name ?? ""} className={input} />
              <p className="m-0 text-[12.5px] leading-[1.5] text-app-ink-soft">{t("page.titleHelp")}</p>
            </div>

            {isImage ? (
              <div className="grid gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor={`${fieldId}-alt`} className="text-[14px] font-extrabold">{t("page.altLabel")}</label>
                  <span className="font-mono text-[11.5px] text-app-ink-soft">{t("page.chars", { count: alt.length, max: MEDIA_ALT_MAX })}</span>
                </div>
                <textarea id={`${fieldId}-alt`} value={alt} maxLength={MEDIA_ALT_MAX} rows={3} onChange={(event) => setAlt(event.target.value)} placeholder={t("page.altPh")} className={cx(input, "resize-y py-2.5 leading-[1.45]")} />
                <p className="m-0 text-[12.5px] leading-[1.5] text-app-ink-soft">{t("page.altHelp")}</p>
              </div>
            ) : null}

            {error ? <p role="alert" className="m-0 rounded-[12px] bg-app-danger-tint px-3 py-2 text-[13.5px] font-semibold text-app-danger">{error}</p> : null}

            <PillButton tone="ink" size="md" onClick={() => void save()} busy={saving} disabled={!changed} className="w-full">{t("page.save")}</PillButton>

            <div className="grid gap-1.5">
              <label htmlFor={`${fieldId}-link`} className="text-[14px] font-extrabold">{t("page.link")}</label>
              <input id={`${fieldId}-link`} readOnly value={asset.url} onFocus={(event) => event.currentTarget.select()} className={cx(input, "font-mono text-[12.5px]")} />
              <div className="flex flex-wrap gap-2">
                <PillButton tone="white" size="sm" onClick={() => void copyLink(asset.url)}><Icon name="copy" size={14} /> {t("page.copyLink")}</PillButton>
                <a href={asset.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[38px] items-center gap-2 rounded-full border border-app-line bg-white px-4 text-[13px] font-bold text-app-ink no-underline hover:border-app-line-strong">
                  <Icon name="arrow" size={14} /> {t("page.openNew")}
                </a>
              </div>
            </div>

            <div className="border-t border-app-line pt-3">
              {confirmRemove ? (
                <div className="grid gap-2 rounded-[14px] bg-app-danger-tint p-3" role="alertdialog" aria-labelledby={`${fieldId}-rm`} aria-describedby={`${fieldId}-rmw`}>
                  <p id={`${fieldId}-rm`} className="m-0 text-[14px] font-extrabold text-app-danger">{t("page.removeAsk")}</p>
                  <p id={`${fieldId}-rmw`} className="m-0 text-[13px] leading-[1.5] text-app-ink">{t("page.removeWarn")}</p>
                  <div className="flex flex-wrap gap-2">
                    <PillButton tone="ink" size="sm" onClick={() => void remove()} busy={removing}>{t("page.removeYes")}</PillButton>
                    <PillButton tone="white" size="sm" onClick={() => setConfirmRemove(false)} disabled={removing}>{t("page.removeNo")}</PillButton>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmRemove(true)} className="inline-flex min-h-[40px] items-center gap-1.5 px-1 text-[13px] font-semibold text-app-ink-soft hover:text-app-danger">
                  <Icon name="trash" size={14} /> {t("page.remove")}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
