"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { buttonClass, inputClass, selectClass, textareaClass } from "@/components/growth/kit";
import { cx } from "@/components/app-ui/cx";
import { confirmDialog } from "@/components/ui/dialogs";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { intlLocale } from "@shared/i18n";
import { postText, taggedProductLink } from "@/lib/social/share";
import {
  POST_CHANNELS,
  POST_FORMATS,
  POST_FORMAT_KEYS,
  channelSpec,
  formatForShape,
  formatSize,
  fromLagos,
  instagramKind,
  lagosDayKey,
  postProblems,
  recommendFormat,
  type PostChannel,
  type PostFormat,
  type PostProblem,
} from "@/lib/social-posts/pure";
import { ChannelBadge } from "./ChannelBadge";
import type { RexMakeKind } from "./RexMakeModal";
import type { ComposerPost, ComposerProduct, MadeDesign, PickMedia, RexMakerData } from "./types";

// Rex's makers are big; they load only when the seller opens one.
const RexMakeModal = dynamic(() => import("./RexMakeModal").then((mod) => mod.RexMakeModal), { ssr: false });

type When = "now" | "queue" | "schedule";
type PickerTab = "rex" | "reels" | "library" | "products";

function aspect(format: PostFormat) {
  const { width, height } = POST_FORMATS[format];
  return `${width} / ${height}`;
}

/**
 * The post editor (Marketing > Social posts > Create post, and editing a planned one): where it goes, the picture
 * or video (Rex designs, reels, the media library, product photos, or a new one made with Rex at the right size),
 * the size and crop, Peggy's caption, the product link, and when: now, the next queue time or a picked time.
 * The preview shows each channel at the size it will go out.
 */
