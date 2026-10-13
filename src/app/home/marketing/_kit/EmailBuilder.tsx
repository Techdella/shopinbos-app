"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import { Card, CardHead } from "@/components/app-kit";
import { Notice, PillButton, Toggle } from "@/components/app-ui";
import { AdvancedFold } from "@/components/simple/Fold";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { buttonClass, textareaClass } from "@/components/growth/kit";
import { BLOCK_LABELS, EMAIL_THEMES, EMAIL_THEME_INFO, blocksToHtml, htmlFromBlocks, readBlocks, themeOf, type EmailBlock, type EmailBlockType, type EmailThemeName } from "@/lib/marketing/blocks";
import { darkModeOn, isFullDocument, logoHeaderOn, setDarkMode, setLogoHeader, type EmailBrand } from "@/lib/marketing/email-layout";
import { previewSubject, renderEmailPreview, type PreviewShop } from "@/lib/marketing/preview";
import { BLOCK_ICONS, BlockSettings, blankBlock, blockSummary } from "./BlockSettings";
import { DeviceSwitch, EmailFrame } from "./EmailFrame";
import { VariableChips, api, errorText, insertAtCursor } from "./client";
import { Mascot } from "@/components/brand/Mascot";
import { useT } from "@/components/i18n/I18nProvider";

// The template builder: blocks on the left (add, drag or move, duplicate, delete), the email as it will look in
// the middle (computer or phone), the chosen block's settings on the right, plus Undo/Redo and "Ask Peggy",
// which rewrites the blocks and can be undone like any other change. HTML mode is a plain code box with a live
// preview next to it. The preview is drawn in the browser from the same pure code the sender uses.

export interface EmailContent {
  subject: string;
  preheader: string;
  bodyHtml: string;
}

interface Snapshot {
  blocks: EmailBlock[];
  subject: string;
  preheader: string;
}

const ADD: EmailBlockType[] = ["heading", "text", "button", "image", "products", "coupon", "columns", "divider", "spacer", "social", "footer"];
/** Richer layouts: heroes, receipts, delivery steps, countdowns, loyalty and games. */
const ADD_MORE: EmailBlockType[] = ["hero", "banner", "countdown", "review", "features", "receipt", "steps", "vip", "meter", "game", "theme"];
const STARTER: EmailBlock[] = [
  { type: "heading", text: "Hello from {{store}}" },
  { type: "text", text: "Hi {{name}},\n\nWrite your message here." },
  { type: "button", label: "Visit the shop", url: "{{store_url}}" },
];
const PEGGY_IDEAS = ["builder.idea.sallah", "builder.idea.cartLast", "builder.idea.spin", "builder.idea.luxe", "builder.idea.shorter", "builder.idea.subject", "builder.idea.bestSellers"] as const;

