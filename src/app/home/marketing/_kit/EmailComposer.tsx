"use client";

import { useRef, useState } from "react";
import { Segmented } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { buttonClass, inputClass, selectClass, textareaClass } from "@/components/growth/kit";
import { blocksToHtml, htmlFromBlocks, readBlocks, type EmailBlock } from "@/lib/marketing/blocks";
import { VariableChips, insertAtCursor } from "./client";

// Email content editor: a visual writer (heading, text, button, image, divider blocks) that produces clean
// email HTML, or raw HTML for people who paste their own. Used by campaigns, templates and automations.

const STARTER: EmailBlock[] = [
  { type: "heading", text: "Hello from {{store}}" },
  { type: "text", text: "Hi {{name}},\n\nWrite your message here." },
  { type: "button", label: "Visit the shop", url: "{{store_url}}" },
];

const LINKS = [
  ["{{store_url}}", "Your shop"],
  ["{{cart_url}}", "Their saved cart"],
] as const;

const ADD: Array<[EmailBlock["type"], string]> = [
  ["heading", "Heading"],
  ["text", "Text"],
  ["button", "Button"],
  ["image", "Image"],
  ["divider", "Line"],
];

function blank(type: EmailBlock["type"]): EmailBlock {
  switch (type) {
    case "heading":
      return { type, text: "" };
    case "text":
      return { type, text: "" };
    case "button":
      return { type, label: "Shop now", url: "{{store_url}}" };
    case "image":
      return { type, url: "", alt: "" };
    case "divider":
      return { type };
  }
}

