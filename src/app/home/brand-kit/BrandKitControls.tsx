"use client";

import { useMediaLibrary } from "@/components/media/useMediaLibrary";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Spinner, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { shrinkImage } from "@/components/profile/IdentityImageUploader";
import { broadcastIdentity, type ShellIdentity } from "@/components/shell/useShellCounts";
import { identityImageProblem } from "@shared/identity-images";
import { useT } from "@/components/i18n/I18nProvider";

// Interactive parts of the brand kit: logo upload (same endpoint as Settings → logo), downloading the logo,
// editable colours (saved into the builder draft's theme, like the builder's own colour pickers) and the
// voice note Rex writes with.

const pillWhite =
  "inline-flex min-h-[44px] items-center gap-2 rounded-full border border-app-line bg-white px-5 text-[14px] font-extrabold text-app-ink transition hover:border-app-line-strong disabled:opacity-60";

export function UploadLogoButton({ hasLogo }: { hasLogo: boolean }) {
  const t = useT("store");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const media = useMediaLibrary();

  /** The media library first (it uploads new files too); the chosen picture becomes the logo. */
  async function fromMedia() {
    const [asset] = await media.open({ accept: "image", title: t("bk.chooseLogo") });
    if (!asset) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/app/brand-assets", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "logo", url: asset.url }) });
      const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(json?.error?.message ?? t("bk.didntSave"));
      broadcastIdentity({ logoUrl: asset.url });
      setMessage({ tone: "ok", text: t("bk.logoUpdated") });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : t("bk.didntSave") });
    } finally {
      setBusy(false);
    }
  }

  async function onChange(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;
    setMessage(null);
    const file = await shrinkImage(picked, 1024);
    const problem = identityImageProblem(file);
    if (problem) {
      setMessage({ tone: "error", text: problem });
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.set("kind", "logo");
      body.set("file", file);
      const response = await fetch("/api/app/me/images", { method: "POST", body });
      const json = (await response.json().catch(() => null)) as { data?: ShellIdentity; error?: { message?: string } } | null;
      if (response.status === 413) throw new Error(t("bk.tooLarge"));
      if (!response.ok || !json?.data) throw new Error(json?.error?.message ?? t("bk.didntSave"));
      broadcastIdentity({ logoUrl: json.data.logoUrl });
      setMessage({ tone: "ok", text: t("bk.logoUpdated") });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : t("bk.didntSave") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="relative inline-flex">
      <button type="button" onClick={() => void fromMedia()} disabled={busy} className={pillWhite}>
        {busy ? <Spinner className="h-4 w-4" /> : <Icon name="upload" size={16} />} {hasLogo ? t("bk.changeLogo") : t("bk.uploadLogo")}
      </button>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={t("bk.chooseLogo")} onChange={(event) => void onChange(event)} />
      {media.dialog}
      <span role="status" aria-live="polite" className={cx("absolute left-0 top-[calc(100%+4px)] whitespace-nowrap text-[12.5px] font-semibold", message?.tone === "error" ? "text-app-danger" : "text-app-forest")}>
        {busy ? t("bk.uploading") : message?.text ?? ""}
      </span>
    </span>
  );
}

