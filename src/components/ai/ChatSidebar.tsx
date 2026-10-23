"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Mascot, Spinner, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { AI_CHAT_GROUPS, aiChatGroup, type AiChatAssistant } from "@shared/ai-chats";
import { CreationsPanel, useChatWhen, useSavedChats } from "./ChatHistory";

// The one chat sidebar for Rex (/studio) and Peggy (/home/peggy), like Claude or ChatGPT: switch assistant, start
// a new chat, search and reopen saved chats grouped by day, and (Rex) his creations and tools. A column on
// desktop that can fold to a thin rail; a slide-over on phones.

const COLLAPSE_KEY = "shopinbos_chat_sidebar_collapsed";

const ASSISTANTS = [
  { id: "rex", href: "/studio", sub: "chats.rexSub" },
  { id: "peggy", href: "/home/peggy", sub: "chats.peggySub" },
] as const;

const REX_TOOLS = [
  { href: "/studio/images", icon: "image", label: "chats.tool.images" },
  { href: "/studio/logo", icon: "palette", label: "chats.tool.logo" },
  { href: "/home/video", icon: "play", label: "chats.tool.video" },
  { href: "/home/brand-kit/book", icon: "book", label: "chats.tool.styleBook" },
  { href: "/home/brand-kit", icon: "tag", label: "chats.tool.brandKit" },
  { href: "/seller/store/builder", icon: "monitor", label: "chats.tool.builder" },
] as const;

