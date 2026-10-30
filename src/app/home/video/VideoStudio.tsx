"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { FieldLabel, Notice, PillButton, Segmented, Spinner, TextInput } from "@/components/app-ui";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { naira } from "@shared/onboarding";
import { MAX_PHOTOS, VIDEO_LANGUAGES, fallbackScript, type VideoLanguage, type VideoScript } from "@shared/video";
import {
  MUSIC_MOODS,
  REEL_SHOT_LOOKS,
  REEL_TEMPLATE_CREDIT,
  REEL_FEELS,
  REEL_TEMPLATES,
  defaultMood,
  isMusicMood,
  isReelTemplate,
  type MusicMood,
  type ReelBrand,
  type ReelShotLook,
  type ReelFeel,
  type ReelTemplateId,
  type VoiceGender,
  type VoiceSource,
} from "@shared/video-style";
import { CREDIT_COST } from "@shared/ai-credits";
import { PURPOSE_DEFAULTS, type VideoConfig, type VideoPurpose } from "@shared/video-projects";
import { webVideoBase } from "@shared/video-owner";
import { loadReelImage, previewMusic, reelSupported, renderReel, type ReelResult } from "@/lib/video/render-reel";
import { uploadFile } from "@/lib/supabase/storage";
import { useMediaLibrary } from "@/components/media/useMediaLibrary";
import { REX_REEL_HANDOFF_KEY } from "@/lib/ai/rex/cards";
import { BuyCreditsButton, creditsChanged, isCreditsError } from "@/components/credits/CreditsBadge";
import { useT } from "@/components/i18n/I18nProvider";
import { ReelPreview } from "./ReelPreview";
import { VoiceRecorder } from "./VoiceRecorder";
import { friendlyError } from "@/lib/errors/report-client";
import { FunLoader } from "@/components/brand/FunLoader";

export interface StudioProduct {
  id: string;
  name: string;
  price: number;
  images: string[];
  description: string;
  hasVideo: boolean;
}

interface Photo {
  key: string;
  src: string;
}

type NoticeState = { tone: "error" | "info" | "success"; text: string; credits?: boolean };

const card = "rounded-[22px] border border-app-line bg-white p-5";
const chip = "inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-bold";

class StudioError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

async function postJson(url: string, body: unknown) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

async function errorFrom(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  return new StudioError(body?.error?.message ?? fallback, body?.error?.code);
}

async function audioSeconds(buffer: ArrayBuffer) {
  try {
    const context = new AudioContext();
    const decoded = await context.decodeAudioData(buffer.slice(0));
    void context.close();
    return decoded.duration;
  } catch {
    return null;
  }
}