/** Saves the logo file itself (fetch + blob so the browser downloads it instead of opening a tab). */
export function DownloadLogoButton({ url, fileName, label = "Download", className }: { url: string; fileName: string; label?: string; className?: string }) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/jpeg" ? "jpg" : blob.type === "image/svg+xml" ? "svg" : "png";
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `${fileName}.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={() => void download()} disabled={busy} className={className ?? pillWhite}>
      {busy ? <Spinner className="h-4 w-4" /> : <Icon name="download" size={16} />} {label}
    </button>
  );
}

type ColourKey = "paperBg" | "ink" | "accent" | "cardBg";

export function ColourSwatches({
  colours,
  linked,
  storeLive,
}: {
  colours: Array<{ key: ColourKey; label: string; hint: string; value: string }>;
  /** Tokens that follow a colour (buttons follow the accent). */
  linked: Partial<Record<ColourKey, string[]>>;
  storeLive: boolean;
}) {
  const t = useT("store");
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(colours.map((colour) => [colour.key, colour.value])));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<number | null>(null);
  const pending = useRef<Record<string, string>>({});

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  function change(key: ColourKey, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    pending.current[key] = value;
    for (const follower of linked[key] ?? []) pending.current[follower] = value;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), 600);
  }

  async function save() {
    const changes = pending.current;
    pending.current = {};
    if (Object.keys(changes).length === 0) return;
    setState("saving");
    try {
      const response = await fetch("/api/store/editor", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops: [{ op: "update-theme", changes }] }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setState("saved");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <ul className="m-0 mt-4 grid list-none grid-cols-2 gap-3 p-0 lg:grid-cols-4">
        {colours.map((colour) => (
          <li key={colour.key} className="min-w-0">
            <label className="group block cursor-pointer" title={colour.hint}>
              <span
                className="relative block h-20 rounded-[16px] transition group-hover:scale-[0.98] group-focus-within:ring-2 group-focus-within:ring-app-ink"
                style={{ background: values[colour.key], boxShadow: "inset 0 0 0 1px rgba(22,20,31,0.08)" }}
              >
                <span className="absolute bottom-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-app-ink opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                  <Icon name="edit" size={13} />
                </span>
              </span>
              <span className="mt-2 block truncate text-[14.5px] font-bold">{colour.label}</span>
              <span className="block text-[13px] uppercase text-app-ink-soft">{values[colour.key]}</span>
              <input
                type="color"
                value={values[colour.key]}
                onChange={(event) => change(colour.key, event.target.value.toUpperCase())}
                aria-label={t("bk.changeColour", { name: colour.label.toLowerCase() })}
                className="sr-only"
              />
            </label>
          </li>
        ))}
      </ul>
      <p role="status" aria-live="polite" className="mb-0 mt-3 min-h-[20px] text-[13px] text-app-ink-soft">
        {state === "saving" && t("bk.saving")}
        {state === "error" && <span className="font-semibold text-app-danger">{t("bk.didntSave")}</span>}
        {state === "saved" &&
          (storeLive ? (
            <>
              {t("bk.savedDraft")} <Link href="/seller/store/builder" className="font-bold text-app-accent-ink">{t("bk.publishInBuilder")}</Link> {t("bk.toShow")}
            </>
          ) : (
            t("bk.savedOnPublish")
          ))}
        {state === "idle" && t("bk.clickColour")}
      </p>
    </>
  );
}

export function VoiceNote({ initial }: { initial: string }) {
  const t = useT("store", "common");
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [editing, setEditing] = useState(false);

  async function save() {
    setState("saving");
    try {
      const response = await fetch("/api/app/store", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandSettings: { onboardingMemory: { customerProfile: { vibe: value.trim() } } } }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setSaved(value.trim());
      setState("saved");
      setEditing(false);
    } catch {
      setState("error");
    }
  }

  if (!editing) {
    return (
      <div className="mt-3">
        <p className={cx("m-0 text-[15px] leading-[1.55]", !saved && "text-app-ink-soft")}>
          {saved || t("bk.voiceEmpty")}
        </p>
        <button type="button" onClick={() => setEditing(true)} className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13.5px] font-bold text-app-ink hover:border-app-line-strong">
          <Icon name="edit" size={14} /> {saved ? t("bk.edit") : t("bk.addVoice")}
        </button>
        {state === "saved" && <span role="status" className="ml-3 text-[13px] font-semibold text-app-forest">{t("saved")}</span>}
      </div>
    );
  }

  return (
    <div className="mt-3 grid gap-2">
      <label htmlFor="brand-voice" className="sr-only">{t("bk.voice")}</label>
      <textarea
        id="brand-voice"
        value={value}
        onChange={(event) => setValue(event.target.value.slice(0, 300))}
        rows={3}
        autoFocus
        placeholder={t("bk.voicePlaceholder")}
        className="w-full resize-y rounded-[16px] border border-app-line bg-white px-4 py-3 text-[15px] leading-[1.5] text-app-ink outline-none focus:border-app-ink"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void save()} disabled={state === "saving"} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-app-ink px-4 text-[13.5px] font-extrabold text-white disabled:opacity-60">
          {state === "saving" ? <Spinner className="h-4 w-4" /> : <Icon name="check" size={14} />} {t("save")}
        </button>
        <button type="button" onClick={() => { setValue(saved); setEditing(false); setState("idle"); }} className="inline-flex min-h-[40px] items-center rounded-full px-3 text-[13.5px] font-bold text-app-ink-soft hover:text-app-ink">
          {t("cancel")}
        </button>
        <span className="text-[12.5px] text-app-ink-soft">{value.length}/300</span>
        {state === "error" && <span role="alert" className="text-[13px] font-semibold text-app-danger">{t("bk.didntSave")}</span>}
      </div>
    </div>
  );
}
