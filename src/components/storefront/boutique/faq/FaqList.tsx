"use client";

import { useId, useRef, useState } from "react";
import type React from "react";
import { Icon } from "@/components/ui/Icon";
import type { BoutiqueLook } from "../look";
import { faqAlwaysOpen, type FaqStyle } from "./faq-logic";

// The questions and answers of a FAQ, in one of the shared styles (faq-logic.ts). Used by the page FAQ section and
// the product page. Colours, fonts and corners come from the theme's look, so dark themes stay readable. Layouts are
// intrinsic (its own container query), so it fits a phone, a builder preview and a wide page without the page's CSS.

export interface FaqListItem {
  id: string;
  question: string;
  /** Empty: `missing` shows instead (the builder's "write your answer" hint). */
  answer: string;
}

interface Props {
  items: FaqListItem[];
  style: FaqStyle;
  look: BoutiqueLook;
  /** The first question starts open (styles that open and close). */
  firstOpen?: boolean;
  /** Heading level of each question (3 under a section heading, 4 inside a details panel). */
  level?: 3 | 4;
  missing?: string;
  className?: string;
}

export const FAQ_CSS = `
.bq-faq{container-type:inline-size}
.bq-faq-q{cursor:pointer;-webkit-tap-highlight-color:transparent}
.bq-faq-q:focus-visible{outline:2px solid currentColor;outline-offset:3px;border-radius:4px}
.bq-faq-a:not([hidden]){animation:bq-faq-in .22s ease-out}
.bq-faq-chev{transition:transform .2s ease}
.bq-faq-q[aria-expanded="true"] .bq-faq-chev{transform:rotate(180deg)}
.bq-faq-cards{display:grid;gap:12px}
.bq-faq-split > div{display:grid;gap:4px 32px}
@container (min-width: 620px){
  .bq-faq-cards{grid-template-columns:repeat(2,minmax(0,1fr))}
  .bq-faq-split > div{grid-template-columns:minmax(0,2fr) minmax(0,3fr)}
}
@keyframes bq-faq-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.bq-faq *{animation:none !important;transition:none !important}}
`;

