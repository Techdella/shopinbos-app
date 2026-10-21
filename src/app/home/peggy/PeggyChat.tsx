"use client";

import { BuyCreditsButton, creditsChanged, isCreditsError } from "@/components/credits/CreditsBadge";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mascot } from "@/components/app-ui";
import { cx } from "@/components/app-ui/cx";
import { Icon, type IconName } from "@/components/ui/Icon";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { useChatAutosave } from "@/components/ai/ChatHistory";
import { ChatSidebar, ChatSidebarButton } from "@/components/ai/ChatSidebar";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatNumber } from "@shared/i18n";
import type { MessageKey } from "@shared/i18n/catalog";
import { ChatText } from "@/components/chat/ChatText";

interface PeggyAction {
  tool: string;
  summary: string;
  href?: string;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
  actions?: PeggyAction[];
  /** Error notes are shown but not sent back to Peggy. */
  failed?: boolean;
  /** Show "Buy credits" under it (the allowance and credits ran out). */
  buyCredits?: boolean;
  /** Replies Peggy expects next, shown as buttons under her latest answer. */
  suggestions?: string[];
}

interface Stats {
  today: string;
  week: string;
  toSend: number;
  unpaid: number;
  lowStock: number;
  unread: number;
  drafts: number;
}

const MAX_TURNS = 20;
const MAX_CHARS = 4000;

const ACTION_ICON: Record<string, IconName> = {
  create_discount: "tag",
  update_product: "box",
  set_product_variants: "layers",
  mark_order: "package",
  draft_blog_post: "edit",
  draft_broadcast: "send",
  draft_ad: "megaphone",
  write_copy: "sparkle",
  request_delivery_quote: "truck",
  connect_delivery_partner: "truck",
};

/** What needs the seller today, each a tap away from Peggy doing it. */
const NEEDS: { stat: keyof Stats; icon: IconName; label: MessageKey<"peggy">; cta: MessageKey<"peggy">; ask: MessageKey<"peggy"> }[] = [
  { stat: "toSend", icon: "truck", label: "need.toSend", cta: "need.toSendCta", ask: "need.toSendAsk" },
  { stat: "unpaid", icon: "card", label: "need.unpaid", cta: "need.unpaidCta", ask: "need.unpaidAsk" },
  { stat: "lowStock", icon: "box", label: "need.lowStock", cta: "need.lowStockCta", ask: "need.lowStockAsk" },
  { stat: "unread", icon: "chat", label: "need.unread", cta: "need.unreadCta", ask: "need.unreadAsk" },
  { stat: "drafts", icon: "edit", label: "need.drafts", cta: "need.draftsCta", ask: "need.draftsAsk" },
];

const CAN_DO: { icon: IconName; text: MessageKey<"peggy"> }[] = [
  { icon: "chart", text: "can.data" },
  { icon: "package", text: "can.orders" },
  { icon: "box", text: "can.products" },
  { icon: "tag", text: "can.discounts" },
  { icon: "truck", text: "can.setup" },
  { icon: "edit", text: "can.drafts" },
  { icon: "sparkle", text: "can.write" },
];