export function ChatSidebar({
  assistant,
  currentId,
  refreshKey,
  onOpen,
  onNew,
  onUseCreation,
  mobileOpen,
  onMobileOpen,
  onMobileClose,
  busy = false,
  railOnly = false,
  className,
}: {
  assistant: AiChatAssistant;
  currentId: string | null;
  /** Changes after each save, so new chats and titles show up. */
  refreshKey?: unknown;
  onOpen: (chat: { id: string; messages: unknown[] }) => void;
  onNew: () => void;
  /** Rex: attach one of his creations to the chat box. */
  onUseCreation?: (url: string) => void;
  mobileOpen: boolean;
  onMobileOpen: () => void;
  onMobileClose: () => void;
  /** Mid-answer: opening another chat waits. */
  busy?: boolean;
  /** Fold to the thin rail for now (e.g. while the store preview takes the room); the rail then opens the slide-over. */
  railOnly?: boolean;
  className?: string;
}) {
  const t = useT("common");
  const when = useChatWhen();
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"chats" | "creations">("chats");
  const saved = useSavedChats({ assistant, active: true, refreshKey: `${refreshKey ?? ""}:${currentId ?? ""}`, currentId, onOpen, onNew });
  const { chats, error, remove } = saved;

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // Storage blocked: start open.
    }
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onMobileClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onMobileClose]);

  function toggleCollapsed() {
    setCollapsed((value) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, value ? "0" : "1");
      } catch {
        // Not remembered; fine.
      }
      return !value;
    });
  }

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = (chats ?? []).filter((chat) => !needle || chat.title.toLowerCase().includes(needle));
    const now = new Date();
    return AI_CHAT_GROUPS.map((group) => ({ group, items: list.filter((chat) => aiChatGroup(chat.updatedAt, now) === group) })).filter((entry) => entry.items.length);
  }, [chats, query]);

  function startNew() {
    onNew();
    onMobileClose();
  }

  async function open(id: string) {
    if (busy || id === currentId) return onMobileClose();
    if (await saved.openChat(id)) onMobileClose();
  }

  const isRex = assistant === "rex";

  const panel = (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex shrink-0 items-center gap-1 px-3 pb-2 pt-3">
        <div role="tablist" aria-label={t("chats.assistants")} className="grid min-w-0 flex-1 grid-cols-2 gap-1 rounded-full bg-app-canvas p-1">
          {ASSISTANTS.map((entry) => (
            <Link
              key={entry.id}
              href={entry.href}
              role="tab"
              aria-selected={entry.id === assistant}
              title={t(entry.sub)}
              className={cx(
                "flex min-h-[36px] items-center justify-center gap-1.5 rounded-full px-2 text-[13px] font-extrabold text-app-ink no-underline",
                entry.id === assistant ? "bg-white shadow-sm" : "text-app-ink-soft hover:text-app-ink",
              )}
            >
              <Mascot name={entry.id} alt="" className="h-6 w-6" />
              {entry.id === "rex" ? "Rex" : "Peggy"}
            </Link>
          ))}
        </div>
        <button type="button" onClick={toggleCollapsed} aria-label={t("chats.collapse")} className={cx("hidden h-9 w-9 shrink-0 place-items-center rounded-full text-app-ink-soft hover:bg-app-canvas hover:text-app-ink", !mobileOpen && "lg:grid")}>
          <Icon name="arrowLeft" size={16} />
        </button>
        <button type="button" onClick={onMobileClose} aria-label={t("chats.close")} className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-full text-app-ink-soft hover:bg-app-canvas", !mobileOpen && "lg:hidden")}>
          <Icon name="x" size={16} />
        </button>
      </div>
      <p className="m-0 shrink-0 px-4 pb-2 text-[12px] text-app-ink-soft">{t(isRex ? "chats.rexSub" : "chats.peggySub")}</p>

      <div className="shrink-0 px-3">
        <button
          type="button"
          onClick={startNew}
          disabled={busy}
          className="flex min-h-[42px] w-full items-center gap-2 rounded-full bg-app-ink px-4 text-[14px] font-extrabold text-white hover:bg-black disabled:opacity-55"
        >
          <Icon name="plus" size={16} /> {t("chats.new")}
        </button>
      </div>

      {isRex ? (
        <div role="tablist" aria-label={t("chats.history")} className="mx-3 mt-3 grid shrink-0 grid-cols-2 gap-1 rounded-full bg-app-canvas p-1">
          {(["chats", "creations"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cx("min-h-[32px] rounded-full text-[12.5px] font-bold", tab === key ? "bg-white shadow-sm" : "text-app-ink-soft")}
            >
              {key === "chats" ? t("chats.tabChats") : t("chats.tabMade")}
            </button>
          ))}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-3">
        {isRex && tab === "creations" ? (
          <CreationsPanel
            gridClassName="grid-cols-3"
            onUseCreation={onUseCreation}
            onUsed={onMobileClose}
          />
        ) : (
          <>
            <label className="mx-1 mb-2 flex items-center gap-2 rounded-full border border-app-line bg-white px-3 focus-within:border-app-ink">
              <Icon name="search" size={14} className="shrink-0 text-app-ink-soft" />
              <span className="sr-only">{t("chats.search")}</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("chats.search")} className="h-9 min-w-0 flex-1 bg-transparent text-[13.5px] outline-none" />
            </label>
            {error ? <p className="m-0 px-3 py-2 text-[13px] text-app-danger">{error}</p> : null}
            {chats === null && !error ? (
              <p className="m-0 flex items-center gap-2 px-3 py-3 text-[13px] text-app-ink-soft"><Spinner className="h-4 w-4" /> {t("chats.loadingList")}</p>
            ) : chats?.length === 0 ? (
              <p className="m-0 px-3 py-3 text-[13px] leading-[1.5] text-app-ink-soft">{t("chats.empty")}</p>
            ) : grouped.length === 0 ? (
              <p className="m-0 px-3 py-3 text-[13px] text-app-ink-soft">{t("chats.noMatch")}</p>
            ) : (
              grouped.map(({ group, items }) => (
                <div key={group} className="mb-3">
                  <p className="m-0 px-3 pb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-app-ink-soft">{t(`chats.group.${group}`)}</p>
                  <ul className="m-0 list-none p-0">
                    {items.map((chat) => (
                      <li key={chat.id} className={cx("group flex items-center rounded-[12px]", chat.id === currentId ? "bg-app-canvas" : "hover:bg-app-canvas")}>
                        <button
                          type="button"
                          onClick={() => void open(chat.id)}
                          disabled={saved.busy !== null}
                          aria-current={chat.id === currentId ? "true" : undefined}
                          title={when(chat.updatedAt)}
                          className="min-w-0 flex-1 px-3 py-2 text-left"
                        >
                          <span className={cx("block truncate text-[13.5px]", chat.id === currentId ? "font-extrabold" : "font-semibold")}>{chat.title}</span>
                          {saved.busy === chat.id ? <span className="block text-[11.5px] text-app-ink-soft">{t("chats.loading")}</span> : null}
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(chat.id)}
                          disabled={saved.busy !== null}
                          aria-label={t("chats.delete", { title: chat.title })}
                          className="mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-app-ink-soft opacity-100 hover:bg-white hover:text-app-danger lg:opacity-0 lg:focus:opacity-100 lg:group-hover:opacity-100"
                        >
                          <Icon name="trash" size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </>
        )}
      </div>

      {isRex ? (
        <nav aria-label={t("chats.tools")} className="shrink-0 border-t border-app-line px-2 py-2">
          <p className="m-0 px-3 pb-1 pt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-app-ink-soft">{t("chats.tools")}</p>
          <ul className="m-0 grid list-none grid-cols-2 gap-0.5 p-0">
            {REX_TOOLS.map((tool) => (
              <li key={tool.href}>
                <Link href={tool.href} className="flex min-h-[36px] items-center gap-2 rounded-[10px] px-3 text-[12.5px] font-bold text-app-ink no-underline hover:bg-app-canvas">
                  <Icon name={tool.icon} size={14} className="shrink-0 text-app-ink-soft" />
                  <span className="truncate">{t(tool.label)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );

  return (
    <>
      {collapsed || railOnly ? (
        <aside aria-label={t("chats.history")} className={cx("hidden w-[60px] shrink-0 flex-col items-center gap-2 border-r border-app-line bg-white py-3 lg:flex", className)}>
          <button type="button" onClick={railOnly ? onMobileOpen : toggleCollapsed} aria-label={t("chats.expand")} className="grid h-10 w-10 place-items-center rounded-full hover:bg-app-canvas">
            <Icon name="menu" size={17} />
          </button>
          <button type="button" onClick={onNew} disabled={busy} aria-label={t("chats.new")} className="grid h-10 w-10 place-items-center rounded-full bg-app-ink text-white hover:bg-black disabled:opacity-55">
            <Icon name="plus" size={17} />
          </button>
          {ASSISTANTS.map((entry) => (
            <Link key={entry.id} href={entry.href} aria-label={entry.id === "rex" ? "Rex" : "Peggy"} aria-current={entry.id === assistant ? "page" : undefined} className={cx("grid h-10 w-10 place-items-center rounded-full", entry.id === assistant ? "bg-app-canvas ring-2 ring-app-ink" : "hover:bg-app-canvas")}>
              <Mascot name={entry.id} alt="" className="h-7 w-7" />
            </Link>
          ))}
        </aside>
      ) : (
        <aside aria-label={t("chats.history")} className={cx("hidden w-[272px] shrink-0 border-r border-app-line bg-white lg:flex", className)}>
          {panel}
        </aside>
      )}

      {mobileOpen ? (
        <div className={cx("fixed inset-0 z-50", !railOnly && "lg:hidden")} role="dialog" aria-modal="true" aria-label={t("chats.history")}>
          <button type="button" aria-label={t("chats.close")} className="absolute inset-0 bg-app-ink/30" onClick={onMobileClose} />
          <div className="absolute inset-y-0 left-0 flex w-[min(320px,88vw)] bg-white shadow-[18px_0_50px_rgba(22,20,31,0.16)]">{panel}</div>
        </div>
      ) : null}
    </>
  );
}

/** The header button that opens the chat sidebar on phones and tablets. */
export function ChatSidebarButton({ onClick, className }: { onClick: () => void; className?: string }) {
  const t = useT("common");
  return (
    <button type="button" onClick={onClick} aria-label={t("chats.history")} className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-app-canvas lg:hidden", className)}>
      <Icon name="menu" size={18} />
    </button>
  );
}
