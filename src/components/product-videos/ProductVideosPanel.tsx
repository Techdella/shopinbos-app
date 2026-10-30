"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { Icon } from "@/components/ui/Icon";
import { confirmDialog } from "@/components/ui/dialogs";
import { clockLabel } from "@shared/status-video";
import {
  CAPTION_MAX,
  MAX_VIDEOS_PER_PRODUCT,
  PRODUCT_POSTER_MAX_BYTES,
  productVideoProblem,
  shouldWarnNotVertical,
  type OwnerKind,
} from "@shared/product-videos";

// "Videos" on the seller's product page and the supplier's product page (Post to Plug pilot; the page only renders
// this while post_to_plug is on). Upload a short vertical video (≤ 60 s, ≤ 50 MB) straight to Storage with a signed URL
// (POST /api/app/product-videos/upload-url; never through our server), or pick a finished Rex video; add a caption and
// "Show on Plug Discover"; then hide, show or remove each one. Rules: shared/product-videos.ts.

type Video = { id: string; videoUrl: string; posterUrl: string | null; durationMs: number | null; width: number | null; height: number | null; caption: string; showOnDiscover: boolean; status: string; views: number };
type Rex = { id: string; title: string; videoUrl: string; posterUrl: string | null; seconds: number | null };
type Loaded = { videos: Video[]; rex: Rex[]; showOnDiscoverDefault: boolean };
type Draft =
  | { kind: "file"; file: File; preview: string; durationMs: number | null; width: number | null; height: number | null }
  | { kind: "rex"; reel: Rex };

async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const response = await fetch(path, { ...rest, credentials: "same-origin", headers: json !== undefined ? { "content-type": "application/json" } : undefined, body: json !== undefined ? JSON.stringify(json) : rest.body });
  const body = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message || String(response.status));
  return body?.data as T;
}

/** Length and size from the file itself (the browser reads only its header). */
function readMeta(url: string): Promise<{ durationMs: number | null; width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    const done = () => resolve({
      durationMs: Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration * 1000) : null,
      width: video.videoWidth || null,
      height: video.videoHeight || null,
    });
    video.onloadedmetadata = done;
    video.onerror = () => resolve({ durationMs: null, width: null, height: null });
    setTimeout(done, 8000);
    video.src = url;
  });
}

/** A still from half a second in, as a small JPG; null when the browser can't decode this video. */
function makePoster(url: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    let finished = false;
    const finish = (blob: Blob | null) => {
      if (finished) return;
      finished = true;
      resolve(blob && blob.size <= PRODUCT_POSTER_MAX_BYTES ? blob : null);
    };
    video.onloadeddata = () => {
      video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
    };
    video.onseeked = () => {
      try {
        const scale = Math.min(1, 720 / Math.max(1, video.videoWidth));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => finish(blob), "image/jpeg", 0.75);
      } catch {
        finish(null);
      }
    };
    video.onerror = () => finish(null);
    setTimeout(() => finish(null), 10_000);
    video.src = url;
  });
}

function put(signedUrl: string, body: Blob, type: string, onProgress?: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("content-type", type);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress?.(event.loaded / event.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(String(xhr.status))));
    xhr.onerror = () => reject(new Error("offline"));
    xhr.send(body);
  });
}

type Signed = { signedUrl: string; publicUrl: string; contentType: string };

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill transition-colors disabled:opacity-50 ${on ? "bg-app-success" : "bg-app-line"}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

const BUTTON = "inline-flex min-h-10 items-center justify-center gap-2 rounded-pill px-4 text-[14px] font-bold disabled:opacity-50";