export function PeggyChat({ greeting, initialAsk, suggestions, stats }: { greeting: string; initialAsk: string; suggestions: string[]; stats: Stats }) {
  const router = useRouter();
  const t = useT("peggy");
  const locale = useLocale();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState(initialAsk);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const [chatsOpen, setChatsOpen] = useState(false);
  const { chatId, adopt, savedCount } = useChatAutosave("peggy", turns, !busy, turns.some((turn) => turn.role === "user"));

  function openChat(chat: { id: string; messages: unknown[] }) {
    const loaded = chat.messages.filter(
      (entry): entry is Turn => Boolean(entry) && typeof entry === "object" && ((entry as Turn).role === "user" || (entry as Turn).role === "assistant") && typeof (entry as Turn).content === "string",
    );
    setTurns(loaded);
    adopt(chat.id, loaded.length);
  }

  function newChat() {
    setTurns([]);
    adopt(null, 0);
  }
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!initialAsk) return;
    const input = inputRef.current;
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
    // Drop ?ask= so a reload doesn't bring the prompt back after it was sent.
    router.replace("/home/peggy", { scroll: false });
  }, [initialAsk, router]);

  useEffect(() => {
    // Only the conversation scrolls (scrollIntoView would move the whole page too).
    const list = endRef.current?.closest<HTMLElement>(".overflow-y-auto");
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  async function send(text: string) {
    const message = text.trim().slice(0, MAX_CHARS);
    if (!message || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: message }];
    setTurns(next);
    setDraft("");
    setBusy(true);
    try {
      const messages = next
        .filter((turn) => !turn.failed)
        .slice(-MAX_TURNS)
        .map((turn) => ({ role: turn.role, content: turn.content.slice(0, MAX_CHARS) }));
      const response = await fetch("/api/app/peggy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      const body = (await response.json().catch(() => null)) as { data?: { text: string; actions?: PeggyAction[]; suggestions?: string[] }; error?: { code?: string; message?: string } } | null;
      if (!response.ok || !body?.data) throw Object.assign(new Error(body?.error?.message ?? t("err.answer")), { code: body?.error?.code });
      const data = body.data;
      setTurns((current) => [...current, { role: "assistant", content: data.text, actions: data.actions ?? [], suggestions: data.suggestions ?? [] }]);
      // Her changes show up on the other pages straight away.
      if (data.actions?.length) router.refresh();
    } catch (error) {
      setTurns((current) => [...current, { role: "assistant", failed: true, content: error instanceof Error ? error.message : t("err.short"), buyCredits: isCreditsError((error as { code?: string }).code) }]);
    } finally {
      setBusy(false);
      creditsChanged();
      inputRef.current?.focus();
    }
  }

  const needs = NEEDS.filter((need) => Number(stats[need.stat]) > 0);
  const last = turns[turns.length - 1];
  const nextReplies = !busy && last?.role === "assistant" && !last.failed ? last.suggestions ?? [] : [];

  return (
    <div className="h-full min-h-0 w-full px-4 py-4 font-app text-app-ink sm:px-6 sm:py-6 xl:px-8 2xl:px-10">
      <section className="flex h-full min-h-0 overflow-hidden rounded-[22px] border border-app-line bg-white">
        <ChatSidebar
          assistant="peggy"
          currentId={chatId}
          refreshKey={savedCount}
          onOpen={openChat}
          onNew={newChat}
          mobileOpen={chatsOpen}
          onMobileOpen={() => setChatsOpen(true)}
          onMobileClose={() => setChatsOpen(false)}
          busy={busy}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="shrink-0 border-b border-app-line bg-app-mint/60">
            <div className="flex items-center gap-3 px-4 pb-2 pt-3 sm:px-5">
              <ChatSidebarButton onClick={() => setChatsOpen(true)} className="-ml-2 hover:bg-white/60" />
              <Mascot name="peggy" className="h-10 w-10" alt="Peggy" />
              <div className="min-w-0 flex-1">
                <h1 className="m-0 text-[17px] font-extrabold leading-tight">Peggy</h1>
                <div className="truncate text-[13px] text-app-ink-soft">{t("sub")}</div>
              </div>
              {turns.length > 0 && (
                <button
                  type="button"
                  onClick={newChat}
                  disabled={busy}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-app-line bg-white px-3.5 text-[13px] font-extrabold text-app-ink hover:border-app-line-strong disabled:opacity-50"
                >
                  <Icon name="plus" size={13} /> <span className="hidden sm:inline">{t("newChat")}</span>
                </button>
              )}
            </div>
            {/* Today's numbers, always in view */}
            <ul aria-label={t("today")} className="m-0 flex list-none gap-2 overflow-x-auto px-4 pb-3 sm:px-5 [scrollbar-width:none]">
              <Stat label={t("stat.today")} value={stats.today} />
              <Stat label={t("stat.week")} value={stats.week} />
              <Stat label={t("stat.toSend")} value={stats.toSend} href="/home/orders" alert={stats.toSend > 0} />
              <Stat label={t("stat.unpaid")} value={stats.unpaid} href="/home/orders" alert={stats.unpaid > 0} />
              <Stat label={t("stat.lowStock")} value={stats.lowStock} href="/products" alert={stats.lowStock > 0} />
              <Stat label={t("stat.unread")} value={stats.unread} href="/home/messages" alert={stats.unread > 0} />
            </ul>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5" aria-live="polite">
            <div className="mx-auto flex max-w-[760px] flex-col gap-3">
              <Bubble role="assistant" content={greeting} />
              {turns.length === 0 && (
                <>
                  {needs.length > 0 && (
                    <section aria-labelledby="peggy-needs" className="pt-1">
                      <h2 id="peggy-needs" className="m-0 mb-2 text-[12px] font-extrabold uppercase tracking-[0.12em] text-app-ink-soft">{t("need.title")}</h2>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {needs.map((need) => (
                          <button
                            key={need.stat}
                            type="button"
                            onClick={() => void send(t(need.ask))}
                            disabled={busy}
                            className="group flex items-center gap-3 rounded-[16px] border border-app-line bg-white px-3.5 py-3 text-left text-app-ink hover:border-app-line-strong hover:shadow-sm disabled:opacity-50"
                          >
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-app-mint"><Icon name={need.icon} size={17} /></span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] text-app-ink-soft">
                                <span className="text-[18px] font-extrabold text-app-ink">{formatNumber(Number(stats[need.stat]), locale)}</span> {t(need.label)}
                              </span>
                              <span className="block text-[13.5px] font-extrabold">{t(need.cta)}</span>
                            </span>
                            <Icon name="chevRight" size={16} className="shrink-0 text-app-ink-soft transition group-hover:translate-x-0.5" />
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                  <section aria-labelledby="peggy-ask" className="pt-2">
                    <h2 id="peggy-ask" className="m-0 mb-2 text-[12px] font-extrabold uppercase tracking-[0.12em] text-app-ink-soft">{t("orAsk")}</h2>
                    <div className="flex flex-wrap gap-2">
                      {suggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => void send(suggestion)}
                          disabled={busy}
                          className="min-h-[38px] rounded-full border border-app-line bg-white px-4 text-left text-[13.5px] font-bold text-app-ink hover:border-app-line-strong disabled:opacity-50"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </section>
                  <details className="group mt-2 rounded-[16px] border border-app-line bg-app-canvas/50 px-4 py-3">
                    <summary className="cursor-pointer list-none text-[13.5px] font-extrabold [&::-webkit-details-marker]:hidden">
                      <span className="inline-flex items-center gap-2"><Icon name="sparkle" size={14} /> {t("canTitle")} <Icon name="chevDown" size={14} className="transition group-open:rotate-180" /></span>
                    </summary>
                    <ul className="m-0 mt-3 grid list-none gap-2.5 p-0 sm:grid-cols-2">
                      {CAN_DO.map((item) => (
                        <li key={item.text} className="flex items-start gap-2.5 text-[13px] leading-[1.4]">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-white"><Icon name={item.icon} size={14} /></span>
                          <span className="pt-1">{t(item.text)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mb-0 mt-3 text-[12.5px] text-app-ink-soft">{t("neverAlone")}</p>
                  </details>
                </>
              )}
              {turns.map((turn, index) => (
                <div key={index} className="flex flex-col gap-2">
                  <Bubble role={turn.role} content={turn.content} failed={turn.failed} />
                  {turn.buyCredits ? <BuyCreditsButton className="self-start" label={t("buyCredits")} /> : null}
                  {turn.actions?.map((action, actionIndex) => <ActionCard key={actionIndex} action={action} />)}
                </div>
              ))}
              {nextReplies.length > 0 && (
                <div className="flex flex-wrap gap-2 pl-1" aria-label={t("nextReplies")}>
                  {nextReplies.map((reply) => (
                    <button
                      key={reply}
                      type="button"
                      onClick={() => void send(reply)}
                      className="min-h-[36px] rounded-full border border-app-ink/15 bg-white px-3.5 text-left text-[13px] font-bold text-app-ink hover:border-app-ink"
                    >
                      {reply}
                    </button>
                  ))}
                </div>
              )}
              {busy && (
                <div className="flex items-center gap-2 self-start rounded-[18px] rounded-tl-[6px] bg-app-mint px-4 py-3 text-[14px] text-app-ink-soft">
                  <span className="inline-flex gap-1" aria-hidden>
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-app-ink-soft" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-app-ink-soft [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-app-ink-soft [animation-delay:300ms]" />
                  </span>
                  {t("working")}
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          <form
            className="shrink-0 border-t border-app-line px-3 py-3 sm:px-4"
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
          >
            <div className="mx-auto flex max-w-[760px] items-end gap-2">
              <label htmlFor="peggy-input" className="sr-only">{t("metaTitle")}</label>
              <textarea
                id="peggy-input"
                ref={inputRef}
                rows={1}
                value={draft}
                maxLength={MAX_CHARS}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send(draft);
                  }
                }}
                placeholder={t("placeholder")}
                className="max-h-[160px] min-h-[48px] flex-1 resize-none rounded-[24px] border border-app-line bg-app-canvas px-5 py-3 text-[15px] leading-[1.4] text-app-ink outline-none placeholder:text-app-ink-faint focus:border-app-line-strong field-sizing-content"
              />
              <VoiceInputButton variant="icon" value={draft} onChange={setDraft} maxLength={MAX_CHARS} context="a request for Peggy" disabled={busy} />
              <button
                type="submit"
                disabled={!draft.trim() || busy}
                aria-label={t("send")}
                className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-app-ink text-white disabled:opacity-40"
              >
                <Icon name="arrowUp" size={18} />
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}

function Bubble({ role, content, failed }: { role: "user" | "assistant"; content: string; failed?: boolean }) {
  return (
    <div
      className={cx(
        "max-w-[88%] break-words px-4 py-3 text-[14.5px] leading-[1.5] sm:max-w-[80%]",
        role === "user" && "whitespace-pre-wrap",
        role === "user" ? "self-end rounded-[18px] rounded-br-[6px] bg-app-ink text-white" : "self-start rounded-[18px] rounded-tl-[6px] bg-app-mint text-app-ink",
        failed && "bg-app-danger-tint text-app-danger",
      )}
    >
      {role === "assistant" ? <ChatText text={content} renderText={(part) => <LinkedText text={part} />} /> : content}
    </div>
  );
}

// In-app paths Peggy mentions become links; a /studio?prompt=… link (a request she wrote for Rex) becomes a button.
const APP_PATH = /(\/(?:studio|home|products|marketplace|channels|settings)(?:[/?][^\s)\]]*)?)/g;

function LinkedText({ text }: { text: string }) {
  const t = useT("peggy");
  const parts = text.split(APP_PATH);
  return (
    <>
      {parts.map((part, index) => {
        if (index % 2 === 0) return part;
        const trail = part.match(/[.,;:!?]+$/)?.[0] ?? "";
        const path = trail ? part.slice(0, -trail.length) : part;
        const ask = path.startsWith("/studio?") ? new URLSearchParams(path.slice(path.indexOf("?") + 1)).get("prompt") : null;
        return (
          <span key={index}>
            {ask ? (
              <Link href={path} className="my-1 inline-flex max-w-full items-center gap-1.5 rounded-full bg-app-ink px-3.5 py-1.5 text-[13px] font-bold text-white no-underline hover:opacity-90">
                <Icon name="sparkle" size={14} className="shrink-0" />
                <span className="truncate">{t("askRex", { request: ask.length > 60 ? `${ask.slice(0, 57)}…` : ask })}</span>
              </Link>
            ) : path === "/home/credits" ? (
              <BuyCreditsButton className="my-1 min-h-0 px-3.5 py-1.5 text-[13px]" label={t("buyCredits")} />
            ) : (
              <Link href={path} className="font-bold text-app-ink underline underline-offset-2">{path}</Link>
            )}
            {trail}
          </span>
        );
      })}
    </>
  );
}

function ActionCard({ action }: { action: PeggyAction }) {
  const t = useT("peggy");
  const body = (
    <>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-app-mint">
        <Icon name={ACTION_ICON[action.tool] ?? "check"} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-app-ink-soft">{t("didThis")}</span>
        <span className="block text-[13.5px] leading-[1.4]">{action.summary}</span>
      </span>
      {action.href && <Icon name="chevRight" size={16} className="shrink-0 text-app-ink-soft" />}
    </>
  );
  const className = "flex max-w-[88%] items-center gap-3 self-start rounded-[16px] border border-app-line bg-white px-3.5 py-2.5 text-app-ink no-underline sm:max-w-[80%]";
  return action.href ? (
    <Link href={action.href} className={cx(className, "hover:border-app-line-strong hover:shadow-sm")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function Stat({ label, value, href, alert = false }: { label: string; value: string | number; href?: string; alert?: boolean }) {
  const locale = useLocale();
  const inner = (
    <>
      <span className="block whitespace-nowrap text-[11.5px] text-app-ink-soft">{label}</span>
      <span className={cx("block whitespace-nowrap text-[16px] font-extrabold leading-tight tracking-[-0.2px]", alert && "text-app-accent")}>{typeof value === "number" ? formatNumber(value, locale) : value}</span>
    </>
  );
  const className = "block min-w-[104px] rounded-[12px] bg-white px-3 py-2 text-app-ink no-underline";
  return (
    <li className="shrink-0">
      {href ? (
        <Link href={href} className={cx(className, "hover:shadow-sm")}>
          {inner}
        </Link>
      ) : (
        <div className={className}>{inner}</div>
      )}
    </li>
  );
}
