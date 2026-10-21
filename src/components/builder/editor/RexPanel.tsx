"use client";

import { useEffect, useRef, useState } from "react";
import { cx, Mascot } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { applyEditorPatchOps, type StoreEditorPatchOp, type StoreEditorSnapshot } from "@/lib/store-templates";
import { changedSectionOps, headerMenuStyle, withMenuDesign, type MenuDesign } from "@/lib/storefront/menu-design";
import { readNavigation } from "@/lib/storefront/store-navigation";
import { isBoutiqueTheme } from "@/lib/store-templates/boutique-themes";
import { PanelHeading } from "./ui";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { useEditorT } from "./i18n";

interface Message {
  role: "rex" | "you";
  text: string;
}

/** What Rex is working on: the page and its sections, or the store's menus. */
export type RexTopic = "page" | "menu";

/** A change Rex made that's only on screen so far: applying it takes credits and saves it to the draft. */
interface Pending {
  kind: "menu" | "edit";
  ops: StoreEditorPatchOp[];
  cost: number | null;
}

export interface RexPanelProps {
  storeName: string;
  pageType: string;
  selectedSectionId: string | null;
  selectedName: string | null;
  /** The builder's draft, to preview Rex's change on. */
  draft: StoreEditorSnapshot | null;
  topic: RexTopic;
  onTopic: (topic: RexTopic) => void;
  /** Shows Rex's change on the canvas (null: back to the draft). Nothing is saved. */
  onPreview: (snapshot: StoreEditorSnapshot | null, name: string) => void;
  /** Whether the canvas is still showing Rex's preview (the seller can stop it from the bar). */
  previewing: boolean;
  applyOps: (ops: StoreEditorPatchOp[]) => Promise<void>;
  onApplied: () => void;
  onClose: () => void;
  /** The seller, for their messages. */
  you?: { name: string; avatarUrl: string | null } | null;
}

const PAGE_SUGGESTIONS = ["Write a shorter banner heading", "Make the colours warmer", "Add a questions section"];
const MENU_SUGGESTIONS = ["Make a mega menu with pictures", "Simple menu: Shop, Blog, About, Contact", "Put my categories under Shop", "Pill style menu, bottom sheet on phones"];