export function FaqList({ items, style, look, firstOpen = false, level = 3, missing = "", className = "" }: Props) {
  const t = look.tokens;
  const uid = useId().replace(/:/g, "");
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<string | null>(firstOpen && items[0] ? items[0].id : null);
  const H = (level === 4 ? "h4" : "h3") as "h3";
  const answerOf = (item: FaqListItem) => item.answer || missing;
  const css = <style>{FAQ_CSS}</style>;

  if (faqAlwaysOpen(style)) {
    if (style === "cards") {
      return (
        <div className={`bq-faq ${className}`} data-faq-style="cards">
          {css}
          <div className="bq-faq-cards">
            {items.map((item) => (
              <div key={item.id} className="p-5" style={{ background: look.raised, borderRadius: look.cardRadius }}>
                <H className="m-0 text-[15.5px] font-semibold" style={{ color: t.ink }}>{item.question}</H>
                <p className="mb-0 mt-2 whitespace-pre-line text-[14.5px] leading-7" style={{ color: t.muted }}>{answerOf(item)}</p>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className={`bq-faq bq-faq-split border-t ${className}`} data-faq-style="split" style={{ borderColor: t.border }}>
        {css}
        {items.map((item) => (
          <div key={item.id} className="border-b py-5" style={{ borderColor: t.border }}>
            <H className="m-0 text-[15.5px] font-semibold leading-6" style={{ color: t.ink }}>{item.question}</H>
            <p className="m-0 whitespace-pre-line text-[14.5px] leading-7" style={{ color: t.muted }}>{answerOf(item)}</p>
          </div>
        ))}
      </div>
    );
  }

  // Up and down arrows, Home and End move between questions (the accordion keyboard pattern).
  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const keys: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, Home: 0, End: 0 };
    if (!(event.key in keys)) return;
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button.bq-faq-q") ?? [])];
    const at = buttons.indexOf(event.currentTarget);
    if (at < 0 || !buttons.length) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (at + keys[event.key]! + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }

  const row = (item: FaqListItem, index: number, button: (isOpen: boolean) => React.ReactNode, answerClass: string, answerStyle?: React.CSSProperties) => {
    const isOpen = open === item.id;
    const qid = `${uid}-q${index}`;
    const aid = `${uid}-a${index}`;
    return {
      heading: (
        <H className="m-0">
          <button type="button" id={qid} aria-expanded={isOpen} aria-controls={aid} onClick={() => setOpen(isOpen ? null : item.id)} onKeyDown={onKeyDown} className="bq-faq-q flex w-full items-center justify-between gap-4 border-0 bg-transparent text-left" style={{ color: t.ink }}>
            {button(isOpen)}
          </button>
        </H>
      ),
      answer: (
        <div id={aid} role="region" aria-labelledby={qid} hidden={!isOpen} className={`bq-faq-a whitespace-pre-line text-[14.5px] leading-7 ${answerClass}`} style={{ color: t.muted, ...answerStyle }}>
          {answerOf(item)}
        </div>
      ),
    };
  };

  if (style === "numbered") {
    return (
      <div ref={listRef} className={`bq-faq overflow-hidden border ${className}`} data-faq-style="numbered" style={{ borderColor: t.border, borderRadius: Math.min(look.cardRadius, 16) }}>
        {css}
        <ol className="m-0 list-none p-0">
          {items.map((item, index) => {
            const parts = row(
              item,
              index,
              () => (
                <>
                  <span className="flex min-w-0 items-baseline gap-3.5">
                    <span aria-hidden className="shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: t.accent, fontFamily: look.eyebrowFont }}>{String(index + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 text-[15px] font-semibold">{item.question}</span>
                  </span>
                  <Icon name="chevDown" size={16} className="bq-faq-chev shrink-0" />
                </>
              ),
              "pb-4 pl-[46px] pr-5",
            );
            return (
              <li key={item.id} className="border-b last:border-b-0" style={{ borderColor: t.border }}>
                <div className="px-4 py-3.5 sm:px-5">{parts.heading}</div>
                {parts.answer}
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  if (style === "boxed") {
    return (
      <div ref={listRef} className={`bq-faq grid gap-2.5 ${className}`} data-faq-style="boxed">
        {css}
        {items.map((item, index) => {
          const parts = row(
            item,
            index,
            (isOpen) => (
              <>
                <span className="flex min-w-0 items-center gap-3">
                  <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[14px] font-bold" style={{ background: t.accent, color: look.onAccent }}>?</span>
                  <span className="min-w-0 text-[15px] font-semibold">{item.question}</span>
                </span>
                <Icon name={isOpen ? "minus" : "plus"} size={16} className="shrink-0" />
              </>
            ),
            "pb-4 pl-[60px] pr-4",
          );
          return (
            <div key={item.id} style={{ background: look.raised, borderRadius: Math.min(look.cardRadius, 16) }}>
              <div className="px-4 py-3">{parts.heading}</div>
              {parts.answer}
            </div>
          );
        })}
      </div>
    );
  }

  // Plus / minus (the default; the same rows the FAQ section always had) and arrow.
  const chevron = style === "chevron";
  return (
    <div ref={listRef} className={`bq-faq ${chevron ? "border-t" : ""} ${className}`} data-faq-style={style} style={chevron ? { borderColor: t.border } : undefined}>
      {css}
      {items.map((item, index) => {
        const parts = row(
          item,
          index,
          (isOpen) => (
            <span className={`flex w-full items-center justify-between gap-4 py-4 text-[15px] ${chevron ? "font-semibold" : "font-medium"}`}>
              <span className="min-w-0">{item.question}</span>
              {chevron ? <Icon name="chevDown" size={16} className="bq-faq-chev shrink-0" /> : <Icon name={isOpen ? "minus" : "plus"} size={16} className="shrink-0" />}
            </span>
          ),
          "pb-4",
        );
        return (
          <div key={item.id} className="border-b" style={{ borderColor: t.border }}>
            {parts.heading}
            {parts.answer}
          </div>
        );
      })}
    </div>
  );
}