export function EmailBuilder({ content, onChange, brand, shop }: { content: EmailContent; onChange: (content: EmailContent) => void; brand: EmailBrand; shop: PreviewShop }) {
  const t = useT("emailBuilder", "common");
  const blockLabel = (type: EmailBlockType) => t.dynamic(`block.${type}`, BLOCK_LABELS[type]);
  const initial = readBlocks(content.bodyHtml);
  const [mode, setMode] = useState<"visual" | "html">(initial || !content.bodyHtml.trim() ? "visual" : "html");
  const [blocks, setBlocks] = useState<EmailBlock[]>(initial ?? (content.bodyHtml.trim() ? [] : STARTER));
  const [selected, setSelected] = useState<number | null>(blocks.length ? 0 : null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const lastPush = useRef<{ at: number; key: string }>({ at: 0, key: "" });
  const dragFrom = useRef<number | null>(null);
  const focused = useRef<{ index: number; field: "text" | "label"; el: HTMLTextAreaElement | HTMLInputElement } | null>(null);
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const [adding, setAdding] = useState(false);

  // Peggy
  const [ask, setAsk] = useState("");
  const [asking, setAsking] = useState(false);
  const [peggy, setPeggy] = useState<{ tone: "info" | "error"; text: string; undo: boolean } | null>(null);

  const snapshot = (): Snapshot => ({ blocks, subject: content.subject, preheader: content.preheader });

  /** Records the state before a change. Typing in the same field within 1.2s counts as one step. */
  function remember(key: string) {
    const now = Date.now();
    if (key && key === lastPush.current.key && now - lastPush.current.at < 1200) {
      lastPush.current.at = now;
      return;
    }
    lastPush.current = { at: now, key };
    setPast((list) => [...list.slice(-49), snapshot()]);
    setFuture([]);
  }

  function apply(next: Snapshot) {
    setBlocks(next.blocks);
    onChange({ subject: next.subject, preheader: next.preheader, bodyHtml: htmlFromBlocks(next.blocks) });
  }

  function commit(next: EmailBlock[], key = "") {
    remember(key);
    setBlocks(next);
    onChange({ ...content, bodyHtml: htmlFromBlocks(next) });
  }

  function undo() {
    const previous = past[past.length - 1];
    if (!previous) return;
    setPast(past.slice(0, -1));
    setFuture((list) => [snapshot(), ...list]);
    lastPush.current = { at: 0, key: "" };
    apply(previous);
    setSelected((s) => (s !== null && s < previous.blocks.length ? s : previous.blocks.length ? 0 : null));
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setFuture(future.slice(1));
    setPast((list) => [...list, snapshot()]);
    lastPush.current = { at: 0, key: "" };
    apply(next);
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= blocks.length || from === to) return;
    const next = [...blocks];
    const [block] = next.splice(from, 1);
    next.splice(to, 0, block);
    commit(next);
    setSelected(to);
  }

  function add(type: EmailBlockType) {
    const existing = type === "theme" ? blocks.findIndex((b) => b.type === "theme") : -1;
    if (existing >= 0) {
      setSelected(existing);
      setAdding(false);
      return;
    }
    const at = type === "theme" ? 0 : selected === null ? blocks.length : selected + 1;
    const next = [...blocks];
    next.splice(at, 0, blankBlock(type));
    commit(next);
    setSelected(at);
    setAdding(false);
  }

  /** The style family (a "theme" block kept at the top; Classic removes it). */
  function setTheme(theme: EmailThemeName) {
    const rest = blocks.filter((b) => b.type !== "theme");
    commit(theme === "classic" ? rest : [{ type: "theme", theme }, ...rest]);
    setSelected(null);
  }

  function insertVariable(token: string) {
    if (mode === "html") {
      onChange({ ...content, bodyHtml: insertAtCursor(htmlRef.current, content.bodyHtml, token) });
      return;
    }
    const target = focused.current;
    const block = target ? blocks[target.index] : undefined;
    if (!target || !block || target.index !== selected) {
      if (selected !== null && blocks[selected] && "text" in blocks[selected]) {
        const current = blocks[selected] as Extract<EmailBlock, { text: string }>;
        commit(blocks.map((b, i) => (i === selected ? ({ ...current, text: `${current.text}${token}` } as EmailBlock) : b)));
      }
      return;
    }
    const current = target.field === "label" && block.type === "button" ? block.label : "text" in block ? block.text : "";
    const next = insertAtCursor(target.el, current, token);
    commit(blocks.map((b, i) => (i === target.index ? ({ ...b, ...(target.field === "label" ? { label: next } : { text: next }) } as EmailBlock) : b)));
  }

  function switchMode(next: "visual" | "html") {
    if (next === mode) return;
    if (next === "html") {
      onChange({ ...content, bodyHtml: blocksToHtml(blocks) });
      setMode("html");
      return;
    }
    const parsed = readBlocks(content.bodyHtml);
    if (parsed) {
      setBlocks(parsed);
      setMode("visual");
      return;
    }
    if (content.bodyHtml.trim() && !window.confirm(t("builder.confirmFresh"))) return;
    setPast([]);
    setFuture([]);
    setBlocks(STARTER);
    onChange({ ...content, bodyHtml: htmlFromBlocks(STARTER) });
    setSelected(0);
    setMode("visual");
  }

  async function askPeggy(instruction: string) {
    if (!instruction.trim()) return;
    setAsking(true);
    setPeggy(null);
    try {
      const draft = await api<{ subject: string; preheader: string; blocks: EmailBlock[]; note: string; ai: boolean }>("/api/app/marketing/templates/assist", "POST", {
        instruction,
        current: mode === "visual" && blocks.length ? { subject: content.subject, preheader: content.preheader, blocks } : null,
      });
      remember("");
      lastPush.current = { at: 0, key: "" };
      if (mode === "html") setMode("visual");
      apply({ blocks: draft.blocks, subject: draft.subject, preheader: draft.preheader });
      setSelected(draft.blocks.length ? 0 : null);
      setPeggy({ tone: "info", text: draft.note, undo: true });
      setAsk("");
    } catch (error) {
      setPeggy({ tone: "error", text: errorText(error), undo: false });
    } finally {
      setAsking(false);
    }
  }

  // Live preview (deferred, so typing stays smooth on slow phones).
  const deferredBody = useDeferredValue(content.bodyHtml);
  const deferredPre = useDeferredValue(content.preheader);
  const previewHtml = useMemo(() => renderEmailPreview({ bodyHtml: deferredBody, preheader: deferredPre, brand, shop }), [deferredBody, deferredPre, brand, shop]);
  const lineCount = content.bodyHtml.split("\n").length;
  const iconButton = "grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-app-canvas disabled:opacity-30";
  const block = selected !== null ? blocks[selected] : undefined;

  const preview = (
    <Card className="grid min-w-0 content-start gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DeviceSwitch value={device} onChange={setDevice} />
        <span className="text-[12.5px] text-app-ink-soft">{t("builder.sampleCustomer")}</span>
      </div>
      <div className="rounded-[14px] bg-app-canvas px-4 py-2.5 text-[13.5px]">
        <div className="truncate"><span className="text-app-ink-soft">{t("preview.subject")} </span><strong>{previewSubject(content.subject || t("builder.noSubject"), shop)}</strong></div>
        {content.preheader ? <div className="truncate text-[12.5px] text-app-ink-soft">{previewSubject(content.preheader, shop)}</div> : null}
      </div>
      <EmailFrame html={previewHtml} device={device} />
    </Card>
  );

  const peggyPanel = (
    <Card className="grid gap-3 p-4">
      <div className="flex items-center gap-2.5">
        <Mascot who="peggy" mood={asking ? "thinking" : peggy?.tone === "error" ? "oops" : "idle"} size={36} decorative />
        <div className="min-w-0">
          <h3 className="m-0 text-[15px] font-extrabold">{t("builder.askPeggy")}</h3>
          <p className="m-0 text-[12.5px] text-app-ink-soft">{t("builder.askPeggySub")}</p>
        </div>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void askPeggy(ask);
        }}
        className="grid gap-2"
      >
        <textarea aria-label={t("builder.askLabel")} value={ask} onChange={(e) => setAsk(e.target.value)} rows={2} maxLength={1000} className={textareaClass} placeholder={t("builder.askPlaceholder")} />
        <div className="flex flex-wrap gap-1.5">
          {PEGGY_IDEAS.map((idea) => (
            <button key={idea} type="button" disabled={asking} onClick={() => void askPeggy(t(idea))} className="min-h-[32px] rounded-full border border-app-line bg-white px-3 text-[12.5px] font-semibold hover:border-app-ink disabled:opacity-50">
              {t(idea)}
            </button>
          ))}
        </div>
        <PillButton type="submit" size="sm" busy={asking} disabled={!ask.trim()}><Icon name="sparkle" size={14} /> {t("builder.askPeggy")}</PillButton>
      </form>
      {peggy ? (
        <div className="grid gap-2">
          <Notice tone={peggy.tone}>{peggy.text}</Notice>
          {peggy.undo && past.length ? (
            <button type="button" onClick={() => { undo(); setPeggy(null); }} className={buttonClass("white", "sm")}><Icon name="undo" size={14} /> {t("builder.undoPeggy")}</button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {mode === "html" ? (
          <>
            <span className="rounded-full bg-[#FDF0D5] px-3 py-1.5 text-[12.5px] font-bold text-[#5C3D00]">{t("composer.advancedBadge")}</span>
            <button type="button" onClick={() => switchMode("visual")} className={buttonClass("white", "sm")}>{t("composer.backToEasy")}</button>
          </>
        ) : null}
        {mode === "visual" ? (
          <div className="flex items-center gap-1">
            <button type="button" onClick={undo} disabled={!past.length} className={cx(buttonClass("white", "sm"), "disabled:opacity-40")} aria-label={t("builder.undo")}><Icon name="undo" size={14} /> {t("builder.undo")}</button>
            <button type="button" onClick={redo} disabled={!future.length} className={cx(buttonClass("white", "sm"), "disabled:opacity-40")} aria-label={t("builder.redo")}><Icon name="refresh" size={14} /> {t("builder.redo")}</button>
          </div>
        ) : null}
        {mode === "visual" ? (
          <label className="ml-auto flex items-center gap-2 text-[13px] font-bold">
            <Icon name="palette" size={14} /> {t("builder.style")}
            <select aria-label={t("block.theme")} value={themeOf(blocks)} onChange={(e) => setTheme(e.target.value as EmailThemeName)} className="h-[40px] rounded-full border border-app-line bg-white px-3 text-[13.5px] font-bold text-app-ink outline-none focus:border-app-ink">
              {EMAIL_THEMES.map((name) => <option key={name} value={name}>{t.dynamic(`theme.${name}`, EMAIL_THEME_INFO[name].label)}</option>)}
            </select>
          </label>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <span className="text-[12.5px] font-bold text-app-ink-soft">{t("builder.personalDetails")}</span>
        <VariableChips onInsert={insertVariable} only={["name", "full_name", "store", "store_url", "cart_url", "cart_items", "cart_total", "order_number", "order_total", "product_name", "discount_code"]} />
      </div>

      {mode === "html" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="grid min-w-0 content-start gap-3 p-4">
            <CardHead title="HTML" sub={t("builder.htmlSub")} />
            {isFullDocument(content.bodyHtml) ? (
              <div className="flex items-center justify-between gap-3 rounded-[14px] border border-app-line px-3 py-2.5">
                <span className="grid gap-0.5">
                  <span className="text-[14px] font-semibold">{t("builder.logoHeader")}</span>
                  <span className="text-[12.5px] text-app-ink-soft">{t("builder.logoHeaderSub")}</span>
                </span>
                <Toggle on={logoHeaderOn(content.bodyHtml)} onChange={(on) => onChange({ ...content, bodyHtml: setLogoHeader(content.bodyHtml, on) })} label={t("builder.logoHeader")} />
              </div>
            ) : null}
            {isFullDocument(content.bodyHtml) ? (
              <div className="flex items-center justify-between gap-3 rounded-[14px] border border-app-line px-3 py-2.5">
                <span className="grid gap-0.5">
                  <span className="text-[14px] font-semibold">{t("builder.darkMode")}</span>
                  <span className="text-[12.5px] text-app-ink-soft">{t("builder.darkModeSub")}</span>
                </span>
                <Toggle on={darkModeOn(content.bodyHtml)} onChange={(on) => onChange({ ...content, bodyHtml: setDarkMode(content.bodyHtml, on) })} label={t("builder.darkMode")} />
              </div>
            ) : null}
            <div className="flex overflow-hidden rounded-[14px] border border-app-line bg-white focus-within:border-app-ink">
              <div ref={gutterRef} aria-hidden className="h-[560px] select-none overflow-hidden bg-app-canvas px-2 py-2.5 text-right font-mono text-[12px] leading-[1.6] text-app-ink-faint">
                {Array.from({ length: lineCount }, (_, i) => <div key={i}>{i + 1}</div>)}
              </div>
              <textarea
                ref={htmlRef}
                aria-label={t("composer.htmlLabel")}
                value={content.bodyHtml}
                onChange={(e) => onChange({ ...content, bodyHtml: e.target.value })}
                onScroll={(e) => {
                  if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
                }}
                spellCheck={false}
                wrap="off"
                className="h-[560px] min-w-0 flex-1 resize-none border-0 px-3 py-2.5 font-mono text-[12.5px] leading-[1.6] outline-none"
                placeholder={'<h1 style="margin:0">Hi {{name}}</h1>\n<p>Your message</p>\n<a href="{{store_url}}">Shop now</a>'}
              />
            </div>
          </Card>
          {preview}
        </div>
      ) : (
        <div className="grid gap-4 xl:[grid-template-columns:300px_minmax(0,1fr)_360px]">
          <div className="grid min-w-0 content-start gap-3">
            <Card className="grid gap-2 p-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="m-0 text-[15px] font-extrabold">{t("builder.blocks")}</h3>
                <span className="text-[12px] text-app-ink-soft">{t("builder.dragToReorder")}</span>
              </div>
              {blocks.length ? (
                <ol className="m-0 grid list-none gap-1.5 p-0">
                  {blocks.map((b, index) => (
                    <li
                      key={index}
                      draggable
                      onDragStart={() => {
                        dragFrom.current = index;
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (dragFrom.current !== null) move(dragFrom.current, index);
                        dragFrom.current = null;
                      }}
                      className={cx("rounded-[14px] border bg-white", selected === index ? "border-app-ink" : "border-app-line")}
                    >
                      <button type="button" onClick={() => setSelected(index)} aria-pressed={selected === index} className="flex min-h-[44px] w-full min-w-0 items-center gap-2 px-3 pt-1.5 text-left">
                        <Icon name={BLOCK_ICONS[b.type]} size={15} className="shrink-0 text-app-ink-soft" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-extrabold">{blockLabel(b.type)}</span>
                          <span className="block truncate text-[12.5px] text-app-ink-soft">{blockSummary(b, t)}</span>
                        </span>
                      </button>
                      <div className="flex items-center justify-end gap-0.5 px-1.5 pb-1">
                        <button type="button" aria-label={t("composer.moveUp")} onClick={() => move(index, index - 1)} disabled={index === 0} className={iconButton}><Icon name="arrowUp" size={14} /></button>
                        <button type="button" aria-label={t("composer.moveDown")} onClick={() => move(index, index + 1)} disabled={index === blocks.length - 1} className={iconButton}><Icon name="arrowDown" size={14} /></button>
                        <button type="button" aria-label={t("builder.duplicate")} onClick={() => { const next = [...blocks]; next.splice(index + 1, 0, structuredClone(b)); commit(next); setSelected(index + 1); }} className={iconButton}><Icon name="copy" size={14} /></button>
                        <button type="button" aria-label={t("builder.deleteBlock")} onClick={() => { commit(blocks.filter((_, i) => i !== index)); setSelected(blocks.length > 1 ? Math.max(0, index - 1) : null); }} className={cx(iconButton, "text-app-danger hover:bg-app-danger-tint")}><Icon name="trash" size={14} /></button>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="m-0 px-1 text-[13.5px] text-app-ink-soft">{t("builder.noBlocks")}</p>
              )}
              {adding ? (
                <div className="grid grid-cols-2 gap-1.5 rounded-[14px] bg-app-canvas p-2">
                  {ADD.map((type) => (
                    <button key={type} type="button" onClick={() => add(type)} className="flex min-h-[44px] items-center gap-2 rounded-[12px] bg-white px-2.5 text-left text-[13px] font-bold hover:ring-1 hover:ring-app-ink">
                      <Icon name={BLOCK_ICONS[type]} size={14} className="shrink-0" /> {blockLabel(type)}
                    </button>
                  ))}
                  <span className="col-span-2 px-1 pt-1.5 text-[11.5px] font-bold uppercase tracking-[0.08em] text-app-ink-soft">{t("builder.layoutsExtras")}</span>
                  {ADD_MORE.map((type) => (
                    <button key={type} type="button" onClick={() => add(type)} className="flex min-h-[44px] items-center gap-2 rounded-[12px] bg-white px-2.5 text-left text-[13px] font-bold hover:ring-1 hover:ring-app-ink">
                      <Icon name={BLOCK_ICONS[type]} size={14} className="shrink-0" /> {blockLabel(type)}
                    </button>
                  ))}
                  <button type="button" onClick={() => setAdding(false)} className="col-span-2 min-h-[36px] text-[13px] font-bold text-app-ink-soft">{t("cancel")}</button>
                </div>
              ) : (
                <button type="button" onClick={() => setAdding(true)} className={buttonClass("ink", "sm")}><Icon name="plus" size={14} /> {selected !== null ? t("builder.addBlockBelow") : t("builder.addBlock")}</button>
              )}
            </Card>
          </div>

          <div className="order-last min-w-0 xl:order-none">{preview}</div>

          <div className="grid min-w-0 content-start gap-3">
            <Card className="grid gap-3 p-4">
              {block ? (
                <>
                  <div className="flex items-center gap-2">
                    <Icon name={BLOCK_ICONS[block.type]} size={16} />
                    <h3 className="m-0 text-[15px] font-extrabold">{blockLabel(block.type)}</h3>
                  </div>
                  <BlockSettings
                    key={selected}
                    block={block}
                    onChange={(next) => commit(blocks.map((b, i) => (i === selected ? next : b)), `block-${selected}`)}
                    onFocusText={(el, field) => {
                      focused.current = { index: selected!, field, el };
                    }}
                  />
                </>
              ) : (
                <p className="m-0 text-[13.5px] text-app-ink-soft">{t("builder.pickBlock")}</p>
              )}
            </Card>
            {peggyPanel}
          </div>
        </div>
      )}

      {mode === "html" ? peggyPanel : (
        <AdvancedFold label={t("composer.advancedFold")} hint={t("builder.advancedFoldHint")}>
          <button type="button" onClick={() => switchMode("html")} className={buttonClass("white", "sm")}>{t("composer.switchToHtml")}</button>
        </AdvancedFold>
      )}
    </div>
  );
}
