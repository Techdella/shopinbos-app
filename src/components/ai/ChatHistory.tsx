"use client";

import { useEffect, useRef, useState } from "react";
import { Spinner, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import type { AiChatAssistant } from "@shared/ai-chats";

// Saved Rex and Peggy chats (/api/app/ai-chats): the conversation saves itself after each answer, and the History
// menu reopens an old one or starts a new one.

interface Creation {
  id: string;
  url: string;
  kind: "logo" | "image" | "edit" | "banner" | "video";
  createdAt: string;
}

type CreationFilter = "all" | "logo" | "image";

interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string;
}

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!response.ok || !json || json.data === undefined) throw new Error(json?.error?.message ?? "That didn't work. Try again.");
  return json.data;
}

/**
 * Saves `messages` as one chat whenever `ready` (not mid-answer) and there is something the seller said. Returns
 * the chat id (null until first saved) and a setter for when an old chat is reopened or a new one started.
 */
export function useChatAutosave(assistant: AiChatAssistant, messages: unknown[], ready: boolean, hasSellerTurn: boolean) {
  const [chatId, setChatId] = useState<string | null>(null);
  const idRef = useRef<string | null>(null);
  idRef.current = chatId;
  const savedLength = useRef(0);

  useEffect(() => {
    if (!ready || !hasSellerTurn || messages.length === savedLength.current) return;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/app/ai-chats", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: idRef.current, assistant, messages }),
        });
        const saved = await readJson<{ id: string }>(response);
        savedLength.current = messages.length;
        if (saved.id !== idRef.current) setChatId(saved.id);
      } catch {
        // History is a convenience; the chat itself keeps working.
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [assistant, messages, ready, hasSellerTurn]);

  /** After reopening a saved chat (or starting a new one): carry on saving into it. */
  function adopt(id: string | null, length: number) {
    savedLength.current = length;
    setChatId(id);
  }
  return { chatId, adopt };
}

/**
 * "History" button with the saved chats: tap one to reopen it, or start a new chat. With `creations` (Rex) a
 * second tab shows the logos and pictures made so far, to download or use again.
 */
