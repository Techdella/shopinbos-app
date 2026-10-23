"use client";

import { useActionState, useState } from "react";
import { saveReviewReply, type ActionState } from "@/app/actions/reviews";
import { Notice, PillButton } from "@/components/app-ui";
import { field } from "@/components/seller-core";
import { Icon } from "@/components/ui/Icon";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { useT } from "@/components/i18n/I18nProvider";
import { friendlyError } from "@/lib/errors/report-client";

export function ReplyForm({ reviewKey, initial, authorName, google }: { reviewKey: string; initial: string; authorName: string; google: "synced" | "local" | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveReviewReply, null);
  const t = useT("reviews");
  const [text, setText] = useState(initial);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState("");

  async function draft() {
    setDrafting(true);
    setDraftError("");
    try {
      const res = await fetch("/api/app/reviews/draft-reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: reviewKey }) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data?.reply) throw new Error(json?.error?.message ?? t("reply.failed"));
      setText(json.data.reply);
    } catch (error) {
      setDraftError(error instanceof Error ? friendlyError(error) : t("reply.failed"));
    } finally {
      setDrafting(false);
    }
  }

  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="key" value={reviewKey} />
      <label htmlFor="reply" className={field.label}>{t("reply.label", { name: authorName })}</label>
      <textarea id="reply" name="reply" rows={5} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} className={field.textarea} placeholder={t("reply.placeholder")} />
      <VoiceInputButton value={text} onChange={setText} maxLength={4000} context="a reply to a customer review" className="mt-2" />
      {google === "synced" ? <p className={field.hint}>{t("reply.googleSynced")}</p> : null}
      {google === "local" ? <p className={field.hint}>{t("reply.googleLocal")}</p> : null}
      {state ? <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice> : null}
      {draftError ? <Notice>{draftError}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        <PillButton type="submit" size="md" tone="ink" busy={pending} disabled={!text.trim()}>{initial ? t("reply.save") : t("reply.post")}</PillButton>
        <PillButton size="md" tone="white" onClick={draft} busy={drafting}><Icon name="sparkle" size={15} /> {t("reply.draft")}</PillButton>
        {initial ? (
          <PillButton type="submit" name="intent" value="delete" size="md" tone="ghost" className="text-app-danger" onClick={() => setText("")} disabled={pending}>{t("reply.delete")}</PillButton>
        ) : null}
      </div>
    </form>
  );
}
