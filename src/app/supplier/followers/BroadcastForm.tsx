"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/app-kit";
import { useT } from "@/components/i18n/I18nProvider";
import { FIELD_INPUT, FIELD_TEXTAREA, SUBMIT_INK } from "@/components/seller-settings/fields";
import { sendBroadcastAction } from "@/app/actions/supplier-follow";

export function BroadcastForm({ disabled }: { disabled: boolean }) {
  const t = useT("supplier");
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function send(event: React.FormEvent) {
    event.preventDefault();
    start(async () => {
      const result = await sendBroadcastAction({ title, body });
      if (!result.ok) return setNote({ ok: false, text: result.error ?? "" });
      setTitle("");
      setBody("");
      setNote({ ok: true, text: t("fol.done", { count: result.recipients ?? 0 }) });
      router.refresh();
    });
  }

  return (
    <Card className="p-5">
      <form onSubmit={send} className="grid gap-3">
        <h2 className="m-0 text-[17px] font-extrabold">{t("fol.write")}</h2>
        <input aria-label={t("fol.titleLabel")} placeholder={t("fol.titleLabel")} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} required className={FIELD_INPUT} />
        <textarea aria-label={t("fol.bodyLabel")} placeholder={t("fol.bodyPlaceholder")} value={body} onChange={(event) => setBody(event.target.value)} maxLength={1000} rows={4} required className={FIELD_TEXTAREA} />
        <button type="submit" disabled={pending || disabled} className={`${SUBMIT_INK} justify-self-start`}>{t("fol.send")}</button>
        {note ? <p role={note.ok ? "status" : "alert"} className={`m-0 text-[13.5px] ${note.ok ? "text-app-success" : "text-app-danger"}`}>{note.text}</p> : null}
      </form>
    </Card>
  );
}
