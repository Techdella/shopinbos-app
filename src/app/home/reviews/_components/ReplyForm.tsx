"use client";

import { useActionState, useState } from "react";
import { saveReviewReply, type ActionState } from "@/app/actions/reviews";
import { Notice, PillButton } from "@/components/app-ui";
import { field } from "@/components/seller-core";
import { Icon } from "@/components/ui/Icon";

export function ReplyForm({ reviewKey, initial, authorName, google }: { reviewKey: string; initial: string; authorName: string; google: "synced" | "local" | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveReviewReply, null);
  const [text, setText] = useState(initial);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState("");

  async function draft() {
    setDrafting(true);
    setDraftError("");
    try {
      const res = await fetch("/api/app/reviews/draft-reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: reviewKey }) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data?.reply) throw new Error(json?.error?.message ?? "Peggy couldn't draft a reply just now.");
      setText(json.data.reply);
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : "Peggy couldn't draft a reply just now.");
    } finally {
      setDrafting(false);
    }
  }

  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="key" value={reviewKey} />
      <label htmlFor="reply" className={field.label}>Your public reply to {authorName}</label>
      <textarea id="reply" name="reply" rows={5} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} className={field.textarea} placeholder="Thank them, answer what they asked, and keep it short." />
      {google === "synced" ? <p className={field.hint}>Saving posts the reply on Google too. Google shows it under the review on Search and Maps.</p> : null}
      {google === "local" ? <p className={field.hint}>Google isn&apos;t connected, so this reply is saved here only. Connect Google in Sources to post replies there.</p> : null}
      {state ? <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice> : null}
      {draftError ? <Notice>{draftError}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        <PillButton type="submit" size="md" tone="ink" busy={pending} disabled={!text.trim()}>{initial ? "Save reply" : "Post reply"}</PillButton>
        <PillButton size="md" tone="white" onClick={draft} busy={drafting}><Icon name="sparkle" size={15} /> Draft with Peggy</PillButton>
        {initial ? (
          <PillButton type="submit" name="intent" value="delete" size="md" tone="ghost" className="text-app-danger" onClick={() => setText("")} disabled={pending}>Delete reply</PillButton>
        ) : null}
      </div>
    </form>
  );
}
