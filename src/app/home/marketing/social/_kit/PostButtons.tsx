"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { buttonClass } from "@/components/growth/kit";
import { useT } from "@/components/i18n/I18nProvider";

// Small actions on a post in the lists and on its page: post a queued one now, try failed channels again.

export function PostActionButton({ postId, action, tone = "white" }: { postId: string; action: "now" | "retry"; tone?: "white" | "ink" }) {
  const t = useT("socialPosts");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/app/social-posts/${postId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }).catch(() => null);
    const json = await response?.json().catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setError(json?.error?.message ?? t("err.save"));
      return;
    }
    if (action === "now") router.push(`/home/marketing/social/${postId}`);
    router.refresh();
  }

  return (
    <span className="inline-grid gap-1">
      <button type="button" onClick={() => void run()} disabled={busy} className={buttonClass(tone, "sm")}>
        <Icon name={action === "now" ? "send" : "refresh"} size={14} className={busy && action === "retry" ? "animate-spin" : undefined} />
        {busy ? t("btn.saving") : action === "now" ? t("btn.now") : t("btn.retry")}
      </button>
      {error && <span role="alert" className="text-[12px] text-app-danger">{error}</span>}
    </span>
  );
}
