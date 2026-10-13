"use client";

import { useRef, useState } from "react";
import { AdvancedFold } from "@/components/simple/Fold";
import { Icon } from "@/components/ui/Icon";
import { buttonClass, textareaClass } from "@/components/growth/kit";
import { BLOCK_LABELS, blocksToHtml, htmlFromBlocks, readBlocks, type EmailBlock, type EmailBlockType } from "@/lib/marketing/blocks";
import { BLOCK_ICONS, BlockSettings, blankBlock, blockSummary } from "./BlockSettings";
import { VariableChips, insertAtCursor } from "./client";
import { useT } from "@/components/i18n/I18nProvider";

// Compact email editor for campaigns and automations: the same blocks as the template builder, edited one at
// a time in a list (tap a block to open its settings), or raw HTML for people who paste their own.

const STARTER: EmailBlock[] = [
  { type: "heading", text: "Hello from {{store}}" },
  { type: "text", text: "Hi {{name}},\n\nWrite your message here." },
  { type: "button", label: "Visit the shop", url: "{{store_url}}" },
];

const ADD: EmailBlockType[] = ["heading", "text", "button", "image", "products", "coupon", "columns", "divider", "spacer", "social", "footer"];

export function EmailComposer({ value, onChange, variables }: { value: string; onChange: (html: string) => void; variables?: string[] }) {
  const t = useT("emailBuilder");
  const blockLabel = (type: EmailBlockType) => t.dynamic(`block.${type}`, BLOCK_LABELS[type]);
  const initial = readBlocks(value);
  const [mode, setMode] = useState<"visual" | "html">(initial || !value.trim() ? "visual" : "html");
  const [blocks, setBlocks] = useState<EmailBlock[]>(initial ?? (value.trim() ? [] : STARTER));
  const [open, setOpen] = useState<number | null>(initial?.length ? null : 1);
  const focused = useRef<{ index: number; field: "text" | "label"; el: HTMLTextAreaElement | HTMLInputElement } | null>(null);
  const htmlRef = useRef<HTMLTextAreaElement>(null);

  function commit(next: EmailBlock[]) {
    setBlocks(next);
    onChange(htmlFromBlocks(next));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
    if (open === index) setOpen(target);
  }

  function insertVariable(token: string) {
    if (mode === "html") {
      onChange(insertAtCursor(htmlRef.current, value, token));
      return;
    }
    const target = focused.current;
    const block = target ? blocks[target.index] : undefined;
    if (!target || !block) {
      const last = blocks.findLastIndex((b) => b.type === "text");
      if (last >= 0) commit(blocks.map((b, i) => (i === last && b.type === "text" ? { ...b, text: `${b.text}${token}` } : b)));
      return;
    }
    const current = target.field === "label" && block.type === "button" ? block.label : "text" in block ? block.text : "";
    const next = insertAtCursor(target.el, current, token);
    commit(blocks.map((b, i) => (i === target.index ? ({ ...b, ...(target.field === "label" ? { label: next } : { text: next }) } as EmailBlock) : b)));
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
    if (value.trim() && !window.confirm(t("composer.confirmFresh"))) return;
    commit(STARTER);
    setMode("visual");
  }

  const iconButton = "grid h-9 w-9 place-items-center rounded-full hover:bg-app-canvas disabled:opacity-30";

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {mode === "html" ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#FDF0D5] px-3 py-1.5 text-[12.5px] font-bold text-[#5C3D00]">{t("composer.advancedBadge")}</span>
            <button type="button" onClick={() => switchMode("visual")} className="min-h-[36px] rounded-full border border-app-line bg-white px-3 text-[13px] font-bold">{t("composer.backToEasy")}</button>
          </span>
        ) : null}
        <span className="text-[12.5px] text-app-ink-soft">{t("composer.tapDetail")}</span>
      </div>
      <VariableChips onInsert={insertVariable} only={variables} />

      {mode === "html" ? (
        <>
          <textarea
            ref={htmlRef}
            aria-label={t("composer.htmlLabel")}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            rows={16}
            spellCheck={false}
            className={`${textareaClass} font-mono text-[13px] leading-[1.6]`}
            placeholder={'<h1>Hi {{name}}</h1>\n<p>Your message</p>'}
          />
          <p className="m-0 text-[12.5px] text-app-ink-soft">{t("composer.scriptsRemoved")}</p>
        </>
      ) : (
        <ol className="m-0 grid list-none gap-2 p-0">
          {blocks.map((block, index) => (
            <li key={index} className="rounded-[16px] border border-app-line bg-white">
              <div className="flex items-center gap-1 p-2 pl-3">
                <button type="button" onClick={() => setOpen(open === index ? null : index)} aria-expanded={open === index} className="flex min-h-[40px] min-w-0 flex-1 items-center gap-2 text-left">
                  <Icon name={BLOCK_ICONS[block.type]} size={15} className="shrink-0 text-app-ink-soft" />
                  <span className="shrink-0 text-[13px] font-extrabold">{blockLabel(block.type)}</span>
                  <span className="min-w-0 truncate text-[13px] text-app-ink-soft">{blockSummary(block, t)}</span>
                </button>
                <button type="button" aria-label={t("composer.moveUp")} onClick={() => move(index, -1)} disabled={index === 0} className={iconButton}><Icon name="arrowUp" size={15} /></button>
                <button type="button" aria-label={t("composer.moveDown")} onClick={() => move(index, 1)} disabled={index === blocks.length - 1} className={iconButton}><Icon name="arrowDown" size={15} /></button>
                <button type="button" aria-label={t("composer.removeBlock")} onClick={() => { commit(blocks.filter((_, i) => i !== index)); setOpen(null); }} className="grid h-9 w-9 place-items-center rounded-full text-app-danger hover:bg-app-danger-tint"><Icon name="trash" size={15} /></button>
              </div>
              {open === index ? (
                <div className="border-t border-app-line p-3">
                  <BlockSettings
                    block={block}
                    onChange={(next) => commit(blocks.map((b, i) => (i === index ? next : b)))}
                    onFocusText={(el, field) => {
                      focused.current = { index, field, el };
                    }}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {mode === "visual" ? (
        <div className="flex flex-wrap gap-2">
          {ADD.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                commit([...blocks, blankBlock(type)]);
                setOpen(blocks.length);
              }}
              className={buttonClass("white", "sm")}
            >
              <Icon name="plus" size={14} /> {blockLabel(type)}
            </button>
          ))}
        </div>
      ) : null}
      {mode === "visual" ? (
        <AdvancedFold label={t("composer.advancedFold")} hint={t("composer.advancedFoldHint")}>
          <button type="button" onClick={() => switchMode("html")} className={buttonClass("white", "sm")}>{t("composer.switchToHtml")}</button>
        </AdvancedFold>
      ) : null}
    </div>
  );
}
