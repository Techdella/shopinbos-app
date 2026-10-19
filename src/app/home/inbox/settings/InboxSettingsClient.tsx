"use client";

import { WEB_CALLS_ENABLED } from "@/lib/features";
import Link from "next/link";
import { useState } from "react";
import { Card, CardHead } from "@/components/app-kit";
import { Notice, PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { inboxApi } from "@/components/messaging/inbox-ui";
import { useT } from "@/components/i18n/I18nProvider";

interface Settings {
  autoReplyEnabled: boolean;
  autoReplyMode: "message" | "peggy";
  awayMessage: string;
  forwardCallsTo: string;
}

const input = "h-11 w-full rounded-[14px] border border-app-line bg-white px-3 text-[15px] outline-none focus:border-app-ink";
const area = "w-full rounded-[14px] border border-app-line bg-white px-3 py-2.5 text-[15px] leading-[1.5] outline-none focus:border-app-ink";

export function InboxSettingsClient({ initial, canned, aiAvailable, voiceConnected }: { initial: Settings; canned: Array<{ id: string; title: string; body: string }>; aiAvailable: boolean; voiceConnected: boolean }) {
  const t = useT("inbox");
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [replies, setReplies] = useState(canned);
  const [draft, setDraft] = useState({ title: "", body: "" });
  const [replyError, setReplyError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function save() {
    setSaving(true);
    setResult(null);
    try {
      const saved = await inboxApi<Settings>("/api/app/inbox/settings", { method: "PUT", body: JSON.stringify(settings) });
      setSettings(saved);
      setResult({ tone: "success", text: t("set.saved") });
    } catch (error) {
      setResult({ tone: "error", text: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function addReply() {
    setAdding(true);
    setReplyError(null);
    try {
      const reply = await inboxApi<{ id: string; title: string; body: string }>("/api/app/inbox/canned", { method: "POST", body: JSON.stringify(draft) });
      setReplies((current) => [...current, reply].sort((a, b) => a.title.localeCompare(b.title)));
      setDraft({ title: "", body: "" });
    } catch (error) {
      setReplyError((error as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function removeReply(id: string) {
    try {
      await inboxApi(`/api/app/inbox/canned/${id}`, { method: "DELETE" });
      setReplies((current) => current.filter((r) => r.id !== id));
    } catch (error) {
      setReplyError((error as Error).message);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="grid content-start gap-5">
        <Card className="grid gap-3 p-5">
          <CardHead title={t("set.auto")} sub={t("set.autoSub")} />
          {[
            { href: "/home/inbox/auto-replies", icon: "clock" as const, title: t("autoReplies"), sub: settings.autoReplyEnabled ? t("set.arOn", { mode: settings.autoReplyMode === "peggy" ? t("ar.peggyAnswers") : t("set.awayLower") }) : t("set.arOff") },
            { href: "/home/inbox/chatbot", icon: "sparkle" as const, title: t("chatbot"), sub: aiAvailable ? t("set.botOn") : t("set.botNoKey") },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="flex min-h-[60px] items-center gap-3 rounded-[14px] bg-app-canvas px-4 py-2.5 text-app-ink no-underline hover:bg-app-peach">
              <Icon name={item.icon} size={18} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-extrabold">{item.title}</span>
                <span className="block text-[12.5px] text-app-ink-soft">{item.sub}</span>
              </span>
              <Icon name="chevRight" size={16} className="shrink-0 text-app-ink-soft" />
            </Link>
          ))}
        </Card>

        {WEB_CALLS_ENABLED && (
        <Card className="grid gap-4 p-5">
          <CardHead title={t("set.calls")} sub={voiceConnected ? t("set.callsOn") : t("set.callsOff")} />
          {voiceConnected ? (
            <label className="grid gap-1 text-[13.5px] font-bold">
              {t("set.ringPhone")}
              <input type="tel" value={settings.forwardCallsTo} onChange={(e) => setSettings((s) => ({ ...s, forwardCallsTo: e.target.value }))} placeholder={t("set.ringPlaceholder")} className={input} />
            </label>
          ) : (
            <div><Link href="/home/inbox/channels" className="inline-flex min-h-[44px] items-center rounded-full border border-app-line px-5 text-[14px] font-bold text-app-ink no-underline">{t("set.connectCalls")}</Link></div>
          )}
        </Card>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <PillButton size="md" busy={saving} onClick={() => void save()}>{t("set.save")}</PillButton>
        </div>
        {result && <Notice tone={result.tone}>{result.text}</Notice>}
      </div>

      <Card className="grid content-start gap-4 p-5">
        <CardHead title={t("thread.saved")} sub={t("set.savedSub")} />
        {replies.length === 0 ? (
          <p className="m-0 text-[14px] text-app-ink-soft">{t("set.noSaved")}</p>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {replies.map((reply) => (
              <li key={reply.id} className="flex items-start gap-3 rounded-[14px] border border-app-line px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-extrabold">{reply.title}</div>
                  <p className="m-0 mt-0.5 whitespace-pre-wrap text-[13.5px] text-app-ink-soft">{reply.body}</p>
                </div>
                <button type="button" onClick={() => void removeReply(reply.id)} aria-label={t("set.deleteReply", { title: reply.title })} className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-app-canvas"><Icon name="trash" size={16} /></button>
              </li>
            ))}
          </ul>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void addReply();
          }}
          className="grid gap-2 border-t border-app-line pt-4"
        >
          <label className="grid gap-1 text-[13.5px] font-bold">{t("set.name")}<input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} maxLength={60} placeholder={t("set.namePlaceholder")} className={input} /></label>
          <label className="grid gap-1 text-[13.5px] font-bold">{t("set.reply")}<textarea rows={3} maxLength={2000} value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} placeholder={t("set.replyPlaceholder")} className={area} /></label>
          {replyError && <Notice tone="error">{replyError}</Notice>}
          <div><PillButton type="submit" size="md" tone="white" busy={adding} disabled={!draft.title.trim() || !draft.body.trim()}><Icon name="plus" size={15} /> {t("set.add")}</PillButton></div>
        </form>
      </Card>
    </div>
  );
}