export function VideoStudio({
  products,
  storeName,
  storeHost,
  initialProductId,
  brand,
  elevenLabs,
  project = null,
  purpose: startPurpose = "social",
  costs = CREDIT_COST,
  onUse,
  partner = false,
}: {
  products: StudioProduct[];
  storeName: string;
  storeHost: string;
  initialProductId: string | null;
  brand: ReelBrand;
  elevenLabs: boolean;
  /** A saved project to carry on with (its settings come back as they were). */
  project?: { id: string; title: string; purpose: VideoPurpose; status: string; videoUrl: string | null; config: VideoConfig } | null;
  /** What a new video is for: an ad, a product or social media. */
  purpose?: VideoPurpose;
  /** Credits a picture and a video cost (Admin › Pricing). */
  costs?: { image: number; video: number };
  /** Opened from Social posts: "Use in this post" saves the reel and hands it back instead of leaving the page. */
  onUse?: (video: { url: string; id: string | null }) => void;
  /**
   * A delivery partner's studio (/logistics/video/studio): the video belongs to their LogisticsPartner (see
   * shared/video-owner.ts), the brand is their name and logo, and the shop-only places (a product page, an ad) are hidden.
   */
  partner?: boolean;
}) {
  const t = useT("video");
  const base = webVideoBase(partner ? "logistics_partner" : "seller");
  const router = useRouter();
  const saved = project?.config ?? null;
  const purpose: VideoPurpose = project?.purpose ?? startPurpose;
  const defaults = PURPOSE_DEFAULTS[purpose];
  const initial = products.find((product) => product.id === initialProductId) ?? null;
  const [productId, setProductId] = useState<string | null>(initial?.id ?? null);
  const [photos, setPhotos] = useState<Photo[]>(() => (saved?.photos?.length ? saved.photos.map((src) => ({ key: src, src })) : initial ? initial.images.map((src) => ({ key: src, src })) : []));
  const [originals, setOriginals] = useState<Photo[] | null>(null);
  const [name, setName] = useState(saved?.name ?? initial?.name ?? "");
  const [price, setPrice] = useState(saved?.price ?? (initial ? naira(initial.price) : ""));
  const [language, setLanguage] = useState<VideoLanguage>(() => (VIDEO_LANGUAGES.some((option) => option.key === saved?.language) ? (saved!.language as VideoLanguage) : "pidgin"));
  const [script, setScript] = useState<VideoScript | null>(saved?.script ?? null);
  const [template, setTemplate] = useState<ReelTemplateId>(saved?.template ?? defaults.template);
  // Which group of styles the picker shows; the chosen style always stays visible.
  const [feel, setFeel] = useState<ReelFeel | "all">("all");
  const [look, setLook] = useState<ReelShotLook>(() => ((REEL_SHOT_LOOKS as readonly string[]).includes(saved?.look ?? "") ? (saved!.look as ReelShotLook) : "cutout"));
  const [voiceSource, setVoiceSource] = useState<VoiceSource>(() => (saved?.voiceSource === "rex" || saved?.voiceSource === "elevenlabs" || saved?.voiceSource === "none" ? saved.voiceSource : "rex"));
  const [gender, setGender] = useState<VoiceGender>(saved?.gender === "male" ? "male" : "female");
  const [projectId, setProjectId] = useState<string | null>(project?.id ?? null);
  const [title, setTitle] = useState(project?.title ?? "");
  const [savedUrl, setSavedUrl] = useState<string | null>(project?.videoUrl ?? null);
  const [status, setStatus] = useState(project?.status ?? "draft");
  const [autosave, setAutosave] = useState<"idle" | "saving" | "saved">("idle");
  const [recorded, setRecorded] = useState<Blob | null>(null);
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [voiceSeconds, setVoiceSeconds] = useState<number | null>(null);
  const [music, setMusic] = useState<MusicMood | "upload" | "none">(() => (saved?.music === "none" || isMusicMood(saved?.music) ? (saved!.music as MusicMood | "none") : defaults.music));
  const [musicTouched, setMusicTouched] = useState(Boolean(saved?.music));
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicVolume, setMusicVolume] = useState(saved?.musicVolume ?? 0.7);
  const [playing, setPlaying] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "writing" | "shots" | "uploading" | "voicing" | "rendering" | "saving" | "saving-media">("idle");
  const [savedMedia, setSavedMedia] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<(ReelResult & { url: string }) | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [supported, setSupported] = useState(true);
  const media = useMediaLibrary();
  const voiceCache = useRef(new Map<string, ArrayBuffer>());
  const stopSound = useRef<(() => void) | null>(null);
  const product = products.find((item) => item.id === productId) ?? null;

  useEffect(() => setSupported(reelSupported()), []);
  useEffect(() => () => stopSound.current?.(), []);

  // A reel Rex prepared in Rex Studio arrives with its script, template, voice and shots (see RexCards' video card).
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(REX_REEL_HANDOFF_KEY);
      if (!raw) return;
      window.sessionStorage.removeItem(REX_REEL_HANDOFF_KEY);
      const handoff = JSON.parse(raw) as { productId?: string; language?: string; script?: VideoScript; template?: string; gender?: string; music?: string; photos?: string[] };
      if (!handoff.script || handoff.productId !== initialProductId) return;
      if (VIDEO_LANGUAGES.some((option) => option.key === handoff.language)) setLanguage(handoff.language as VideoLanguage);
      if (isReelTemplate(handoff.template)) setTemplate(handoff.template);
      if (handoff.gender === "male" || handoff.gender === "female") setGender(handoff.gender);
      if (isMusicMood(handoff.music)) {
        setMusic(handoff.music);
        setMusicTouched(true);
      }
      if (handoff.photos?.length) setPhotos(handoff.photos.slice(0, MAX_PHOTOS).map((src) => ({ key: src, src })));
      setScript({ captions: handoff.script.captions ?? [], voiceover: handoff.script.voiceover ?? "", cta: handoff.script.cta ?? "" });
      setNotice({ tone: "info", text: t("rexWrote") });
    } catch {
      // Storage can be blocked; the studio works without the handoff.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProductId]);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  // The music follows the template until the seller picks one (a new video starts with its purpose's music).
  useEffect(() => {
    if (!musicTouched) setMusic(template === defaults.template ? defaults.music : defaultMood(template));
  }, [template, musicTouched, defaults]);

  const captions = useMemo(() => {
    const base = script ?? fallbackScript(name || "this", price, language, photos.length);
    return Array.from({ length: Math.max(1, photos.length) }, (_, i) => base.captions[i] ?? base.captions[i % base.captions.length] ?? "");
  }, [script, name, price, language, photos.length]);
  const current = script ?? { ...fallbackScript(name || storeName, price, language, photos.length), ...(purpose === "product" ? {} : { cta: defaults.cta }) };
  const voiceKey = `${voiceSource}|${gender}|${language}|${current.voiceover}`;

  // The preview follows the voice's length once it is known, so captions change where the voice does.
  useEffect(() => {
    let cancelled = false;
    const clip = voiceSource === "record" ? recorded : voiceSource === "upload" ? voiceFile : null;
    const cached = voiceSource === "rex" || voiceSource === "elevenlabs" ? voiceCache.current.get(voiceKey) : null;
    if (voiceSource === "none") return setVoiceSeconds(null);
    if (cached) void audioSeconds(cached).then((s) => !cancelled && setVoiceSeconds(s));
    else if (clip) void clip.arrayBuffer().then(audioSeconds).then((s) => !cancelled && setVoiceSeconds(s));
    else setVoiceSeconds(null);
    return () => {
      cancelled = true;
    };
  }, [voiceSource, recorded, voiceFile, voiceKey]);

  // Drafts save themselves: the project is created the first time there is something to keep, then updated.
  const config: VideoConfig = useMemo(
    () => ({ template, photos: photos.map((photo) => photo.src).filter((src) => !src.startsWith("blob:")), name, price, language, script, voiceSource, gender, music: music === "upload" ? "none" : music, musicVolume, look }),
    [template, photos, name, price, language, script, voiceSource, gender, music, musicVolume, look],
  );
  const configKey = JSON.stringify(config);
  const lastSaved = useRef(saved ? JSON.stringify({ ...config }) : "");
  const creating = useRef<Promise<string | null> | null>(null);

  async function ensureProject(): Promise<string | null> {
    if (projectId) return projectId;
    if (!creating.current) {
      creating.current = (async () => {
        const response = await postJson("/api/app/videos", { purpose, productId, config, ...(title.trim() ? { title: title.trim() } : {}) });
        if (!response.ok) return null;
        const body = (await response.json()) as { data: { id: string; title: string } };
        setProjectId(body.data.id);
        setTitle((now) => now || body.data.title);
        window.history.replaceState(null, "", `${base}/studio?id=${body.data.id}`);
        return body.data.id;
      })().finally(() => {
        creating.current = null;
      });
    }
    return creating.current;
  }

  async function patchProject(body: Record<string, unknown>) {
    const id = await ensureProject();
    if (!id) throw new Error(t("err.save"));
    const response = await fetch(`/api/app/videos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw await errorFrom(response, t("err.save"));
    const json = (await response.json()) as { data: { status: string } };
    setStatus(json.data.status);
    return id;
  }

  useEffect(() => {
    if (configKey === lastSaved.current) return;
    if (!projectId && !photos.length && !name.trim()) return;
    const timer = window.setTimeout(async () => {
      setAutosave("saving");
      try {
        if (projectId) await patchProject({ config });
        else await ensureProject();
        lastSaved.current = configKey;
        setAutosave("saved");
      } catch {
        setAutosave("idle");
      }
    }, 1500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey, projectId]);

  async function saveTitle() {
    if (!title.trim()) return;
    try {
      await patchProject({ title: title.trim() });
    } catch {
      // The title saves with the next change.
    }
  }

  function chooseProduct(id: string) {
    const next = products.find((item) => item.id === id);
    if (!next) return;
    setProductId(next.id);
    setPhotos(next.images.map((src) => ({ key: src, src })));
    setOriginals(null);
    setName(next.name);
    setPrice(naira(next.price));
    setScript(null);
    setResult(null);
  }

  /** Photos come from the media library (which also uploads new ones), so the reel can be remade later. */
  async function addFromMedia() {
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return;
    const picked = await media.open({ multiple: true, accept: "image", title: t("pickPhotos") });
    if (!picked.length) return;
    setPhotos((list) => [...list, ...picked.filter((asset) => !list.some((photo) => photo.src === asset.url)).map((asset) => ({ key: asset.url, src: asset.url }))].slice(0, MAX_PHOTOS));
    setResult(null);
  }

  async function writeScript() {
    if (!name.trim()) return setNotice({ tone: "error", text: t("err.name") });
    setStep("writing");
    setNotice(null);
    try {
      const response = await postJson("/api/ai/video-script", { name, price, description: product?.description ?? "", language, photos: Math.max(1, photos.length) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new StudioError(body?.error?.message ?? t("err.write"), body?.error?.code);
      setScript({ captions: body.data.captions, voiceover: body.data.voiceover, cta: body.data.cta });
      if (!body.data.drafted) setNotice({ tone: "info", text: t("offline") });
    } catch (scriptError) {
      setScript(fallbackScript(name, price, language, photos.length));
      const credits = scriptError instanceof StudioError && isCreditsError(scriptError.code);
      setNotice({ tone: credits ? "error" : "info", text: scriptError instanceof Error ? `${scriptError.message} ${t("starter")}` : t("starter"), credits });
    } finally {
      setStep("idle");
      creditsChanged();
    }
  }

  async function makeShots() {
    if (!photos.length) return setNotice({ tone: "error", text: t("err.photo") });
    setStep("shots");
    setNotice(null);
    try {
      const response = await postJson("/api/ai/reel-shots", { photos: photos.map((photo) => photo.src), look, product: name || undefined });
      if (!response.ok) throw await errorFrom(response, t("err.shots"));
      const body = (await response.json()) as { data: { shots: Array<{ source: string; url: string | null; error?: string }>; creditsNeeded: boolean; message?: string } };
      const made = body.data.shots.filter((shot) => shot.url);
      if (made.length) {
        setOriginals((before) => before ?? photos);
        setPhotos((list) => list.map((photo) => {
          const shot = body.data.shots.find((item) => item.source === photo.src && item.url);
          return shot?.url ? { key: shot.url, src: shot.url } : photo;
        }));
        if (look === "cutout" && !REEL_TEMPLATES.find((item) => item.id === template)?.cutout) setTemplate("float");
        setResult(null);
      }
      const failed = body.data.shots.find((shot) => !shot.url);
      if (body.data.creditsNeeded) setNotice({ tone: "error", text: body.data.message ?? t("err.shots"), credits: true });
      else if (failed) setNotice({ tone: made.length ? "info" : "error", text: made.length ? t("shotsSome", { made: made.length, total: body.data.shots.length }) : failed.error ?? t("err.shots") });
      else setNotice({ tone: "success", text: t("shotsDone", { count: made.length }) });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? friendlyError(error) : t("err.shots"), credits: error instanceof StudioError && isCreditsError(error.code) });
    } finally {
      setStep("idle");
      creditsChanged();
    }
  }

  /** The voiceover as audio bytes, from Rex, ElevenLabs, the recording or the uploaded file (cached per script). */
  async function voiceAudio(): Promise<ArrayBuffer | null> {
    if (voiceSource === "none") return null;
    if (voiceSource === "record") {
      if (!recorded) throw new StudioError(t("err.noRecording"));
      return recorded.arrayBuffer();
    }
    if (voiceSource === "upload") {
      if (!voiceFile) throw new StudioError(t("err.noVoiceFile"));
      return voiceFile.arrayBuffer();
    }
    if (!current.voiceover.trim()) return null;
    const cached = voiceCache.current.get(voiceKey);
    if (cached) return cached;
    const response = await postJson("/api/ai/voiceover", { text: current.voiceover, language, gender, provider: voiceSource === "elevenlabs" ? "elevenlabs" : "rex" });
    if (!response.ok) throw await errorFrom(response, t("noVoice"));
    const audio = await response.arrayBuffer();
    voiceCache.current.set(voiceKey, audio);
    setVoiceSeconds(await audioSeconds(audio));
    return audio;
  }

  function stopPlaying() {
    stopSound.current?.();
    stopSound.current = null;
    setPlaying(null);
  }

  async function hearVoice() {
    if (playing) return stopPlaying();
    setStep("voicing");
    setNotice(null);
    try {
      const audio = await voiceAudio();
      if (!audio) return;
      const element = new Audio(URL.createObjectURL(new Blob([audio], { type: "audio/mpeg" })));
      stopSound.current = () => element.pause();
      element.onended = () => setPlaying(null);
      setPlaying("voice");
      await element.play();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? friendlyError(error) : t("noVoice"), credits: error instanceof StudioError && isCreditsError(error.code) });
    } finally {
      setStep("idle");
      creditsChanged();
    }
  }

  async function hearMusic(mood: MusicMood) {
    if (playing === mood) return stopPlaying();
    stopPlaying();
    setPlaying(mood);
    try {
      stopSound.current = await previewMusic(mood, 8);
      window.setTimeout(() => setPlaying((now) => (now === mood ? null : now)), 8000);
    } catch {
      setPlaying(null);
    }
  }

  async function make() {
    if (!photos.length) return setNotice({ tone: "error", text: t("err.photo") });
    stopPlaying();
    setNotice(null);
    setResult(null);
    try {
      // Voice first: if it fails, nothing has been charged for the video yet.
      let voiceover: ArrayBuffer | null = null;
      if (voiceSource !== "none") {
        setStep("voicing");
        voiceover = await voiceAudio();
      }
      const charge = await postJson("/api/ai/reel", {});
      if (!charge.ok) throw await errorFrom(charge, t("err.make"));
      creditsChanged();

      setStep("rendering");
      setProgress(0);
      const [images, logo] = await Promise.all([
        Promise.all(photos.map((photo) => loadReelImage(photo.src))),
        brand.logoUrl ? loadReelImage(brand.logoUrl).catch(() => null) : Promise.resolve(null),
      ]);
      const fontFamily = getComputedStyle(document.documentElement).getPropertyValue("--font-jakarta").trim();
      const musicInput =
        music === "none" ? null : music === "upload" ? (musicFile ? { file: await musicFile.arrayBuffer(), volume: musicVolume } : null) : { mood: music, volume: musicVolume };
      const reel = await renderReel({ template, photos: images, captions, brand, logo, cta: current.cta, storeName, price, storeHost, voiceover, music: musicInput, fontFamily, onProgress: setProgress });
      setResult({ ...reel, url: URL.createObjectURL(reel.blob) });
    } catch (renderError) {
      setNotice({
        tone: "error",
        text: renderError instanceof Error ? friendlyError(renderError) : t("err.make"),
        credits: renderError instanceof StudioError && isCreditsError(renderError.code),
      });
    } finally {
      setStep("idle");
      creditsChanged();
    }
  }

  /**
   * Saves the recorded video: uploads it (and its cover) straight from the browser to storage, keeps it in the
   * media library and marks the project "saved". Returns the video's link.
   */
  async function saveVideo(): Promise<string | null> {
    if (!result) return savedUrl;
    if (savedMedia === result.url && savedUrl) return savedUrl;
    const base = (title || name || product?.name || "reel").replace(/[^\w-]+/g, "-").toLowerCase().slice(0, 40) || "reel";
    const file = new File([result.blob], `${base}-reel.${result.extension}`, { type: result.mimeType.split(";")[0] });
    const [uploaded, poster] = await Promise.all([
      uploadFile("products", file),
      result.poster ? uploadFile("products", new File([result.poster], `${base}-cover.jpg`, { type: "image/jpeg" })).catch(() => null) : Promise.resolve(null),
    ]);
    // The seller's media library keeps the video (Rex's actions are for shops; a partner's video stays in their list).
    if (!partner) await fetch("/api/ai/rex/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_to_media", url: uploaded.publicUrl, kind: "video", name: title || name || product?.name || "Reel" }),
    }).catch(() => null);
    await patchProject({ videoUrl: uploaded.publicUrl, ...(poster ? { posterUrl: poster.publicUrl } : {}), seconds: Math.round(result.seconds * 10) / 10, config });
    setSavedMedia(result.url);
    setSavedUrl(uploaded.publicUrl);
    return uploaded.publicUrl;
  }

  async function saveToMedia() {
    if (!result) return;
    setStep("saving-media");
    setNotice(null);
    try {
      await saveVideo();
      setNotice({ tone: "success", text: t("savedVideo") });
    } catch (saveError) {
      setNotice({ tone: "error", text: saveError instanceof Error ? friendlyError(saveError) : t("err.save") });
    } finally {
      setStep("idle");
    }
  }

  async function saveToProduct() {
    if (!product) return;
    setStep("saving");
    setNotice(null);
    try {
      const url = await saveVideo();
      if (!url) throw new Error(t("err.save"));
      const response = await fetch(`/api/store/products/${product.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videoUrl: url }) });
      if (!response.ok) throw new Error(t("err.attach"));
      await patchProject({ published: { kind: "product", id: product.id } });
      setNotice({ tone: "success", text: t("added", { name: product.name }) });
    } catch (saveError) {
      setNotice({ tone: "error", text: saveError instanceof Error ? friendlyError(saveError) : t("err.save") });
    } finally {
      setStep("idle");
    }
  }

  async function useInAd() {
    setStep("saving");
    setNotice(null);
    try {
      const url = await saveVideo();
      const id = await ensureProject();
      if (!url || !id) throw new Error(t("err.save"));
      router.push(`/home/ads/new?video=${id}`);
    } catch (saveError) {
      setNotice({ tone: "error", text: saveError instanceof Error ? friendlyError(saveError) : t("err.save") });
      setStep("idle");
    }
  }

  async function useInPost() {
    if (!onUse) return;
    setStep("saving");
    setNotice(null);
    try {
      const url = await saveVideo();
      if (!url) throw new Error(t("err.save"));
      const id = await ensureProject().catch(() => null);
      onUse({ url, id });
    } catch (saveError) {
      setNotice({ tone: "error", text: saveError instanceof Error ? friendlyError(saveError) : t("err.save") });
    } finally {
      setStep("idle");
    }
  }

  async function markPosted() {
    setStep("saving");
    setNotice(null);
    try {
      await saveVideo();
      await patchProject({ published: { kind: "social" } });
      setNotice({ tone: "success", text: t("markedPosted") });
    } catch (saveError) {
      setNotice({ tone: "error", text: saveError instanceof Error ? friendlyError(saveError) : t("err.save") });
    } finally {
      setStep("idle");
    }
  }

  const busy = step !== "idle";

  if (!supported) {
    return <Notice tone="info">{t("unsupported")}</Notice>;
  }

  const voiceOptions: Array<{ value: VoiceSource; label: string }> = [
    { value: "rex", label: t("voice.rex") },
    ...(elevenLabs ? [{ value: "elevenlabs" as const, label: t("voice.eleven") }] : []),
    { value: "record", label: t("voice.record") },
    { value: "upload", label: t("voice.upload") },
    { value: "none", label: t("voice.none") },
  ];

  return (
    <div className="grid gap-4">
    <div className="flex flex-wrap items-center gap-3 rounded-[22px] border border-app-line bg-white px-4 py-3">
      <Link href={base} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-app-line px-3.5 text-[13.5px] font-bold text-app-ink no-underline">
        <Icon name="arrowLeft" size={14} /> {t("hub.all")}
      </Link>
      <span className="rounded-full bg-app-peach px-2.5 py-1 text-[12px] font-bold">{t(`hub.purpose.${purpose}`)}</span>
      <label htmlFor="video-title" className="sr-only">{t("hub.titleLabel")}</label>
      <input
        id="video-title"
        value={title}
        placeholder={t("hub.titlePh")}
        maxLength={120}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => void saveTitle()}
        className="h-10 min-w-0 flex-1 basis-[200px] rounded-full border border-app-line bg-app-canvas px-4 text-[14px] font-bold outline-none focus:border-app-ink"
      />
      <span className="text-[12.5px] font-bold text-app-ink-soft" role="status">
        {t(`hub.status.${status === "saved" || status === "published" ? status : "draft"}`)}
        {autosave === "saving" ? ` · ${t("hub.autosaving")}` : autosave === "saved" ? ` · ${t("hub.autosaved")}` : ""}
      </span>
    </div>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid content-start gap-4">
        <section className={card}>
          <h2 className="m-0 text-[17px] font-extrabold">{t("photos")}</h2>
          {products.length > 0 && (
            <div className="mt-3">
              <FieldLabel htmlFor="video-product">{t("fromProduct")}</FieldLabel>
              <select
                id="video-product"
                value={productId ?? ""}
                onChange={(event) => chooseProduct(event.target.value)}
                className="h-[52px] w-full rounded-[16px] border border-app-line bg-white px-4 text-[15px]"
              >
                <option value="" disabled>{t("chooseProduct")}</option>
                {products.map((item) => <option key={item.id} value={item.id}>{item.name}{item.hasVideo ? ` ${t("hasVideo")}` : ""}</option>)}
              </select>
            </div>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {photos.map((photo, index) => (
              <div key={photo.key} className="relative aspect-[9/16] overflow-hidden rounded-[12px] bg-[repeating-conic-gradient(#eee_0%_25%,#fff_0%_50%)] bg-[length:16px_16px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.src} alt={t("photoN", { n: index + 1 })} className="h-full w-full object-contain" />
                <button type="button" aria-label={t("removePhoto", { n: index + 1 })} onClick={() => setPhotos((list) => list.filter((item) => item.key !== photo.key))} className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-[14px] font-bold">×</button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button type="button" disabled={step === "uploading"} onClick={() => void addFromMedia()} className="grid aspect-[9/16] place-items-center rounded-[12px] border-2 border-dashed border-app-line-strong text-[13px] font-bold text-app-ink-soft">
                {step === "uploading" ? <Spinner className="h-5 w-5" /> : t("addPhoto")}
              </button>
            )}
          </div>
          {media.dialog}
          <p className="mb-0 mt-2 text-[12.5px] text-app-ink-soft">{t("photosTip", { max: MAX_PHOTOS })}</p>

          <div className="mt-4 rounded-[16px] bg-app-canvas p-4">
            <h3 className="m-0 flex items-center gap-1.5 text-[14.5px] font-extrabold"><Icon name="sparkle" size={15} /> {t("shots.title")}</h3>
            <p className="m-0 mt-1 text-[13px] leading-[1.45] text-app-ink-soft">{t("shots.hint")}</p>
            <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={t("shots.title")}>
              {REEL_SHOT_LOOKS.map((option) => (
                <button key={option} type="button" role="radio" aria-checked={look === option} onClick={() => setLook(option)} className={cx(chip, look === option ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}>
                  {t(`shots.${option}`)}
                </button>
              ))}
            </div>
            <p className="m-0 mt-2 text-[12.5px] text-app-ink-soft">{t(`shots.${look}Hint`)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <PillButton type="button" size="md" busy={step === "shots"} disabled={busy || !photos.length} onClick={() => void makeShots()}>
                {step === "shots" ? t("shots.making") : t("shots.make", { count: photos.length })}
              </PillButton>
              {originals ? (
                <button type="button" disabled={busy} onClick={() => { setPhotos(originals); setOriginals(null); setResult(null); }} className="text-[13px] font-bold underline underline-offset-2">
                  {t("shots.undo")}
                </button>
              ) : null}
            </div>
            {step === "shots" && <FunLoader kind="image" size="sm" className="mt-3" />}
            <p className="m-0 mt-2 text-[12px] text-app-ink-soft">{t("shots.cost", { credits: costs.image })}</p>
          </div>
        </section>

        <section className={card}>
          <h2 className="m-0 text-[17px] font-extrabold">{t("style")}</h2>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t("styleFeel")}>
            {[{ id: "all" as const, name: t("styleAll", { count: REEL_TEMPLATES.length }) }, ...REEL_FEELS.map((option) => ({ id: option.id, name: t.dynamic(`feel.${option.id}`, option.name) }))].map((option) => (
              <button key={option.id} type="button" aria-pressed={feel === option.id} onClick={() => setFeel(option.id)} className={cx("min-h-[34px] rounded-full border px-3.5 text-[13px] font-bold", feel === option.id ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}>
                {option.name}
              </button>
            ))}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label={t("style")}>
            {REEL_TEMPLATES.filter((option) => feel === "all" || option.feel === feel || option.id === template).map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={template === option.id}
                onClick={() => setTemplate(option.id)}
                className={cx("rounded-[16px] border-2 p-3 text-left", template === option.id ? "border-app-ink bg-app-canvas" : "border-app-line hover:border-app-line-strong")}
              >
                <span className="block text-[14.5px] font-extrabold">{t.dynamic(`tpl.${option.id}`, option.name)}</span>
                <span className="mt-0.5 block text-[12.5px] leading-[1.4] text-app-ink-soft">{t.dynamic(`tpl.${option.id}Blurb`, option.blurb)}</span>
                {option.cutout ? <span className="mt-1.5 inline-block rounded-full bg-white px-2 py-0.5 text-[11px] font-bold">{t("tpl.cutoutBest")}</span> : null}
              </button>
            ))}
          </div>
          <p className="m-0 mt-3 text-[11.5px] leading-[1.45] text-app-ink-soft">{t.dynamic("tpl.credit", REEL_TEMPLATE_CREDIT)}</p>
        </section>

        <section className={card}>
          <h2 className="m-0 text-[17px] font-extrabold">{t("whatPeggySays")}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="video-name">{partner ? t("partner.about") : t("product")}</FieldLabel>
              <TextInput id="video-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={partner ? t("partner.aboutPh") : undefined} />
            </div>
            <div>
              <FieldLabel htmlFor="video-price">{t("priceOnScreen")}</FieldLabel>
              <TextInput id="video-price" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="₦29,500" />
            </div>
          </div>
          <div className="mt-3">
            <Segmented options={VIDEO_LANGUAGES.map((option) => ({ value: option.key, label: t.dynamic(`lang.${option.key}`, option.label) }))} value={language} onChange={(value) => { setLanguage(value); setScript(null); }} />
          </div>
          <PillButton type="button" tone="white" size="md" className="mt-3" busy={step === "writing"} disabled={busy} onClick={() => void writeScript()}>
            {script ? t("writeAgain") : t("writeWithPeggy")}
          </PillButton>

          <div className="mt-4 grid gap-2">
            {captions.map((caption, index) => (
              <div key={index}>
                <FieldLabel htmlFor={`caption-${index}`}>{t("captionN", { n: index + 1 })}</FieldLabel>
                <TextInput
                  id={`caption-${index}`}
                  value={caption}
                  maxLength={48}
                  onChange={(event) => {
                    const next = [...captions];
                    next[index] = event.target.value;
                    setScript({ ...current, captions: next });
                  }}
                />
              </div>
            ))}
            {voiceSource === "rex" || voiceSource === "elevenlabs" ? (
              <div>
                <FieldLabel htmlFor="voiceover">{t("voiceover")}</FieldLabel>
                <textarea
                  id="voiceover"
                  rows={3}
                  maxLength={600}
                  value={current.voiceover}
                  onChange={(event) => setScript({ ...current, voiceover: event.target.value })}
                  className="w-full rounded-[16px] border border-app-line px-4 py-3 text-[15px]"
                />
              </div>
            ) : null}
            <div>
              <FieldLabel htmlFor="video-cta">{t("lastScreen")}</FieldLabel>
              <TextInput id="video-cta" value={current.cta} maxLength={40} onChange={(event) => setScript({ ...current, cta: event.target.value })} />
            </div>
          </div>
        </section>

        <section className={card}>
          <h2 className="m-0 text-[17px] font-extrabold">{t("sound")}</h2>
          <h3 className="m-0 mt-3 text-[14px] font-bold">{t("voice.title")}</h3>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t("voice.title")}>
            {voiceOptions.map((option) => (
              <button key={option.value} type="button" role="radio" aria-checked={voiceSource === option.value} onClick={() => setVoiceSource(option.value)} className={cx(chip, voiceSource === option.value ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}>
                {option.label}
              </button>
            ))}
          </div>
          {voiceSource === "rex" || voiceSource === "elevenlabs" ? (
            <div className="mt-3 grid gap-2">
              <Segmented options={[{ value: "female", label: t("voice.female") }, { value: "male", label: t("voice.male") }]} value={gender} onChange={(value) => setGender(value as VoiceGender)} />
              <p className="m-0 text-[12.5px] text-app-ink-soft">{voiceSource === "elevenlabs" ? t("voice.elevenHint") : t("voice.rexHint")}</p>
              <button type="button" disabled={busy && step !== "voicing"} onClick={() => void hearVoice()} className={cx(chip, "w-fit border-app-line bg-white")}>
                {step === "voicing" ? <Spinner className="h-4 w-4" /> : <Icon name={playing === "voice" ? "pause" : "play"} size={14} />} {playing === "voice" ? t("stop") : t("voice.hear")}
              </button>
            </div>
          ) : voiceSource === "record" ? (
            <div className="mt-3">
              <p className="m-0 mb-2 text-[13px] leading-[1.45]">{t("rec.script")} <span className="text-app-ink-soft">“{current.voiceover}”</span></p>
              <VoiceRecorder value={recorded} onChange={setRecorded} />
            </div>
          ) : voiceSource === "upload" ? (
            <div className="mt-3 grid gap-1.5">
              <input type="file" accept="audio/*" onChange={(event) => setVoiceFile(event.target.files?.[0] ?? null)} className="text-[13.5px]" aria-label={t("voice.upload")} />
              <p className="m-0 text-[12.5px] text-app-ink-soft">{t("voice.uploadHint")}</p>
            </div>
          ) : (
            <p className="m-0 mt-2 text-[12.5px] text-app-ink-soft">{t("voice.noneHint")}</p>
          )}
          {voiceSeconds ? <p className="m-0 mt-2 text-[12.5px] font-bold text-app-success">{t("voice.synced", { seconds: Math.round(voiceSeconds) })}</p> : null}

          <h3 className="m-0 mt-5 text-[14px] font-bold">{t("music.title")}</h3>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t("music.title")}>
            {MUSIC_MOODS.map((mood) => (
              <span key={mood.id} className={cx("inline-flex items-center rounded-full border", music === mood.id ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}>
                <button type="button" role="radio" aria-checked={music === mood.id} onClick={() => { setMusic(mood.id); setMusicTouched(true); }} className="min-h-[40px] pl-3.5 pr-1.5 text-[13.5px] font-bold">
                  {t.dynamic(`music.${mood.id}`, mood.name)}
                </button>
                <button type="button" onClick={() => void hearMusic(mood.id)} aria-label={t("music.hear", { name: mood.name })} className="grid h-[40px] w-9 place-items-center rounded-r-full">
                  <Icon name={playing === mood.id ? "pause" : "play"} size={13} />
                </button>
              </span>
            ))}
            <button type="button" role="radio" aria-checked={music === "upload"} onClick={() => { setMusic("upload"); setMusicTouched(true); }} className={cx(chip, music === "upload" ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}>
              {t("music.upload")}
            </button>
            <button type="button" role="radio" aria-checked={music === "none"} onClick={() => { setMusic("none"); setMusicTouched(true); }} className={cx(chip, music === "none" ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}>
              {t("music.none")}
            </button>
          </div>
          {music === "upload" ? (
            <div className="mt-2 grid gap-1">
              <input type="file" accept="audio/*" onChange={(event) => setMusicFile(event.target.files?.[0] ?? null)} className="text-[13.5px]" aria-label={t("music.upload")} />
              <p className="m-0 text-[12.5px] text-app-ink-soft">{t("music.uploadHint")}</p>
            </div>
          ) : music !== "none" ? (
            <p className="m-0 mt-2 text-[12.5px] text-app-ink-soft">{t("music.hint")}</p>
          ) : null}
          {music !== "none" ? (
            <label className="mt-3 flex items-center gap-3 text-[13px] font-bold">
              {t("music.volume")}
              <input type="range" min={0} max={1} step={0.05} value={musicVolume} onChange={(event) => setMusicVolume(Number(event.target.value))} className="flex-1 accent-[#16141F]" />
            </label>
          ) : null}
        </section>
      </div>

      <aside className="grid content-start gap-4 lg:sticky lg:top-4">
        <section className={cx(card, "grid gap-3")}>
          <h2 className="m-0 text-[17px] font-extrabold">{t("yourReel")}</h2>
          <div className="relative mx-auto aspect-[9/16] w-full max-w-[280px] overflow-hidden rounded-[18px] bg-app-ink">
            {result ? (
              <video src={result.url} controls playsInline className="h-full w-full object-cover" />
            ) : photos.length ? (
              <>
                <ReelPreview
                  className="h-full w-full"
                  label={t("previewLabel")}
                  input={{ template, photos: photos.map((photo) => photo.src), captions, brand, storeName, price, cta: current.cta, storeHost, voiceSeconds }}
                />
                {step === "rendering" || step === "voicing" ? (
                  <div className="absolute inset-0 grid place-items-center bg-black/55 p-6 text-center text-[14px] font-bold text-white">
                    {step === "rendering" ? t("making", { pct: Math.round(progress * 100) }) : t("recording")}
                  </div>
                ) : (
                  <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white">{t("previewTag")}</span>
                )}
              </>
            ) : (
              <div className="grid h-full place-items-center p-6 text-center text-[14px] text-white/70">{t("showsHere")}</div>
            )}
          </div>
          <PillButton type="button" busy={step === "voicing" || step === "rendering"} disabled={busy || !photos.length} onClick={() => void make()}>
            {result ? t("makeAgain") : t("make")}
          </PillButton>
          <p className="m-0 text-center text-[12px] text-app-ink-soft">{t("cost", { credits: costs.video })}</p>
          {!result && savedUrl ? (
            <div className="grid gap-2 rounded-[16px] bg-app-canvas p-3">
              <p className="m-0 text-[13px] font-bold">{t("savedVersion")}</p>
              <video src={savedUrl} controls playsInline className="mx-auto aspect-[9/16] w-full max-w-[160px] rounded-[12px] bg-app-ink object-cover" />
              {partner ? null : <PillButton type="button" size="sm" busy={step === "saving"} disabled={busy} onClick={() => void useInAd()}>{t("useInAd")}</PillButton>}
              {product ? (
                <PillButton type="button" size="sm" tone="white" disabled={busy} onClick={() => void saveToProduct()}>{t("addTo", { name: product.name })}</PillButton>
              ) : null}
              <a href={savedUrl} download target="_blank" rel="noopener noreferrer" className="text-center text-[13px] font-bold text-app-ink underline underline-offset-2">{t("downloadSaved")}</a>
            </div>
          ) : null}
          {(step === "rendering" || step === "voicing") && <FunLoader kind="video" size="sm" />}
          {step === "rendering" && <p className="m-0 text-center text-[12.5px] text-app-ink-soft">{t("keepOpen", { seconds: Math.round(result?.seconds ?? 14) })}</p>}
          {result && (
            <>
              <a href={result.url} download={`${(name || "reel").replace(/[^\w-]+/g, "-").toLowerCase()}.${result.extension}`} className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-app-line bg-white text-[15px] font-extrabold text-app-ink no-underline">
                {t("download", { ext: result.extension.toUpperCase() })}
              </a>
              {onUse ? (
                <PillButton type="button" busy={step === "saving"} disabled={busy} onClick={() => void useInPost()}>
                  {t("useInPost")}
                </PillButton>
              ) : null}
              <PillButton type="button" tone="white" busy={step === "saving-media"} disabled={busy || savedMedia === result.url} onClick={() => void saveToMedia()}>
                {savedMedia === result.url ? t("savedVideoShort") : t("saveVideo")}
              </PillButton>
              {partner ? null : (
                <PillButton type="button" busy={step === "saving" && purpose === "ad"} disabled={busy} onClick={() => void useInAd()}>
                  {t("useInAd")}
                </PillButton>
              )}
              {purpose === "social" || partner ? (
                <PillButton type="button" tone="white" disabled={busy} onClick={() => void markPosted()}>
                  {t("markPosted")}
                </PillButton>
              ) : null}
              {product && (
                <PillButton type="button" tone="white" busy={step === "saving"} disabled={busy} onClick={() => void saveToProduct()}>
                  {t("addTo", { name: product.name })}
                </PillButton>
              )}
              <button type="button" onClick={() => setResult(null)} className="text-[13px] font-bold underline underline-offset-2">{t("backToPreview")}</button>
              {result.extension === "webm" && (
                <p className="m-0 text-[12.5px] leading-[1.5] text-app-ink-soft">{t("webm")}</p>
              )}
            </>
          )}
        </section>
        {notice && (
          <div className="grid gap-2">
            <Notice tone={notice.tone}>{notice.text}</Notice>
            {notice.credits ? <BuyCreditsButton manageHref={partner ? "/logistics/credits" : undefined} /> : null}
          </div>
        )}
      </aside>
    </div>
    </div>
  );
}
