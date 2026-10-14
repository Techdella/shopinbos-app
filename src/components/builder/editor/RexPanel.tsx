"use client";

import { useEffect, useRef, useState } from "react";
import { cx, Mascot } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import type { StoreEditorPatchOp } from "@/lib/store-templates";
import { PanelHeading } from "./ui";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { useEditorT } from "./i18n";

interface Message {
  role: "rex" | "you";
  text: string;
}

export interface RexPanelProps {
  storeName: string;
  pageType: string;
  selectedSectionId: string | null;
  selectedName: string | null;
  applyOps: (ops: StoreEditorPatchOp[]) => Promise<void>;
  onApplied: () => void;
  onClose: () => void;
}

const SUGGESTIONS = ["Write a shorter banner heading", "Make the colours warmer", "Add a questions section"];

/** Rex inside the builder: asks /api/ai/store-editor for edit operations and applies them to the draft. */
export function RexPanel(props: RexPanelProps) {
  const { t, tx } = useEditorT();
  const [messages, setMessages] = useState<Message[]>(() => [
    { role: "rex", text: tx("Tell me what to change on this page and I'll do it. You can undo anything I change.") },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, busy]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setMessages((current) => [...current, { role: "you", text: message }]);
    setBusy(true);
    try {
      const response = await fetch("/api/ai/store-editor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: message }],
          context: { storeName: props.storeName, page: props.pageType, selectedSection: props.selectedSectionId },
        }),
      });
      const json = await response.json().catch(() => null) as { data?: { ops?: unknown[]; reply?: string }; reply?: string; error?: { message?: string } } | null;
      if (!response.ok) throw new Error(json?.error?.message ?? tx("Rex couldn't make that change. Nothing was changed; try again."));
      const ops = Array.isArray(json?.data?.ops) ? (json!.data!.ops as StoreEditorPatchOp[]) : [];
      let reply = json?.data?.reply ?? json?.reply ?? "";
      if (ops.length) {
        await props.applyOps(ops);
        props.onApplied();
        reply = reply || tx("Done. Have a look on the page.");
      } else if (!reply) {
        reply = tx("I couldn't find anything to change for that. Try naming the section and what to change.");
      }
      setMessages((current) => [...current, { role: "rex", text: reply }]);
    } catch (error) {
      const text = error instanceof Error && error.message && !/fetch|network/i.test(error.message)
        ? error.message
        : tx("I couldn't connect just now. Please try again.");
      setMessages((current) => [...current, { role: "rex", text }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeading
        title={<span className="flex items-center gap-2"><Mascot name="rex" className="h-7 w-7" alt="" /> {tx("Ask Rex")}</span>}
        sub={props.selectedName ? t("edk.workingOn", { name: tx(props.selectedName) }) : tx("Working on this page")}
        onClose={props.onClose}
      />
      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-3" aria-live="polite">
        {messages.map((message, index) => (
          <div key={index} className={cx("max-w-[88%] rounded-[16px] px-3 py-2 text-[13.5px] leading-5", message.role === "rex" ? "bg-app-peach text-app-ink" : "ml-auto bg-app-ink text-white")}>
            {message.text}
          </div>
        ))}
        {busy ? <div className="w-fit rounded-[16px] bg-app-peach px-3 py-2 text-[13.5px] text-app-ink-soft">{tx("Rex is working…")}</div> : null}
      </div>
      <div className="flex flex-wrap gap-1.5 px-4 pb-2">
        {SUGGESTIONS.map((suggestion) => (
          <button key={suggestion} type="button" onClick={() => setInput(tx(suggestion))} className="min-h-8 rounded-full border border-app-line px-3 text-[12.5px] font-medium text-app-ink hover:border-app-line-strong">{tx(suggestion)}</button>
        ))}
      </div>
      <form className="flex items-end gap-2 border-t border-app-line p-3" onSubmit={(event) => { event.preventDefault(); void send(input); }}>
        <label className="sr-only" htmlFor="rex-builder-input">{tx("Message Rex")}</label>
        <textarea
          id="rex-builder-input"
          rows={2}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(input); } }}
          placeholder={tx("Ask Rex to change something")}
          className="min-h-11 w-full min-w-0 flex-1 resize-none rounded-[14px] border border-app-line px-3 py-2 text-[13.5px] outline-none focus:border-[#2F66F6]"
        />
        <VoiceInputButton variant="icon" value={input} onChange={setInput} context="a change for Rex to make" disabled={busy} />
        <button type="submit" disabled={busy || !input.trim()} aria-label={tx("Send")} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-app-ink text-white disabled:opacity-40">
          <Icon name="send" size={16} />
        </button>
      </form>
      <a href="/studio" className="flex min-h-11 items-center justify-center gap-1 border-t border-app-line text-[13px] font-semibold text-app-ink hover:bg-app-canvas">
        {tx("Open Rex Studio")} <Icon name="chevRight" size={14} />
      </a>
    </div>
  );
}