export function ChatHistoryMenu({
  assistant,
  currentId,
  onOpen,
  onNew,
  className,
  tone = "light",
  creations = false,
  onUseCreation,
}: {
  assistant: AiChatAssistant;
  currentId: string | null;
  onOpen: (chat: { id: string; messages: unknown[] }) => void;
  onNew: () => void;
  className?: string;
  tone?: "light" | "plain";
  creations?: boolean;
  /** "Use with Rex": attach the picture to the chat box. */
  onUseCreation?: (url: string) => void;
}) {
  const t = useT("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"chats" | "creations">("chats");
  const [filter, setFilter] = useState<CreationFilter>("all");
  const [made, setMade] = useState<Creation[] | null>(null);
  const [picked, setPicked] = useState<Creation | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || tab !== "creations") return;
    let cancelled = false;
    setMade(null);
    setPicked(null);
    fetch(`/api/app/ai-creations?limit=36${filter === "all" ? "" : `&kind=${filter}`}`)
      .then((response) => readJson<Creation[]>(response))
      .then((list) => !cancelled && setMade(list))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : t("chats.failed")));
    return () => {
      cancelled = true;
    };
  }, [open, tab, filter, t]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    fetch(`/api/app/ai-chats?assistant=${assistant}`)
      .then((response) => readJson<ChatSummary[]>(response))
      .then((list) => !cancelled && setChats(list))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : t("chats.failed")));
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      cancelled = true;
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open, assistant, t]);

  async function openChat(id: string) {
    setBusy(id);
    try {
      const chat = await readJson<{ id: string; messages: unknown }>(await fetch(`/api/app/ai-chats/${encodeURIComponent(id)}`));
      onOpen({ id: chat.id, messages: Array.isArray(chat.messages) ? chat.messages : [] });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("chats.failed"));
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(`x${id}`);
    try {
      await readJson(await fetch(`/api/app/ai-chats/${encodeURIComponent(id)}`, { method: "DELETE" }));
      setChats((list) => list?.filter((chat) => chat.id !== id) ?? null);
      if (id === currentId) onNew();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("chats.failed"));
    } finally {
      setBusy(null);
    }
  }

  const when = (iso: string) => new Date(iso).toLocaleString(locale === "en" ? "en-NG" : undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  return (
    <div ref={ref} className={cx("relative", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className={cx("inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-[13.5px] font-bold", tone === "light" ? "hover:bg-app-canvas" : "border border-app-line bg-white hover:border-app-line-strong")}
      >
        <Icon name="clock" size={16} />
        <span className="hidden sm:inline">{t("chats.history")}</span>
        <span className="sr-only sm:hidden">{t("chats.history")}</span>
      </button>
      {open ? (
        <div role="menu" className={cx("absolute right-0 top-full z-40 mt-2 rounded-[18px] border border-app-line bg-white p-1.5 text-left shadow-[0_18px_50px_rgba(22,20,31,0.14)]", creations ? "w-[min(380px,calc(100vw-32px))]" : "w-[min(320px,calc(100vw-32px))]")}>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onNew();
              setOpen(false);
            }}
            className="flex min-h-[44px] w-full items-center gap-2.5 rounded-[12px] px-3 text-[14px] font-bold hover:bg-app-canvas"
          >
            <Icon name="plus" size={16} /> {t("chats.new")}
          </button>
          <div className="my-1 border-t border-app-line" />
          {creations ? (
            <div role="tablist" aria-label={t("chats.history")} className="mx-1 mb-1 grid grid-cols-2 gap-1 rounded-full bg-app-canvas p-1">
              {(["chats", "creations"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={cx("min-h-[34px] rounded-full text-[13px] font-bold", tab === key ? "bg-white shadow-sm" : "text-app-ink-soft")}
                >
                  {key === "chats" ? t("chats.tabChats") : t("chats.tabMade")}
                </button>
              ))}
            </div>
          ) : null}
          {creations && tab === "creations" ? (
            <div className="px-1.5 pb-1.5">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {(["all", "logo", "image"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={filter === key}
                    onClick={() => setFilter(key)}
                    className={cx("min-h-[30px] rounded-full border px-3 text-[12.5px] font-bold", filter === key ? "border-app-ink bg-app-ink text-white" : "border-app-line hover:border-app-line-strong")}
                  >
                    {t(`chats.made.${key}`)}
                  </button>
                ))}
              </div>
              {picked ? (
                <div className="mb-2 rounded-[14px] border border-app-line p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={picked.url} alt={t(`chats.kind.${picked.kind}`)} className="max-h-[220px] w-full rounded-[10px] bg-app-canvas object-contain" />
                  <p className="m-0 mt-1.5 text-[12px] text-app-ink-soft">{t(`chats.kind.${picked.kind}`)} · {when(picked.createdAt)}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {onUseCreation && picked.kind !== "video" ? (
                      <button
                        type="button"
                        onClick={() => {
                          onUseCreation(picked.url);
                          setOpen(false);
                        }}
                        className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full bg-app-ink px-3 text-[12.5px] font-bold text-white"
                      >
                        <Icon name="sparkle" size={13} /> {t("chats.useWithRex")}
                      </button>
                    ) : null}
                    <a href={picked.url} download target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-app-line px-3 text-[12.5px] font-bold text-app-ink no-underline">
                      <Icon name="download" size={13} /> {t("chats.download")}
                    </a>
                    {picked.kind === "logo" ? (
                      <a href="/home/brand-kit" className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-app-line px-3 text-[12.5px] font-bold text-app-ink no-underline">
                        <Icon name="tag" size={13} /> {t("chats.brandKit")}
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {made === null && !error ? (
                <p className="m-0 flex items-center gap-2 px-1.5 py-3 text-[13px] text-app-ink-soft"><Spinner className="h-4 w-4" /> {t("chats.loading")}</p>
              ) : made?.length === 0 ? (
                <p className="m-0 px-1.5 py-3 text-[13px] text-app-ink-soft">{t("chats.madeEmpty")}</p>
              ) : (
                <ul className="m-0 grid max-h-[300px] list-none grid-cols-3 gap-1.5 overflow-y-auto p-0">
                  {made?.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setPicked(item)}
                        aria-label={`${t(`chats.kind.${item.kind}`)}, ${when(item.createdAt)}`}
                        className={cx("relative block aspect-square w-full overflow-hidden rounded-[10px] border-2 bg-app-canvas", picked?.id === item.id ? "border-app-ink" : "border-transparent")}
                      >
                        {item.kind === "video" ? (
                          <video src={item.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.url} alt="" loading="lazy" className={cx("h-full w-full", item.kind === "logo" ? "bg-white object-contain p-1" : "object-cover")} />
                        )}
                        <span className="absolute bottom-1 left-1 rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-bold">{t(`chats.kind.${item.kind}`)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <a href="/home/media" className="mt-2 block px-1.5 text-[12.5px] font-bold text-app-ink underline underline-offset-2">{t("chats.allMedia")}</a>
            </div>
          ) : null}
          {error ? <p className="m-0 px-3 py-2 text-[13px] text-app-danger">{error}</p> : null}
          {creations && tab === "creations" ? null : chats === null && !error ? (
            <p className="m-0 flex items-center gap-2 px-3 py-3 text-[13px] text-app-ink-soft"><Spinner className="h-4 w-4" /> {t("chats.loading")}</p>
          ) : chats?.length === 0 ? (
            <p className="m-0 px-3 py-3 text-[13px] text-app-ink-soft">{t("chats.empty")}</p>
          ) : (
            <ul className="m-0 max-h-[360px] list-none overflow-y-auto p-0">
              {chats?.map((chat) => (
                <li key={chat.id} className={cx("group flex items-center gap-1 rounded-[12px]", chat.id === currentId ? "bg-app-canvas" : "hover:bg-app-canvas")}>
                  <button type="button" role="menuitem" onClick={() => void openChat(chat.id)} disabled={busy !== null} className="min-w-0 flex-1 px-3 py-2.5 text-left">
                    <span className="block truncate text-[13.5px] font-bold">{chat.title}</span>
                    <span className="block text-[12px] text-app-ink-soft">{busy === chat.id ? t("chats.loading") : when(chat.updatedAt)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(chat.id)}
                    disabled={busy !== null}
                    aria-label={t("chats.delete", { title: chat.title })}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-app-ink-soft hover:bg-white hover:text-app-danger"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