export function ProductVideosPanel({ ownerKind, productId }: { ownerKind: OwnerKind; productId: string }) {
  const t = useT("productVideos");
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [caption, setCaption] = useState("");
  const [discover, setDiscover] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [showRex, setShowRex] = useState(false);
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const loaded = await call<Loaded>(`/api/app/product-videos?productId=${encodeURIComponent(productId)}`);
      setData(loaded);
      setDiscover(loaded.showOnDiscoverDefault);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => {
    if (draft?.kind === "file") URL.revokeObjectURL(draft.preview);
  }, [draft]);

  const problemText = (problem: string | null) => (problem === "too_long" ? t("tooLong") : problem === "too_big" ? t("tooBig") : problem ? t("wrongType") : null);

  const pickFile = async (file: File | undefined) => {
    setNotice(null);
    if (!file) return;
    const early = problemText(productVideoProblem({ type: file.type || "video/mp4", size: file.size }));
    if (early) return setNotice({ tone: "error", text: early });
    const preview = URL.createObjectURL(file);
    const meta = await readMeta(preview);
    const late = problemText(productVideoProblem({ type: file.type || "video/mp4", size: file.size, durationMs: meta.durationMs }));
    if (late) {
      URL.revokeObjectURL(preview);
      return setNotice({ tone: "error", text: late });
    }
    setShowRex(false);
    setCaption("");
    setDraft({ kind: "file", file, preview, ...meta });
  };

  const cancelDraft = () => {
    setDraft(null);
    setProgress(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const post = async () => {
    if (!draft) return;
    setBusy("post");
    setNotice(null);
    try {
      if (draft.kind === "rex") {
        await call("/api/app/product-videos", { method: "POST", json: { productId, rexProjectId: draft.reel.id, caption, showOnDiscover: discover } });
      } else {
        const type = draft.file.type || "video/mp4";
        // The poster first (quick), so the video's progress runs to the end on its own.
        const poster = await makePoster(draft.preview);
        const signed = await call<Signed>("/api/app/product-videos/upload-url", { method: "POST", json: { kind: "video", type, size: draft.file.size, durationMs: draft.durationMs } });
        setProgress(0);
        await put(signed.signedUrl, draft.file, signed.contentType, (fraction) => setProgress(Math.round(fraction * 100)));
        let posterUrl: string | null = null;
        if (poster) {
          try {
            const target = await call<Signed>("/api/app/product-videos/upload-url", { method: "POST", json: { kind: "poster", type: "image/jpeg", size: poster.size } });
            await put(target.signedUrl, poster, "image/jpeg");
            posterUrl = target.publicUrl;
          } catch {
            // Without a poster the player shows the video's first frame.
          }
        }
        setProgress(null);
        await call("/api/app/product-videos", {
          method: "POST",
          json: { productId, videoUrl: signed.publicUrl, posterUrl, durationMs: draft.durationMs, width: draft.width, height: draft.height, caption, showOnDiscover: discover },
        });
      }
      cancelDraft();
      setNotice({ tone: "success", text: t("saved") });
      await load();
    } catch (error) {
      setProgress(null);
      setNotice({ tone: "error", text: error instanceof Error && error.message && !/^\d+$|offline/.test(error.message) ? error.message : t("failed") });
    } finally {
      setBusy(null);
    }
  };

  const change = async (video: Video, patch: Partial<Pick<Video, "caption" | "showOnDiscover" | "status">>) => {
    setBusy(video.id);
    setNotice(null);
    try {
      const next = await call<Video>(`/api/app/product-videos/${video.id}`, { method: "PATCH", json: patch });
      setData((current) => (current ? { ...current, videos: current.videos.map((row) => (row.id === video.id ? next : row)) } : current));
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : t("failed") });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (video: Video) => {
    if (!(await confirmDialog({ title: t("remove"), message: t("removeConfirm"), confirmLabel: t("removeYes"), cancelLabel: t("keep"), tone: "danger" }))) return;
    setBusy(video.id);
    try {
      await call(`/api/app/product-videos/${video.id}`, { method: "DELETE" });
      setData((current) => (current ? { ...current, videos: current.videos.filter((row) => row.id !== video.id) } : current));
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : t("failed") });
    } finally {
      setBusy(null);
    }
  };

  const full = (data?.videos.length ?? 0) >= MAX_VIDEOS_PER_PRODUCT;

  return (
    <section id="videos" aria-labelledby="product-videos-title" className="mt-6 rounded-[22px] border border-app-line bg-white p-5" data-testid="product-videos">
      <p className="m-0 font-mono text-[11px] uppercase tracking-[0.16em] text-teal-deep">{t("section.eyebrow")}</p>
      <h2 id="product-videos-title" className="m-0 mt-1 text-[17px] font-extrabold">{t("section.title")}</h2>
      <p className="mt-1 text-[13.5px] leading-[1.5] text-app-ink-soft">{ownerKind === "supplier" ? t("section.subSupplier") : t("section.sub")}</p>

      {notice ? (
        <p role={notice.tone === "error" ? "alert" : "status"} className={`mt-3 rounded-[14px] px-4 py-2.5 text-[14px] font-semibold ${notice.tone === "error" ? "bg-app-danger-tint text-app-danger" : "bg-app-success-tint text-app-success"}`}>
          {notice.text}
        </p>
      ) : null}
      {loadError ? <p className="mt-3 text-[14px] text-app-danger">{t("loadFailed")}</p> : null}

      {!draft ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <input ref={fileInput} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" className="sr-only" onChange={(event) => void pickFile(event.target.files?.[0])} aria-label={t("upload")} />
          <button type="button" className={`${BUTTON} bg-app-ink text-white`} disabled={!data || full || Boolean(busy)} onClick={() => fileInput.current?.click()}>
            <Icon name="plus" size={16} />
            {t("upload")}
          </button>
          {ownerKind === "store" ? (
            <button type="button" className={`${BUTTON} border border-app-line bg-white`} disabled={!data || full || Boolean(busy)} onClick={() => setShowRex((open) => !open)} aria-expanded={showRex}>
              {t("pickRex")}
            </button>
          ) : null}
        </div>
      ) : null}
      {full ? <p className="mt-2 text-[13px] text-app-ink-soft">{t("limit", { count: MAX_VIDEOS_PER_PRODUCT })}</p> : null}

      {showRex && !draft && data ? (
        <div className="mt-4">
          <h3 className="m-0 text-[15px] font-bold">{t("rexTitle")}</h3>
          {data.rex.length ? (
            <ul className="m-0 mt-2 flex list-none gap-3 overflow-x-auto p-0 pb-2">
              {data.rex.map((reel) => (
                <li key={reel.id} className="w-[132px] shrink-0">
                  <button type="button" onClick={() => { setDraft({ kind: "rex", reel }); setCaption(""); setShowRex(false); }} className="block w-full border-0 bg-transparent p-0 text-left" aria-label={`${t("rexUse")}: ${reel.title}`}>
                    <span className="relative block overflow-hidden rounded-[14px] bg-app-ink" style={{ aspectRatio: "9 / 16" }}>
                      {reel.posterUrl ? <img src={reel.posterUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" /> : null}
                    </span>
                    <span className="mt-1 block truncate text-[13px] font-semibold">{reel.title}</span>
                    {reel.seconds ? <span className="block text-[12px] text-app-ink-soft">{t("rexSeconds", { seconds: Math.round(reel.seconds) })}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[13.5px] text-app-ink-soft">{t("rexEmpty")}</p>
          )}
        </div>
      ) : null}

      {draft ? (
        <div className="mt-4 grid gap-4 rounded-[18px] bg-app-canvas p-4 sm:grid-cols-[160px_1fr]">
          <div className="overflow-hidden rounded-[14px] bg-black" style={{ aspectRatio: "9 / 16" }}>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video src={draft.kind === "file" ? draft.preview : draft.reel.videoUrl} poster={draft.kind === "rex" ? draft.reel.posterUrl ?? undefined : undefined} controls playsInline preload="metadata" className="h-full w-full object-contain" />
          </div>
          <div className="grid content-start gap-3">
            {draft.kind === "file" && shouldWarnNotVertical(draft.width, draft.height) ? (
              <p role="status" className="m-0 rounded-[12px] bg-[#FDF0D5] px-3 py-2 text-[13px] font-semibold text-[#5C3D00]">{t("notVertical")}</p>
            ) : null}
            {draft.kind === "file" && draft.durationMs ? <p className="m-0 font-mono text-[12px] text-app-ink-soft">{t("length", { clock: clockLabel(draft.durationMs) })}</p> : null}
            {draft.kind === "rex" ? <p className="m-0 text-[13px] font-semibold">{t("fromRex")}: {draft.reel.title}</p> : null}
            <label className="grid gap-1 text-[14px] font-bold">
              {t("caption")}
              <textarea value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={CAPTION_MAX} rows={2} placeholder={t("captionPlaceholder")} className="rounded-[12px] border border-app-line bg-white px-3 py-2 text-[14px] font-normal" />
            </label>
            <div className="flex items-center gap-3">
              <Switch on={discover} onChange={setDiscover} label={t("discover")} disabled={Boolean(busy)} />
              <div>
                <p className="m-0 text-[14px] font-bold">{t("discover")}</p>
                <p className="m-0 text-[12.5px] text-app-ink-soft">{discover ? t("discoverSub") : t("discoverOff")}</p>
              </div>
            </div>
            {progress !== null ? <p role="status" className="m-0 text-[13px] font-semibold">{t("uploading", { percent: progress })}</p> : busy === "post" ? <p role="status" className="m-0 text-[13px] font-semibold">{t("checking")}</p> : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={`${BUTTON} bg-app-ink text-white`} disabled={Boolean(busy)} onClick={() => void post()}>{t("post")}</button>
              <button type="button" className={`${BUTTON} border border-app-line bg-white`} disabled={Boolean(busy)} onClick={cancelDraft}>{t("cancel")}</button>
            </div>
          </div>
        </div>
      ) : null}

      {data && !data.videos.length && !draft ? <p className="mt-4 text-[13.5px] text-app-ink-soft">{t("empty")}</p> : null}

      {data?.videos.length ? (
        <ul className="m-0 mt-5 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {data.videos.map((video) => {
            const text = captions[video.id] ?? video.caption;
            return (
              <li key={video.id} className="grid grid-cols-[96px_1fr] gap-3 rounded-[18px] border border-app-line p-3">
                <div className="overflow-hidden rounded-[12px] bg-black" style={{ aspectRatio: "9 / 16" }}>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video src={video.videoUrl} poster={video.posterUrl ?? undefined} controls playsInline preload="none" className="h-full w-full object-cover" />
                </div>
                <div className="grid min-w-0 content-start gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-[12px]">
                    <span className={`rounded-pill px-2 py-0.5 font-bold ${video.status === "active" ? "bg-app-success-tint text-app-success" : "bg-app-canvas text-app-ink-soft"}`}>{video.status === "active" ? t("status.active") : t("status.hidden")}</span>
                    {video.durationMs ? <span className="font-mono text-app-ink-soft">{clockLabel(video.durationMs)}</span> : null}
                  </div>
                  <textarea
                    value={text}
                    onChange={(event) => setCaptions((current) => ({ ...current, [video.id]: event.target.value }))}
                    maxLength={CAPTION_MAX}
                    rows={2}
                    aria-label={t("caption")}
                    placeholder={t("captionPlaceholder")}
                    className="rounded-[10px] border border-app-line px-2 py-1.5 text-[13px]"
                  />
                  {text !== video.caption ? (
                    <button type="button" className={`${BUTTON} min-h-8 justify-self-start bg-app-ink px-3 text-[12.5px] text-white`} disabled={busy === video.id} onClick={() => void change(video, { caption: text }).then(() => setCaptions((current) => { const next = { ...current }; delete next[video.id]; return next; }))}>
                      {t("saveCaption")}
                    </button>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <Switch on={video.showOnDiscover} onChange={(on) => void change(video, { showOnDiscover: on })} label={t("discover")} disabled={busy === video.id} />
                    <span className="text-[12.5px] font-semibold">{t("discover")}</span>
                  </div>
                  {video.showOnDiscover ? <p className="m-0 text-[12px] text-app-ink-soft">{t("views", { count: video.views })}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={`${BUTTON} min-h-8 border border-app-line bg-white px-3 text-[12.5px]`} disabled={busy === video.id} onClick={() => void change(video, { status: video.status === "active" ? "hidden" : "active" })}>
                      {video.status === "active" ? t("hide") : t("show")}
                    </button>
                    <button type="button" className={`${BUTTON} min-h-8 border border-app-line bg-white px-3 text-[12.5px] text-app-danger`} disabled={busy === video.id} onClick={() => void remove(video)}>
                      {t("remove")}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