/** Rex inside the builder. Rex's changes show on the page as a free preview; applying one costs credits. */
export function RexPanel(props: RexPanelProps) {
  const { t, tx } = useEditorT();
  const greeting = (topic: RexTopic) =>
    topic === "menu"
      ? tx("Tell me how your menu should work: a mega menu with pictures, dropdowns for your categories, a different style on phones. I'll show it on the page first; you only pay credits when you apply it.")
      : tx("Tell me what to change on this page, or something new to make. I'll show it on the page first; you only pay credits when you apply it.");
  const [messages, setMessages] = useState<Message[]>(() => [{ role: "rex", text: greeting(props.topic) }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [applying, setApplying] = useState(false);
  const [buyUrl, setBuyUrl] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastDesign = useRef<MenuDesign | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, busy, pending]);

  // "Stop preview" on the canvas bar throws the change away.
  useEffect(() => {
    if (!props.previewing && pending && !applying) setPending(null);
  }, [props.previewing, pending, applying]);

  function switchTopic(topic: RexTopic) {
    if (topic === props.topic) return;
    discard();
    props.onTopic(topic);
    setMessages((current) => [...current, { role: "rex", text: greeting(topic) }]);
  }

  function discard() {
    setPending(null);
    lastDesign.current = null;
    props.onPreview(null, "");
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setBuyUrl(null);
    const history = [...messages, { role: "you" as const, text: message }];
    setMessages(history);
    setBusy(true);
    try {
      if (props.topic === "menu") await designMenu(history);
      else await editPage(message);
    } catch (error) {
      const words = error instanceof Error && error.message && !/fetch|network/i.test(error.message) ? error.message : tx("I couldn't connect just now. Please try again.");
      setMessages((current) => [...current, { role: "rex", text: words }]);
    } finally {
      setBusy(false);
    }
  }

  async function designMenu(history: Message[]) {
    const draft = props.draft;
    if (!draft) throw new Error(tx("Your store is still loading. Try again in a moment."));
    const nav = readNavigation(draft, { boutique: isBoutiqueTheme(draft.templateId) });
    const shown = lastDesign.current;
    const response = await fetch("/api/ai/store-editor/menu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: history.slice(1).slice(-12).map((entry) => ({ role: entry.role === "you" ? "user" : "rex", text: entry.text })),
        current: shown
          ? { main: shown.main, footer: shown.footer ?? nav.footer, menuStyle: shown.menuStyle, mobileStyle: shown.mobileStyle }
          : { main: nav.main, footer: nav.footer, menuStyle: headerMenuStyle(draft, isBoutiqueTheme(draft.templateId) ? "classic" : "caps"), mobileStyle: nav.mobileStyle },
      }),
    });
    const json = (await response.json().catch(() => null)) as { data?: { design: MenuDesign; reply: string; applyCost: number }; error?: { message?: string } } | null;
    if (!response.ok || !json?.data) throw new Error(json?.error?.message ?? tx("Rex couldn't design that. Nothing was changed; try again."));
    const preview = withMenuDesign(draft, json.data.design, nav);
    lastDesign.current = json.data.design;
    setPending({ kind: "menu", ops: changedSectionOps(draft, preview), cost: json.data.applyCost });
    props.onPreview(preview, tx("Rex's menu"));
    setMessages((current) => [...current, { role: "rex", text: json.data!.reply }]);
  }

  async function editPage(message: string) {
    const response = await fetch("/api/ai/store-editor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: message }],
        context: { storeName: props.storeName, page: props.pageType, selectedSection: props.selectedSectionId },
      }),
    });
    const json = (await response.json().catch(() => null)) as { data?: { ops?: unknown[]; reply?: string; applyCost?: number; aiOff?: boolean }; reply?: string; error?: { message?: string } } | null;
    if (!response.ok) throw new Error(json?.error?.message ?? tx("Rex couldn't make that change. Nothing was changed; try again."));
    const ops = Array.isArray(json?.data?.ops) ? (json!.data!.ops as StoreEditorPatchOp[]) : [];
    let reply = json?.data?.reply ?? json?.reply ?? "";
    if (ops.length && props.draft) {
      props.onPreview(applyEditorPatchOps(props.draft, ops), tx("Rex's change"));
      // With AI off the change is a stock section matched from keywords: nothing to charge for.
      setPending({ kind: "edit", ops, cost: json?.data?.aiOff ? 0 : json?.data?.applyCost ?? null });
      reply = reply || tx("Here it is on the page.");
    } else if (!reply) {
      reply = tx("I couldn't find anything to change for that. Try naming the section and what to change.");
    }
    setMessages((current) => [...current, { role: "rex", text: reply }]);
  }

  async function apply() {
    if (!pending || applying) return;
    setApplying(true);
    setBuyUrl(null);
    try {
      const response = pending.cost === 0 ? null : await fetch("/api/ai/store-editor/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: pending.kind }) });
      const json = response ? ((await response.json().catch(() => null)) as { error?: { code?: string; message?: string; buyUrl?: string } } | null) : null;
      if (response && !response.ok) {
        if (json?.error?.buyUrl) setBuyUrl(json.error.buyUrl);
        throw new Error(json?.error?.message ?? tx("Rex's change couldn't be applied."));
      }
      if (pending.ops.length) await props.applyOps(pending.ops);
      setPending(null);
      lastDesign.current = null;
      props.onPreview(null, "");
      props.onApplied();
      setMessages((current) => [...current, { role: "rex", text: tx("Applied. It's in your draft now: publish when you're ready for shoppers to see it.") }]);
    } catch (error) {
      setMessages((current) => [...current, { role: "rex", text: error instanceof Error ? error.message : tx("Rex's change couldn't be applied.") }]);
    } finally {
      setApplying(false);
    }
  }

  const suggestions = props.topic === "menu" ? MENU_SUGGESTIONS : PAGE_SUGGESTIONS;
  const initial = (props.you?.name.trim().charAt(0) || "Y").toUpperCase();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeading
        title={<span className="flex items-center gap-2"><Mascot name="rex" className="h-7 w-7" alt="" /> {tx("Ask Rex")}</span>}
        sub={props.topic === "menu" ? tx("Working on your menus") : props.selectedName ? t("edk.workingOn", { name: tx(props.selectedName) }) : tx("Working on this page")}
        onClose={props.onClose}
      />
      <div className="flex gap-1 px-4 pb-2" role="tablist" aria-label={tx("What Rex works on")}>
        {(["page", "menu"] as const).map((topic) => (
          <button key={topic} type="button" role="tab" aria-selected={props.topic === topic} onClick={() => switchTopic(topic)} className={cx("min-h-8 rounded-full px-3 text-[12.5px] font-semibold", props.topic === topic ? "bg-app-ink text-white" : "border border-app-line text-app-ink")}>
            {topic === "page" ? tx("This page") : tx("Menus")}
          </button>
        ))}
      </div>
      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-3" aria-live="polite">
        {messages.map((message, index) =>
          message.role === "rex" ? (
            <div key={index} className="max-w-[88%] rounded-[16px] bg-app-peach px-3 py-2 text-[13.5px] leading-5 text-app-ink">{message.text}</div>
          ) : (
            <div key={index} className="flex items-end justify-end gap-2">
              <div className="max-w-[80%] rounded-[16px] bg-app-ink px-3 py-2 text-[13.5px] leading-5 text-white">{message.text}</div>
              {props.you?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={props.you.avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
              ) : (
                <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-app-lilac text-[12px] font-bold text-app-ink">{initial}</span>
              )}
            </div>
          ),
        )}
        {busy ? <div className="w-fit rounded-[16px] bg-app-peach px-3 py-2 text-[13.5px] text-app-ink-soft">{tx("Rex is working…")}</div> : null}
        {pending ? (
          <div className="grid gap-2 rounded-[16px] border border-app-ink/15 bg-white p-3 text-[13px]">
            <p className="m-0 font-semibold text-app-ink">{tx("This is a preview. Shoppers see nothing yet.")}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void apply()} disabled={applying} className="min-h-10 rounded-full bg-app-ink px-4 font-semibold text-white disabled:opacity-60">
                {applying ? tx("Applying…") : pending.cost ? t("edk.rexApplyFor", { count: pending.cost }) : tx("Apply")}
              </button>
              <button type="button" onClick={discard} disabled={applying} className="min-h-10 rounded-full border border-app-line px-4 font-semibold text-app-ink">{tx("Discard")}</button>
            </div>
            {buyUrl ? <a href={buyUrl} className="font-semibold text-app-ink underline">{tx("Get more credits")}</a> : null}
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5 px-4 pb-2">
        {suggestions.map((suggestion) => (
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
          placeholder={props.topic === "menu" ? tx("Describe the menu you want") : tx("Ask Rex to change something")}
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
