"use client";

import Link from "next/link";
import { useState } from "react";
import { AssistantNote, Card, CardHead } from "@/components/app-kit";
import { Notice, PillButton, Segmented, Toggle } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { inboxApi } from "@/components/messaging/inbox-ui";

interface Settings {
  autoReplyEnabled: boolean;
  autoReplyMode: "message" | "peggy";
  awayMessage: string;
  forwardCallsTo: string;
}

const input = "h-11 w-full rounded-[14px] border border-app-line bg-white px-3 text-[15px] outline-none focus:border-app-ink";
const area = "w-full rounded-[14px] border border-app-line bg-white px-3 py-2.5 text-[15px] leading-[1.5] outline-none focus:border-app-ink";

export function InboxSettingsClient({ initial, canned, aiAvailable, voiceConnected }: { initial: Settings; canned: Array<{ id: string; title: string; body: string }>; aiAvailable: boolean; voiceConnected: boolean }) {
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
      setResult({ tone: "success", text: "Saved." });
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
        <Card className="grid gap-4 p-5">
          <CardHead title="Away auto-reply" sub="Sent once every 12 hours per conversation, only when your inbox hasn't been open for 5 minutes." />
          <div className="flex min-h-[52px] items-center justify-between gap-3 rounded-[14px] bg-app-canvas px-4">
            <span className="text-[14px] font-semibold">Reply automatically while I'm away</span>
            <Toggle on={settings.autoReplyEnabled} onChange={(on) => setSettings((s) => ({ ...s, autoReplyEnabled: on }))} label="Away auto-reply" />
          </div>
          {settings.autoReplyEnabled && (
            <>
              <Segmented
                options={[{ value: "message", label: "My message" }, { value: "peggy", label: "Peggy answers" }]}
                value={settings.autoReplyMode}
                onChange={(mode) => setSettings((s) => ({ ...s, autoReplyMode: mode }))}
              />
              {settings.autoReplyMode === "peggy" ? (
                <AssistantNote>
                  {aiAvailable
                    ? "Peggy answers from your products, prices and store details, says you'll follow up, and never makes up stock, prices or delivery times. If she can't answer, your away message below is sent instead."
                    : "Peggy needs an AI key on the server (ANTHROPIC_API_KEY or OPENAI_API_KEY). Until then your away message is sent."}
                </AssistantNote>
              ) : null}
              <label className="grid gap-1 text-[13.5px] font-bold">
                Away message
                <textarea rows={3} maxLength={600} value={settings.awayMessage} onChange={(e) => setSettings((s) => ({ ...s, awayMessage: e.target.value }))} placeholder="Thanks for your message! We're away right now and will reply as soon as we're back." className={area} />
              </label>
            </>
          )}
        </Card>

        <Card className="grid gap-4 p-5">
          <CardHead title="Calls" sub={voiceConnected ? "Calls to your Twilio number ring this phone first, then go to voicemail." : "Connect Phone calls to log calls and take voicemails in your inbox."} />
          {voiceConnected ? (
            <label className="grid gap-1 text-[13.5px] font-bold">
              Ring my phone
              <input type="tel" value={settings.forwardCallsTo} onChange={(e) => setSettings((s) => ({ ...s, forwardCallsTo: e.target.value }))} placeholder="+2348012345678 (empty = straight to voicemail)" className={input} />
            </label>
          ) : (
            <div><Link href="/home/inbox/channels" className="inline-flex min-h-[44px] items-center rounded-full border border-app-line px-5 text-[14px] font-bold text-app-ink no-underline">Connect phone calls</Link></div>
          )}
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <PillButton size="md" busy={saving} onClick={() => void save()}>Save settings</PillButton>
        </div>
        {result && <Notice tone={result.tone}>{result.text}</Notice>}
      </div>

      <Card className="grid content-start gap-4 p-5">
        <CardHead title="Saved replies" sub="Answers you send often, one tap away in the reply box." />
        {replies.length === 0 ? (
          <p className="m-0 text-[14px] text-app-ink-soft">No saved replies yet. Add your delivery times, payment details or return policy.</p>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {replies.map((reply) => (
              <li key={reply.id} className="flex items-start gap-3 rounded-[14px] border border-app-line px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-extrabold">{reply.title}</div>
                  <p className="m-0 mt-0.5 whitespace-pre-wrap text-[13.5px] text-app-ink-soft">{reply.body}</p>
                </div>
                <button type="button" onClick={() => void removeReply(reply.id)} aria-label={`Delete ${reply.title}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-app-canvas"><Icon name="trash" size={16} /></button>
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
          <label className="grid gap-1 text-[13.5px] font-bold">Name<input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} maxLength={60} placeholder="Delivery times" className={input} /></label>
          <label className="grid gap-1 text-[13.5px] font-bold">Reply<textarea rows={3} maxLength={2000} value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} placeholder="We deliver in Lagos within 1-2 days and outside Lagos in 3-5 days." className={area} /></label>
          {replyError && <Notice tone="error">{replyError}</Notice>}
          <div><PillButton type="submit" size="md" tone="white" busy={adding} disabled={!draft.title.trim() || !draft.body.trim()}><Icon name="plus" size={15} /> Add saved reply</PillButton></div>
        </form>
      </Card>
    </div>
  );
}
