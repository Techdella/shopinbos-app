"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { broadcastIdentity, useIdentity, type ShellIdentity } from "@/components/shell/useShellCounts";
import { identityImageProblem, initialsOf, type IdentityImageKind } from "@shared/identity-images";
import { useT } from "@/components/i18n/I18nProvider";
import { shrinkImage } from "@/lib/media/shrink-image";
import { friendlyError } from "@/lib/errors/report-client";

// Upload, change or remove the person's photo or their store/business logo. Saving broadcasts the new picture
// so the top bar, the menu and any other uploader on screen update at once, then refreshes the page's server
// data so everything else (cards, lists) catches up without a reload.

async function send(kind: IdentityImageKind, file: File | null, messages: { tooLarge: string; failed: string }): Promise<ShellIdentity> {
  let response: Response;
  if (file) {
    const body = new FormData();
    body.set("kind", kind);
    body.set("file", file);
    response = await fetch("/api/app/me/images", { method: "POST", body });
  } else {
    response = await fetch(`/api/app/me/images?kind=${kind}`, { method: "DELETE" });
  }
  const json = (await response.json().catch(() => null)) as { data?: ShellIdentity; error?: { message?: string } } | null;
  if (response.status === 413) throw new Error(messages.tooLarge);
  if (!response.ok || !json?.data) throw new Error(json?.error?.message ?? messages.failed);
  return json.data;
}

export function IdentityImageUploader({
  kind,
  initialUrl,
  name,
  title,
  hint,
  size = 88,
  hideTitle = false,
}: {
  kind: IdentityImageKind;
  /** What the page loaded; the uploader then follows uploads made anywhere in the app. */
  initialUrl: string | null;
  /** Used for the initials shown when there's no picture. */
  name: string;
  title: string;
  hint?: string;
  size?: number;
  /** When the surrounding card already shows the title, keep it for screen readers only. */
  hideTitle?: boolean;
}) {
  const t = useT("account", "common");
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const me = useIdentity(kind === "avatar" ? { avatarUrl: initialUrl } : { logoUrl: initialUrl });
  const current = kind === "avatar" ? me.avatarUrl : me.logoUrl;
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const shown = preview ?? current;
  const round = kind === "avatar";

  async function save(file: File | null) {
    setBusy(file ? "upload" : "remove");
    setMessage(null);
    try {
      const identity = await send(kind, file, { tooLarge: t("img.tooLarge"), failed: t("img.failed") });
      broadcastIdentity(kind === "avatar" ? { avatarUrl: identity.avatarUrl } : { logoUrl: identity.logoUrl });
      setMessage({ tone: "ok", text: file ? (round ? t("img.photoUpdated") : t("img.updated", { title })) : round ? t("img.photoRemoved") : t("img.removed", { title }) });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? friendlyError(error) : t("img.failed") });
    } finally {
      setBusy(null);
      setPreview((url) => {
        if (url) URL.revokeObjectURL(url);
        return null;
      });
    }
  }

  async function onChange(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    event.target.value = ""; // Choosing the same file again should still upload.
    if (!picked) return;
    if (!picked.type.startsWith("image/")) {
      setMessage({ tone: "error", text: t("img.useType") });
      return;
    }
    const file = await shrinkImage(picked, round ? 800 : 1024);
    const problem = identityImageProblem(file);
    if (problem) {
      setMessage({ tone: "error", text: problem });
      return;
    }
    setPreview(URL.createObjectURL(file));
    await save(file);
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-4">
      <div
        className={`relative grid shrink-0 place-items-center overflow-hidden border border-app-line bg-app-canvas font-extrabold text-app-ink ${round ? "rounded-full" : "rounded-[18px]"}`}
        style={{ width: size, height: size, fontSize: Math.round(size / 3) }}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="" className={`h-full w-full ${round ? "object-cover" : "object-contain bg-white p-1"}`} />
        ) : (
          <span aria-hidden>{initialsOf(name)}</span>
        )}
        {busy && (
          <span className="absolute inset-0 grid place-items-center bg-white/70 text-app-ink">
            <Spinner />
          </span>
        )}
      </div>
      <div className="grid min-w-0 flex-1 gap-2">
        <label htmlFor={inputId} className={hideTitle ? "sr-only" : "block text-[14px] font-extrabold"}>{title}</label>
        {hint && <p className="m-0 text-[12.5px] leading-[1.45] text-app-ink-soft">{hint}</p>}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy !== null}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-app-ink px-4 text-[13.5px] font-bold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            <Icon name="upload" size={14} /> {current ? t("img.change") : round ? t("img.addPhoto") : t("img.addLogo")}
          </button>
          {current && (
            <button
              type="button"
              onClick={() => void save(null)}
              disabled={busy !== null}
              className="inline-flex min-h-[40px] items-center rounded-full border border-app-line bg-white px-4 text-[13.5px] font-bold text-app-ink transition hover:border-app-line-strong disabled:opacity-60"
            >
              {t("remove")}
            </button>
          )}
        </div>
        <input ref={inputRef} id={inputId} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void onChange(event)} />
        <p role="status" aria-live="polite" className={`m-0 min-h-[18px] text-[12.5px] font-semibold ${message?.tone === "error" ? "text-app-danger" : "text-app-forest"}`}>
          {busy === "upload" ? t("img.uploading") : busy === "remove" ? t("img.removing") : message?.text ?? ""}
        </p>
      </div>
    </div>
  );
}