export function EmailComposer({ value, onChange, variables }: { value: string; onChange: (html: string) => void; variables?: string[] }) {
  const initial = readBlocks(value);
  const [mode, setMode] = useState<"visual" | "html">(initial || !value.trim() ? "visual" : "html");
  const [blocks, setBlocks] = useState<EmailBlock[]>(initial ?? (value.trim() ? [] : STARTER));
  const focused = useRef<{ index: number; field: "text" | "label"; el: HTMLTextAreaElement | HTMLInputElement } | null>(null);
  const htmlRef = useRef<HTMLTextAreaElement>(null);

  function commit(next: EmailBlock[]) {
    setBlocks(next);
    onChange(htmlFromBlocks(next));
  }

  function update(index: number, patch: Partial<EmailBlock>) {
    commit(blocks.map((block, i) => (i === index ? ({ ...block, ...patch } as EmailBlock) : block)));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  }

  function insertVariable(token: string) {
    if (mode === "html") {
      onChange(insertAtCursor(htmlRef.current, value, token));
      return;
    }
    const target = focused.current;
    if (!target || !blocks[target.index]) {
      const last = blocks.findLastIndex((block) => block.type === "text");
      if (last >= 0) update(last, { text: `${(blocks[last] as { text: string }).text}${token}` });
      return;
    }
    const block = blocks[target.index];
    const current = target.field === "label" && block.type === "button" ? block.label : "text" in block ? block.text : "";
    const next = insertAtCursor(target.el, current, token);
    update(target.index, target.field === "label" ? { label: next } : { text: next });
  }

  function switchMode(next: "visual" | "html") {
    if (next === mode) return;
    if (next === "html") {
      onChange(blocksToHtml(blocks));
      setMode("html");
      return;
    }
    const parsed = readBlocks(value);
    if (parsed) {
      setBlocks(parsed);
      setMode("visual");
      return;
    }
    if (value.trim() && !window.confirm("The visual editor can't open hand-written HTML. Start over with a fresh layout?")) return;
    commit(STARTER);
    setMode("visual");
  }

  const track = (index: number, field: "text" | "label") => (event: React.FocusEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    focused.current = { index, field, el: event.currentTarget };
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented options={[{ value: "visual", label: "Write" }, { value: "html", label: "HTML" }]} value={mode} onChange={switchMode} />
        <span className="text-[12.5px] text-app-ink-soft">Tap a detail to add it where you're typing</span>
      </div>
      <VariableChips onInsert={insertVariable} only={variables} />

      {mode === "html" ? (
        <textarea
          ref={htmlRef}
          aria-label="Email HTML"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={16}
          className={`${textareaClass} font-mono text-[13px] leading-[1.6]`}
          placeholder={'<h1>Hi {{name}}</h1>\n<p>Your message</p>'}
        />
      ) : (
        <ol className="m-0 grid list-none gap-2.5 p-0">
          {blocks.map((block, index) => (
            <li key={index} className="rounded-[16px] border border-app-line bg-white p-3">
              <div className="mb-2 flex items-center gap-1">
                <span className="mr-auto text-[12.5px] font-bold text-app-ink-soft">{ADD.find(([type]) => type === block.type)?.[1]}</span>
                <button type="button" aria-label="Move up" onClick={() => move(index, -1)} disabled={index === 0} className="grid h-9 w-9 place-items-center rounded-full hover:bg-app-canvas disabled:opacity-30">
                  <Icon name="arrowUp" size={15} />
                </button>
                <button type="button" aria-label="Move down" onClick={() => move(index, 1)} disabled={index === blocks.length - 1} className="grid h-9 w-9 place-items-center rounded-full hover:bg-app-canvas disabled:opacity-30">
                  <Icon name="arrowDown" size={15} />
                </button>
                <button type="button" aria-label="Remove block" onClick={() => commit(blocks.filter((_, i) => i !== index))} className="grid h-9 w-9 place-items-center rounded-full text-app-danger hover:bg-app-danger-tint">
                  <Icon name="trash" size={15} />
                </button>
              </div>
              {block.type === "heading" ? (
                <input aria-label="Heading" value={block.text} onFocus={track(index, "text")} onChange={(event) => update(index, { text: event.target.value })} className={`${inputClass} text-[17px] font-bold`} placeholder="A short headline" />
              ) : block.type === "text" ? (
                <textarea
                  aria-label="Text"
                  value={block.text}
                  onFocus={track(index, "text")}
                  onChange={(event) => update(index, { text: event.target.value })}
                  rows={Math.min(10, Math.max(3, block.text.split("\n").length + 1))}
                  className={textareaClass}
                  placeholder="Write here. A blank line starts a new paragraph; **word** makes it bold."
                />
              ) : block.type === "button" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input aria-label="Button text" value={block.label} onFocus={track(index, "label")} onChange={(event) => update(index, { label: event.target.value })} className={inputClass} placeholder="Button text" />
                  <div className="grid gap-2">
                    <select
                      aria-label="Button goes to"
                      value={LINKS.some(([url]) => url === block.url) ? block.url : "custom"}
                      onChange={(event) => update(index, { url: event.target.value === "custom" ? "https://" : event.target.value })}
                      className={selectClass}
                    >
                      {LINKS.map(([url, label]) => <option key={url} value={url}>{label}</option>)}
                      <option value="custom">Another link</option>
                    </select>
                    {!LINKS.some(([url]) => url === block.url) ? (
                      <input aria-label="Button link" value={block.url} onChange={(event) => update(index, { url: event.target.value })} className={inputClass} placeholder="https://" inputMode="url" />
                    ) : null}
                  </div>
                </div>
              ) : block.type === "image" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input aria-label="Image link (https)" value={block.url} onChange={(event) => update(index, { url: event.target.value })} className={inputClass} placeholder="https://… image link" inputMode="url" />
                  <input aria-label="Describe the image" value={block.alt} onChange={(event) => update(index, { alt: event.target.value })} className={inputClass} placeholder="Describe the image" />
                </div>
              ) : (
                <hr className="m-0 border-0 border-t border-app-line" />
              )}
            </li>
          ))}
        </ol>
      )}

      {mode === "visual" ? (
        <div className="flex flex-wrap gap-2">
          {ADD.map(([type, label]) => (
            <button key={type} type="button" onClick={() => commit([...blocks, blank(type)])} className={buttonClass("white", "sm")}>
              <Icon name="plus" size={14} /> {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