export function Composer({
  post,
  products,
  media,
  accounts,
  queueNext,
  storeName,
  rex,
}: {
  post: ComposerPost;
  products: ComposerProduct[];
  media: Record<PickerTab, PickMedia[]>;
  accounts: { facebook: string | null; instagram: string | null };
  queueNext: string;
  storeName: string;
  /** What Rex's picture and reel makers need to open in a pop-up here. */
  rex: RexMakerData;
}) {
  const t = useT("socialPosts", "common");
  const locale = useLocale();
  const router = useRouter();
  const [channels, setChannels] = useState<PostChannel[]>(() => {
    if (post.channels.length) return post.channels;
    // New post: the accounts that post by themselves, else WhatsApp Status.
    const linked: PostChannel[] = [...(accounts.instagram ? (["instagram"] as const) : []), ...(accounts.facebook ? (["facebook"] as const) : [])];
    return linked.length ? linked : ["whatsapp"];
  });
  const [mediaUrl, setMediaUrl] = useState(post.mediaUrl);
  const [mediaKind, setMediaKind] = useState(post.mediaKind);
  const [mediaSource, setMediaSource] = useState(post.mediaSource);
  const [shape, setShape] = useState<{ width: number; height: number } | null>(null);
  const [format, setFormat] = useState<PostFormat>(post.format ?? (post.mediaKind === "video" ? "story" : recommendFormat(post.channels)));
  const [formatTouched, setFormatTouched] = useState(Boolean(post.format));
  const [fit, setFit] = useState(post.fit);
  const [caption, setCaption] = useState(post.caption);
  const [productId, setProductId] = useState(post.productId ?? "");
  const [angle, setAngle] = useState("");
  const [when, setWhen] = useState<When>(post.day ? "schedule" : "queue");
  const [day, setDay] = useState(post.day ?? lagosDayKey(new Date(queueNext)));
  const [time, setTime] = useState(post.time ?? "19:30");
  const [picker, setPicker] = useState<PickerTab | null>(post.mediaUrl ? null : media.rex.length ? "rex" : media.reels.length ? "reels" : media.products.length ? "products" : null);
  const [previewChannel, setPreviewChannel] = useState<PostChannel | null>(null);
  const [writing, setWriting] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const product = products.find((item) => item.id === productId) ?? null;
  const connected = { facebook: Boolean(accounts.facebook), instagram: Boolean(accounts.instagram) };
  const problems = postProblems({ channels, caption, format, mediaUrl, mediaKind, linkLength: product ? product.url.length + 40 : 0 }, connected);
  const blocking = problems.filter((problem) => problem.kind !== "size");
  const shown = previewChannel && channels.includes(previewChannel) ? previewChannel : channels[0] ?? null;

  // The size follows the channels until the seller picks one; a video goes out at its own shape.
  useEffect(() => {
    if (mediaKind === "video") return;
    if (!formatTouched) setFormat(recommendFormat(channels));
  }, [channels, formatTouched, mediaKind]);

  useEffect(() => {
    if (mediaKind === "video" && shape) setFormat(formatForShape(shape.width, shape.height) ?? "story");
  }, [mediaKind, shape]);

  const dateLabel = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" }), [locale]);

  function toggle(channel: PostChannel) {
    setChannels((list) => (list.includes(channel) ? list.filter((item) => item !== channel) : POST_CHANNELS.map((item) => item.key).filter((key) => key === channel || list.includes(key))));
  }

  // Rex's picture or reel maker, open in a pop-up; what it makes joins the lists and goes straight into the post.
  const [making, setMaking] = useState<RexMakeKind | null>(null);
  const [made, setMade] = useState<PickMedia[]>([]);
  const closeMaker = useCallback(() => setMaking(null), []);
  const lists = useMemo(
    () => ({ ...media, rex: [...made.filter((item) => item.source === "rex"), ...media.rex], reels: [...made.filter((item) => item.source === "reel"), ...media.reels] }),
    [media, made],
  );

  function takeMade(design: MadeDesign) {
    const item: PickMedia =
      design.kind === "image"
        ? { id: `made-${Date.now()}`, url: design.url, kind: "image", source: "rex", label: null, width: design.width, height: design.height, poster: null, createdAt: new Date().toISOString() }
        : { id: design.id ?? `made-${Date.now()}`, url: design.url, kind: "video", source: "reel", label: null, width: 1080, height: 1920, poster: null, createdAt: new Date().toISOString() };
    setMade((list) => [item, ...list]);
    pick(item);
    setMaking(null);
  }

  function pick(item: PickMedia) {
    setMediaUrl(item.url);
    setMediaKind(item.kind);
    setMediaSource(item.source);
    setShape(item.width && item.height ? { width: item.width, height: item.height } : null);
    if (item.source === "product" && !productId) {
      const match = products.find((p) => p.image === item.url);
      if (match) setProductId(match.id);
    }
    setPicker(null);
  }

  async function writeCaption() {
    const channel = channels[0] ?? "instagram";
    if (!productId && !angle.trim()) {
      setNote(t("cap.needTopic"));
      return;
    }
    setWriting(true);
    setNote(null);
    try {
      const response = await fetch("/api/app/social/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: productId || null, channel, ...(angle.trim() ? { angle: angle.trim() } : {}) }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setNote(json?.error?.message ?? t("cap.failed"));
        return;
      }
      setCaption(json.data.caption);
      setNote(json.data.ai ? t("cap.wrote") : t("cap.noAi"));
    } catch {
      setNote(t("cap.offline"));
    } finally {
      setWriting(false);
    }
  }

  async function save(mode: When | "draft") {
    setError(null);
    setSaving(mode);
    const scheduledAt = mode === "schedule" || (mode === "draft" && when === "schedule") ? fromLagos(day, time)?.toISOString() ?? null : null;
    if (mode === "schedule" && !scheduledAt) {
      setError(t("err.time"));
      setSaving(null);
      return;
    }
    const body = { caption, mediaUrl, mediaKind, mediaSource, format, fit, channels, productId: productId || null, when: mode, scheduledAt };
    try {
      const response = await fetch(post.id ? `/api/app/social-posts/${post.id}` : "/api/app/social-posts", {
        method: post.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setError(json?.error?.message ?? t("err.save"));
        return;
      }
      const saved = json.data as { id: string; scheduledAt: string | null };
      if (mode === "now") router.push(`/home/marketing/social/${saved.id}`);
      else if (mode === "draft") router.push("/home/marketing/social?view=drafts");
      else router.push(`/home/marketing/social?month=${(saved.scheduledAt ?? queueNext).slice(0, 7)}&saved=${saved.id}`);
      router.refresh();
    } catch {
      setError(t("err.offline"));
    } finally {
      setSaving(null);
    }
  }

  async function remove() {
    if (!post.id || !(await confirmDialog(t("del.confirm")))) return;
    setSaving("delete");
    await fetch(`/api/app/social-posts/${post.id}`, { method: "DELETE" }).catch(() => null);
    router.push("/home/marketing/social");
    router.refresh();
  }

  const problemText = (problem: PostProblem) => {
    const name = channelSpec(problem.channel).label;
    switch (problem.kind) {
      case "needs_media":
        return t("pr.needsMedia", { channel: name });
      case "too_long":
        return t("pr.tooLong", { channel: name, limit: String(problem.limit) });
      case "size":
        return t("pr.size", { channel: name, ratio: POST_FORMATS[problem.best].ratio });
      case "video_type":
        return t("pr.videoType", { channel: name });
      case "not_connected":
        return t("pr.notConnected", { channel: name });
    }
  };

  const tabs: Array<{ key: PickerTab; label: string }> = [
    { key: "rex", label: t("pick.rex") },
    { key: "reels", label: t("pick.reels") },
    { key: "library", label: t("pick.library") },
    { key: "products", label: t("pick.products") },
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="grid min-w-0 content-start gap-5">
        {/* Where */}
        <section className="rounded-[22px] border border-app-line bg-white p-5" aria-labelledby="c-where">
          <h2 id="c-where" className="m-0 text-[16px] font-extrabold">{t("c.where")}</h2>
          <ul className="m-0 mt-3 grid list-none gap-2 p-0 sm:grid-cols-2">
            {POST_CHANNELS.map((spec) => {
              const on = channels.includes(spec.key);
              const account = spec.key === "facebook" ? accounts.facebook : spec.key === "instagram" ? accounts.instagram : null;
              const sub = spec.auto ? (account ? t("c.auto", { name: account }) : t("c.connectFirst")) : t("c.oneTap");
              return (
                <li key={spec.key}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(spec.key)}
                    className={cx("flex w-full min-w-0 items-center gap-3 rounded-[16px] border p-3 text-left transition", on ? "border-app-ink bg-app-canvas" : "border-app-line bg-white hover:border-app-line-strong")}
                  >
                    <ChannelBadge channel={spec.key} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-extrabold">{spec.label}</span>
                      <span className={cx("block truncate text-[12.5px]", spec.auto && !account ? "text-app-danger" : "text-app-ink-soft")}>{sub}</span>
                    </span>
                    <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full border", on ? "border-app-ink bg-app-ink text-white" : "border-app-line-strong")}>{on && <Icon name="check" size={13} />}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {(!accounts.facebook || !accounts.instagram) && (
            <p className="mb-0 mt-3 text-[13px] text-app-ink-soft">
              {t("c.connectNote")} <Link href="/home/marketing/social/accounts" className="font-bold text-app-ink underline underline-offset-2">{t("c.connectLink")}</Link>
            </p>
          )}
        </section>

        {/* Picture or video */}
        <section className="rounded-[22px] border border-app-line bg-white p-5" aria-labelledby="c-media">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="c-media" className="m-0 text-[16px] font-extrabold">{t("c.media")}</h2>
              <p className="mb-0 mt-1 text-[13px] text-app-ink-soft">{t("c.mediaSub")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setMaking("image")} className={buttonClass("accent", "sm")}>
                <Icon name="sparkle" size={15} />
                {t("c.makeImage", { ratio: POST_FORMATS[format].ratio })}
              </button>
              <button type="button" onClick={() => setMaking("reel")} className={buttonClass("white", "sm")}>
                <Icon name="play" size={15} />
                {t("c.makeReel")}
              </button>
            </div>
          </div>

          {mediaUrl && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[16px] bg-app-canvas p-3">
              {mediaKind === "video" ? (
                <video src={mediaUrl} muted playsInline preload="metadata" onLoadedMetadata={(event) => setShape({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })} className="h-20 w-20 shrink-0 rounded-[12px] bg-app-ink object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl} alt="" onLoad={(event) => setShape({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} className="h-20 w-20 shrink-0 rounded-[12px] object-cover" />
              )}
              <div className="min-w-0 flex-1 text-[13px]">
                <div className="font-bold">{mediaKind === "video" ? t("c.video") : t("c.picture")} · {t(`src.${mediaSource ?? "upload"}`)}</div>
                {shape && <div className="text-app-ink-soft">{t("c.original", { size: `${shape.width} × ${shape.height}` })}</div>}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPicker(picker ? null : "rex")} className={buttonClass("white", "sm")}>{t("c.change")}</button>
                <button type="button" onClick={() => { setMediaUrl(null); setMediaKind(null); setMediaSource(null); setShape(null); }} className={buttonClass("ghost", "sm")} aria-label={t("c.remove")}>
                  <Icon name="x" size={15} />
                </button>
              </div>
            </div>
          )}
          {!mediaUrl && !picker && (
            <button type="button" onClick={() => setPicker("rex")} className="mt-4 grid w-full place-items-center gap-1 rounded-[16px] border-2 border-dashed border-app-line-strong p-6 text-[14px] font-bold text-app-ink-soft hover:border-app-ink hover:text-app-ink">
              <Icon name="image" size={22} />
              {t("c.choose")}
            </button>
          )}

          {picker && (
            <div className="mt-4">
              <div role="tablist" className="flex flex-wrap gap-2">
                {tabs.map((tab) => (
                  <button key={tab.key} type="button" role="tab" aria-selected={picker === tab.key} onClick={() => setPicker(tab.key)} className={cx("inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-bold", picker === tab.key ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}>
                    {tab.label}
                    <span className="opacity-60">{lists[tab.key].length}</span>
                  </button>
                ))}
              </div>
              {lists[picker].length ? (
                <ul className="m-0 mt-3 grid max-h-[360px] list-none grid-cols-3 gap-2 overflow-y-auto p-0 sm:grid-cols-4 lg:grid-cols-5">
                  {lists[picker].map((item) => (
                    <li key={`${item.source}-${item.id}`}>
                      <button type="button" onClick={() => pick(item)} aria-pressed={mediaUrl === item.url} className={cx("relative block w-full overflow-hidden rounded-[12px] border-2", mediaUrl === item.url ? "border-app-ink" : "border-transparent")} title={item.label ?? undefined}>
                        {item.kind === "video" ? (
                          item.poster ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.poster} alt={item.label ?? ""} loading="lazy" className="block aspect-[9/16] w-full bg-app-ink object-cover" />
                          ) : (
                            <video src={item.url} muted playsInline preload="metadata" className="block aspect-[9/16] w-full bg-app-ink object-cover" />
                          )
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.url} alt={item.label ?? ""} loading="lazy" className="block aspect-square w-full bg-app-canvas object-cover" />
                        )}
                        {item.kind === "video" && <span className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"><Icon name="play" size={12} /></span>}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-3 rounded-[16px] bg-app-canvas p-4 text-[13.5px] text-app-ink-soft">
                  {picker === "reels" ? (
                    <>{t("pick.noReels")} <button type="button" onClick={() => setMaking("reel")} className="cursor-pointer border-0 bg-transparent p-0 font-bold text-app-ink underline">{t("c.makeReel")}</button></>
                  ) : picker === "rex" ? (
                    <>{t("pick.noRex")} <button type="button" onClick={() => setMaking("image")} className="cursor-pointer border-0 bg-transparent p-0 font-bold text-app-ink underline">{t("c.makeImage", { ratio: POST_FORMATS[format].ratio })}</button></>
                  ) : picker === "library" ? (
                    <>{t("pick.noLibrary")} <Link href="/home/media" className="font-bold text-app-ink underline">{t("pick.openLibrary")}</Link></>
                  ) : (
                    t("pick.noProducts")
                  )}
                </div>
              )}
            </div>
          )}

          {/* Size */}
          {mediaUrl && (
            <div className="mt-5 grid gap-3">
              <div className="text-[13.5px] font-bold">{t("c.size")}</div>
              {mediaKind === "video" ? (
                <p className="m-0 text-[13px] text-app-ink-soft">{t("c.videoSize", { ratio: POST_FORMATS[format].ratio })}</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {POST_FORMAT_KEYS.map((key) => {
                      const fans = channels.filter((channel) => channelSpec(channel).formats[0] === key);
                      return (
                        <button key={key} type="button" aria-pressed={format === key} onClick={() => { setFormat(key); setFormatTouched(true); }} className={cx("grid min-w-[112px] gap-0.5 rounded-[14px] border px-3 py-2 text-left", format === key ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white hover:border-app-line-strong")}>
                          <span className="text-[13.5px] font-extrabold">{t(`fmt.${key}`)} <span className="font-mono text-[11.5px] opacity-70">{POST_FORMATS[key].ratio}</span></span>
                          <span className="font-mono text-[11px] opacity-70">{formatSize(key)}</span>
                          {fans.length > 0 && <span className="text-[11px] font-bold opacity-80">{t("fmt.best", { channels: fans.map((channel) => channelSpec(channel).label).join(", ") })}</span>}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("c.fit")}>
                    {(["cover", "fit"] as const).map((key) => (
                      <button key={key} type="button" role="radio" aria-checked={fit === key} onClick={() => setFit(key)} className={cx("inline-flex min-h-[36px] items-center rounded-full border px-3.5 text-[13px] font-bold", fit === key ? "border-app-ink bg-app-canvas" : "border-app-line bg-white")}>
                        {t(`fit.${key}`)}
                      </button>
                    ))}
                  </div>
                  {shape && formatForShape(shape.width, shape.height) !== format && (
                    <p className="m-0 text-[12.5px] text-app-ink-soft">
                      {fit === "cover" ? t("c.willCrop") : t("c.willFit")}{" "}
                      <button type="button" onClick={() => setMaking("image")} className="cursor-pointer border-0 bg-transparent p-0 font-bold text-app-ink underline">{t("c.remake", { ratio: POST_FORMATS[format].ratio })}</button>
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </section>

        {/* Caption */}
        <section className="rounded-[22px] border border-app-line bg-white p-5" aria-labelledby="c-caption">
          <h2 id="c-caption" className="m-0 text-[16px] font-extrabold">{t("c.caption")}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-[13px] font-bold">
              {t("c.product")}
              <select value={productId} onChange={(event) => setProductId(event.target.value)} className={selectClass}>
                <option value="">{t("c.noProduct")}</option>
                {products.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.price}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-[13px] font-bold">
              {t("c.angle")}
              <input value={angle} onChange={(event) => setAngle(event.target.value)} maxLength={200} placeholder={t("c.angleHint")} className={inputClass} />
            </label>
          </div>
          <button type="button" onClick={() => void writeCaption()} disabled={writing} className={buttonClass("accent", "sm", "mt-3")}>
            <Icon name="sparkle" size={15} />
            {writing ? t("cap.writing") : caption ? t("cap.again") : t("cap.ask")}
          </button>
          <label className="mt-3 grid gap-1 text-[13px] font-bold">
            <span className="sr-only">{t("c.caption")}</span>
            <textarea value={caption} onChange={(event) => setCaption(event.target.value)} rows={6} placeholder={t("c.captionHint")} className={cx(textareaClass, "text-[14.5px]")} />
          </label>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-app-ink-soft">
            {channels.map((channel) => {
              const limit = channelSpec(channel).limit;
              return (
                <span key={channel} className={cx(caption.length > limit && "font-bold text-app-danger")}>
                  {channelSpec(channel).label} {caption.length}/{limit}
                </span>
              );
            })}
          </div>
          {product && <p className="mb-0 mt-2 text-[12.5px] text-app-ink-soft">{t("c.linkNote")}</p>}
          {note && <p role="status" className="mb-0 mt-2 rounded-[12px] bg-app-canvas px-3 py-2 text-[13px]">{note}</p>}
        </section>

        {/* When */}
        <section className="rounded-[22px] border border-app-line bg-white p-5" aria-labelledby="c-when">
          <h2 id="c-when" className="m-0 text-[16px] font-extrabold">{t("c.when")}</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-labelledby="c-when">
            {(["queue", "schedule", "now"] as const).map((key) => (
              <button key={key} type="button" role="radio" aria-checked={when === key} onClick={() => setWhen(key)} className={cx("grid gap-0.5 rounded-[16px] border p-3 text-left", when === key ? "border-app-ink bg-app-canvas" : "border-app-line bg-white hover:border-app-line-strong")}>
                <span className="flex items-center gap-1.5 text-[14px] font-extrabold">
                  <Icon name={key === "queue" ? "list" : key === "schedule" ? "calendar" : "send"} size={15} />
                  {t(`when.${key}`)}
                </span>
                <span className="text-[12.5px] text-app-ink-soft">{key === "queue" ? dateLabel.format(new Date(queueNext)) : t(`when.${key}.sub`)}</span>
              </button>
            ))}
          </div>
          {when === "schedule" && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-[420px]">
              <label className="grid gap-1 text-[13px] font-bold">
                {t("when.day")}
                <input type="date" value={day} onChange={(event) => setDay(event.target.value)} className={inputClass} />
              </label>
              <label className="grid gap-1 text-[13px] font-bold">
                {t("when.time")}
                <input type="time" value={time} onChange={(event) => setTime(event.target.value)} className={inputClass} />
              </label>
              <p className="col-span-2 m-0 text-[12.5px] text-app-ink-soft">{t("when.lagos")}</p>
            </div>
          )}
        </section>

        {error && <p role="alert" className="m-0 rounded-[14px] bg-app-danger-tint px-4 py-3 text-[14px] text-app-danger">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void save(when)} disabled={saving !== null || blocking.length > 0} className={buttonClass("ink", "md")}>
            <Icon name={when === "now" ? "send" : when === "queue" ? "list" : "calendar"} size={16} />
            {saving === when ? t("btn.saving") : t(`btn.${when}`)}
          </button>
          <button type="button" onClick={() => void save("draft")} disabled={saving !== null} className={buttonClass("white", "md")}>{saving === "draft" ? t("btn.saving") : t("btn.draft")}</button>
          {post.id && (
            <button type="button" onClick={() => void remove()} disabled={saving !== null} className={buttonClass("danger", "md", "sm:ml-auto")}>
              <Icon name="trash" size={15} />
              {t("btn.delete")}
            </button>
          )}
        </div>
      </div>

      {/* Preview */}
      <aside className="grid min-w-0 content-start gap-3 xl:sticky xl:top-4 xl:self-start" aria-label={t("pv.title")}>
        <div className="rounded-[22px] border border-app-line bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="m-0 text-[15px] font-extrabold">{t("pv.title")}</h2>
            <span className="font-mono text-[11.5px] text-app-ink-soft">{formatSize(format)}</span>
          </div>
          {channels.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {channels.map((channel) => (
                <button key={channel} type="button" aria-pressed={shown === channel} onClick={() => setPreviewChannel(channel)} className={cx("inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] font-bold", shown === channel ? "border-app-ink bg-app-canvas" : "border-app-line")}>
                  <ChannelBadge channel={channel} size={18} />
                  {channelSpec(channel).label}
                </button>
              ))}
            </div>
          )}
          <Preview
            channel={shown}
            name={(shown === "facebook" ? accounts.facebook : shown === "instagram" ? accounts.instagram : null) ?? storeName}
            format={format}
            fit={fit}
            mediaUrl={mediaUrl}
            mediaKind={mediaKind}
            text={shown ? previewText(shown, caption, product) : caption}
            igKind={instagramKind(format, mediaKind)}
            labels={{ story: t("pv.story"), reel: t("pv.reel"), empty: t("pv.empty") }}
          />
        </div>
        {problems.length > 0 && (
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {problems.map((problem, index) => (
              <li key={`${problem.channel}-${problem.kind}-${index}`} className={cx("flex items-start gap-2 rounded-[12px] px-3 py-2 text-[13px]", problem.kind === "size" ? "bg-app-canvas" : "bg-app-peach")}>
                <Icon name={problem.kind === "size" ? "info" : "warn"} size={15} className="mt-0.5 shrink-0" />
                <span className="min-w-0 flex-1">
                  {problemText(problem)}
                  {problem.kind === "size" && mediaKind !== "video" && (
                    <> <button type="button" onClick={() => { setFormat(problem.best); setFormatTouched(true); }} className="cursor-pointer border-0 bg-transparent p-0 font-bold text-app-ink underline">{t("pr.switch", { ratio: POST_FORMATS[problem.best].ratio })}</button></>
                  )}
                  {problem.kind === "not_connected" && <> <Link href="/home/marketing/social/accounts" className="font-bold text-app-ink underline">{t("c.connectLink")}</Link></>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </aside>
      {making && <RexMakeModal kind={making} format={format} data={rex} onUse={takeMade} onClose={closeMaker} />}
    </div>
  );
}

function previewText(channel: PostChannel, caption: string, product: ComposerProduct | null) {
  if (!caption.trim()) return "";
  return product ? postText(channel, caption, taggedProductLink(product.url, channel, "social_post")) : caption.trim();
}

/** The post as the channel will show it, at its real shape. */
function Preview({ channel, name, format, fit, mediaUrl, mediaKind, text, igKind, labels }: { channel: PostChannel | null; name: string; format: PostFormat; fit: "cover" | "fit"; mediaUrl: string | null; mediaKind: "image" | "video" | null; text: string; igKind: "feed" | "story" | "reel"; labels: { story: string; reel: string; empty: string } }) {
  const tall = format === "story";
  return (
    <div className={cx("mx-auto mt-3 w-full overflow-hidden rounded-[18px] border border-app-line bg-white", tall ? "max-w-[250px]" : "max-w-[360px]")}>
      <div className="flex items-center gap-2 px-3 py-2">
        {channel ? <ChannelBadge channel={channel} size={24} /> : <span className="h-6 w-6 rounded-full bg-app-canvas" />}
        <span className="min-w-0 flex-1 truncate text-[13px] font-extrabold">{name}</span>
        {channel === "instagram" && igKind !== "feed" && <span className="rounded-full bg-app-canvas px-2 py-0.5 text-[10.5px] font-bold">{igKind === "story" ? labels.story : labels.reel}</span>}
      </div>
      <div className="relative w-full overflow-hidden bg-app-canvas" style={{ aspectRatio: aspect(format) }}>
        {mediaUrl ? (
          mediaKind === "video" ? (
            <video src={mediaUrl} muted loop autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />
          ) : fit === "fit" ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl brightness-[0.85]" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />
            </>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )
        ) : (
          <span className="absolute inset-0 grid place-items-center p-4 text-center text-[12.5px] text-app-ink-soft">{labels.empty}</span>
        )}
      </div>
      {text && !(channel === "instagram" && igKind === "story") && <p className="m-0 line-clamp-6 whitespace-pre-line break-words px-3 py-2.5 text-[12.5px] leading-[1.5]">{text}</p>}
    </div>
  );
}
