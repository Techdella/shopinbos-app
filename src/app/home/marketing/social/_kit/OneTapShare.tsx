"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { buttonClass } from "@/components/growth/kit";
import { useT } from "@/components/i18n/I18nProvider";
import type { PostChannel } from "@/lib/social-posts/pure";
import { ChannelBadge } from "./ChannelBadge";

/** Where to post when the phone can't hand the picture to the app (computers): the app's own upload page. */
const APP_HOME: Partial<Record<PostChannel, string>> = { tiktok: "https://www.tiktok.com/upload", instagram: "https://www.instagram.com/" };

async function mediaFile(url: string, name: string) {
  const response = await fetch(url);
  if (!response.ok) return null;
  const blob = await response.blob();
  const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  return new File([blob], `${name}.${ext}`, { type: blob.type });
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * One tap for the channels we can't post to for the seller (WhatsApp Status, TikTok, X): copies the caption, hands
 * the picture to the phone's share sheet (pick the app, paste), or on a computer downloads it and opens the app.
 * Marked as posted when the share sheet finishes, or with "I've posted it".
 */
export function OneTapShare({ postId, channel, label, text, intentUrl, mediaUrl, done }: { postId: string; channel: PostChannel; label: string; text: string; intentUrl: string | null; mediaUrl: string | null; done: boolean }) {
  const t = useT("socialPosts", "common");
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "opened" | "done">(done ? "done" : "idle");
  const [note, setNote] = useState<string | null>(null);

  async function markShared() {
    setState("busy");
    const response = await fetch(`/api/app/social-posts/${postId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "shared", channel }) }).catch(() => null);
    setState(response?.ok ? "done" : "opened");
    if (response?.ok) router.refresh();
  }

  async function share() {
    setState("busy");
    setNote(null);
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    try {
      const file = mediaUrl ? await mediaFile(mediaUrl, `post-${postId.slice(-6)}`) : null;
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
        await markShared();
        return;
      }
      if (!file && typeof navigator.share === "function" && channel !== "x") {
        await navigator.share({ text });
        await markShared();
        return;
      }
      if (file) download(file);
      const target = intentUrl ?? APP_HOME[channel];
      if (target) window.open(target, "_blank", "noopener,noreferrer");
      setNote(file ? t("share.copiedSaved") : t("share.copied"));
      setState("opened");
    } catch {
      // Closed the share sheet: the caption is still copied.
      setNote(t("share.copied"));
      setState("opened");
    }
  }

  if (state === "done") {
    return (
      <span className="inline-flex min-h-[40px] items-center gap-2 text-[13.5px] font-bold text-app-success">
        <ChannelBadge channel={channel} size={20} />
        {t("share.done", { channel: label })}
        <Icon name="check" size={14} />
      </span>
    );
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void share()} disabled={state === "busy"} className={buttonClass("ink", "sm")}>
          <ChannelBadge channel={channel} size={20} />
          {t("share.button", { channel: label })}
        </button>
        {state === "opened" && (
          <button type="button" onClick={() => void markShared()} className={buttonClass("white", "sm")}>
            <Icon name="check" size={14} />
            {t("share.mark")}
          </button>
        )}
      </div>
      {note && <p role="status" className="m-0 text-[12.5px] text-app-ink-soft">{note}</p>}
    </div>
  );
}
