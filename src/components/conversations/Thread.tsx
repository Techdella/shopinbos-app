"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import {
  ATTACHMENT_TYPES,
  MAX_ATTACHMENTS,
  MESSAGE_MAX,
  POLL_MS,
  attachmentProblem,
  groupByDay,
  lastSeenId,
  mergeMessages,
  offPlatformNote,
  quickReplies,
  type AttachmentRef,
  type ContextRef,
  type ContextSnapshot,
  type ConversationSummary,
  type PartnerRole,
  type ThreadMessage,
} from "@/lib/conversations/pure";
import { announceMessagesChanged, messagesApi } from "./client";
import { Attachments, ContextCard, PartnerAvatar, RoleBadge, formatClock } from "./parts";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatDate, formatNumber } from "@shared/i18n";
import type { MessageKey } from "@shared/i18n/catalog";

// One partner chat: bubbles by day, "Seen" receipts, optimistic sending with retry, Enter to send
// (Shift+Enter for a new line), photos/PDFs, linked product/order/booking cards and quick replies.

type Payload = { text: string; attachments: AttachmentRef[]; context: ContextSnapshot | null; clientId: string; previews: Array<string | undefined> };
type LocalMessage = ThreadMessage & { status?: "sending" | "failed"; error?: string; payload?: Payload; previews?: Array<string | undefined> };
type Staged = { key: string; name: string; type: string; size: number; status: "uploading" | "ready" | "failed"; error?: string; ref?: AttachmentRef; previewUrl?: string };
type ThreadMeta = { conversation: ConversationSummary | null; hasMore: boolean; seenUpTo: string | null };

const CONTEXT_GROUP: Record<ContextSnapshot["kind"], MessageKey<"inbox">> = { product: "ctxGroup.product", wholesale_order: "ctxGroup.wholesale", order: "ctxGroup.order", booking: "ctxGroup.booking" };

function profileHref(viewerRole: PartnerRole, partner: ConversationSummary["with"]) {
  if (!partner.slug) return null;
  if (partner.role === "supplier" && viewerRole !== "supplier") return `/suppliers/${partner.slug}`;
  if (partner.role === "logistics_partner" && viewerRole !== "logistics_partner") return `/logistics/partners/${partner.slug}`;
  return null;
}

export function Thread({
  conversation,
  role,
  initialContext,
  filesEnabled,
  onBack,
  onActivity,
  compact = false,
}: {
  conversation: ConversationSummary;
  role: PartnerRole;
  initialContext?: ContextRef | null;
  filesEnabled: boolean;
  onBack?: () => void;
  /** Called after a send or read, so the list can refresh its preview and unread counts. */
  onActivity?: () => void;
  compact?: boolean;
}) {
  const t = useT("inbox", "common");
  const locale = useLocale();
  const id = conversation.id;
  const partner = conversation.with;
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState("");
  const [staged, setStaged] = useState<Staged[]>([]);
  const [context, setContext] = useState<ContextSnapshot | null>(null);
  const [pendingContext, setPendingContext] = useState<ContextRef | null>(initialContext ?? null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [options, setOptions] = useState<ContextSnapshot[] | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stickToBottom = useRef(true);
  const onActivityRef = useRef(onActivity);
  onActivityRef.current = onActivity;

  const confirmedCursor = useCallback((list: LocalMessage[]) => {
    for (let i = list.length - 1; i >= 0; i -= 1) if (!list[i].status) return list[i].createdAt;
    return null;
  }, []);

  const applySeen = (list: LocalMessage[], seenUpTo: string | null) =>
    seenUpTo ? list.map((message) => (message.mine && !message.read && !message.status && message.createdAt <= seenUpTo ? { ...message, read: true } : message)) : list;

  // First page, then poll for anything newer while the tab is visible.
  useEffect(() => {
    let alive = true;
    setMessages([]);
    setLoading(true);
    setLoadError(null);
    stickToBottom.current = true;
    messagesApi<ThreadMessage[], ThreadMeta>(`/api/conversations/${id}/messages`)
      .then((body) => {
        if (!alive) return;
        setMessages(applySeen(body.data, body.meta?.seenUpTo ?? null));
        setHasMore(Boolean(body.meta?.hasMore));
        if (conversation.unread) {
          announceMessagesChanged();
          onActivityRef.current?.();
        }
      })
      .catch((error: Error) => alive && setLoadError(error.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  useEffect(() => {
    if (loading || loadError) return;
    let alive = true;
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      const after = confirmedCursor(messagesRef.current);
      const url = after ? `/api/conversations/${id}/messages?after=${encodeURIComponent(after)}` : `/api/conversations/${id}/messages`;
      void messagesApi<ThreadMessage[], ThreadMeta>(url)
        .then((body) => {
          if (!alive) return;
          const incoming = body.data.filter((message) => !message.mine || !messagesRef.current.some((local) => local.id === message.id));
          setMessages((current) => applySeen(mergeMessages(current, incoming), body.meta?.seenUpTo ?? null));
          if (body.data.some((message) => !message.mine)) {
            announceMessagesChanged();
            onActivityRef.current?.();
          }
        })
        .catch(() => null);
    };
    const timer = window.setInterval(poll, POLL_MS.thread);
    document.addEventListener("visibilitychange", poll);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [id, loading, loadError, confirmedCursor]);

  // Keep the newest message in view unless the person scrolled up to read.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // A product/order/booking handed in from a "Message supplier" button: show it as a chip ready to send.
  useEffect(() => {
    if (!pendingContext) return;
    let alive = true;
    messagesApi<ContextSnapshot[]>(`/api/conversations/${id}/context`)
      .then((body) => {
        if (!alive) return;
        setOptions(body.data);
        const match = body.data.find((item) => item.kind === pendingContext.kind && item.id === pendingContext.id);
        setContext(match ?? { kind: pendingContext.kind, id: pendingContext.id, label: pendingContext.kind === "product" ? t("pt.thisProduct") : t("pt.linkedItem") });
      })
      .catch(() => alive && setContext({ kind: pendingContext.kind, id: pendingContext.id, label: t("pt.linkedItem") }))
      .finally(() => alive && setPendingContext(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, pendingContext]);

  async function loadOlder() {
    const first = messages.find((message) => !message.status);
    if (!first) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const before = el ? el.scrollHeight - el.scrollTop : 0;
    try {
      const body = await messagesApi<ThreadMessage[], ThreadMeta>(`/api/conversations/${id}/messages?before=${encodeURIComponent(first.createdAt)}`);
      stickToBottom.current = false;
      setMessages((current) => mergeMessages(body.data, current));
      setHasMore(Boolean(body.meta?.hasMore));
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - before;
      });
    } catch {
      // The button stays; they can try again.
    } finally {
      setLoadingOlder(false);
    }
  }

  async function deliver(payload: Payload) {
    const localId = `local-${payload.clientId}`;
    const local: LocalMessage = {
      id: localId,
      mine: true,
      text: payload.text,
      createdAt: new Date().toISOString(),
      read: false,
      readAt: null,
      attachments: payload.attachments.map((file, index) => ({ name: file.name, type: file.type, size: file.size, url: "", previewUrl: payload.previews[index] })),
      context: payload.context,
      status: "sending",
      payload,
    };
    stickToBottom.current = true;
    setMessages((current) => mergeMessages(current.filter((message) => message.id !== localId), [local]));
    try {
      const body = await messagesApi<ThreadMessage>(`/api/conversations/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ text: payload.text, attachments: payload.attachments, context: payload.context ? { kind: payload.context.kind, id: payload.context.id } : null, clientId: payload.clientId }),
      });
      setMessages((current) => mergeMessages(current.filter((message) => message.id !== localId), [body.data]));
      announceMessagesChanged();
      onActivityRef.current?.();
    } catch (error) {
      setMessages((current) => current.map((message) => (message.id === localId ? { ...message, status: "failed", error: (error as Error).message } : message)));
    }
  }

  function send() {
    const trimmed = text.trim();
    const ready = staged.filter((file) => file.status === "ready" && file.ref);
    if (staged.some((file) => file.status === "uploading")) {
      setComposerError(t("pt.waitUpload"));
      return;
    }
    if (!trimmed && !ready.length && !context) return;
    if (trimmed.length > MESSAGE_MAX) {
      setComposerError(t("pt.tooLong", { max: formatNumber(MESSAGE_MAX, locale) }));
      return;
    }
    setComposerError(null);
    void deliver({
      text: trimmed,
      attachments: ready.map((file) => file.ref!),
      context,
      clientId: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      previews: ready.map((file) => file.previewUrl),
    });
    setText("");
    setStaged([]);
    setContext(null);
    inputRef.current?.focus();
  }

  function retry(message: LocalMessage) {
    if (message.payload) void deliver(message.payload);
  }

  function discard(message: LocalMessage) {
    setMessages((current) => current.filter((item) => item.id !== message.id));
  }

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const room = MAX_ATTACHMENTS - staged.filter((file) => file.status !== "failed").length;
    const files = [...list].slice(0, Math.max(0, room));
    if (list.length > files.length) setComposerError(t("pt.maxFiles", { max: MAX_ATTACHMENTS }));
    for (const file of files) {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 6)}`;
      const problem = attachmentProblem(file);
      const previewUrl = file.type.startsWith("image/") && !problem ? URL.createObjectURL(file) : undefined;
      setStaged((current) => [...current, { key, name: file.name, type: file.type, size: file.size, status: problem ? "failed" : "uploading", error: problem ?? undefined, previewUrl }]);
      if (problem) continue;
      const form = new FormData();
      form.set("file", file);
      messagesApi<AttachmentRef>(`/api/conversations/${id}/files`, { method: "POST", body: form })
        .then((body) => setStaged((current) => current.map((item) => (item.key === key ? { ...item, status: "ready", ref: { path: body.data.path, name: body.data.name, type: body.data.type, size: body.data.size } } : item))))
        .catch((error: Error) => setStaged((current) => current.map((item) => (item.key === key ? { ...item, status: "failed", error: error.message } : item))));
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function openLinks() {
    setLinkOpen((open) => !open);
    if (options || linkOpen) return;
    setOptionsError(null);
    try {
      setOptions((await messagesApi<ContextSnapshot[]>(`/api/conversations/${id}/context`)).data);
    } catch (error) {
      setOptionsError((error as Error).message);
    }
  }

  const visible = messages;
  const seenId = lastSeenId(visible.filter((message) => !message.status));
  const groups = groupByDay(visible).map((group) => ({
    ...group,
    label: group.label === "Today" ? t("time.today") : group.label === "Yesterday" ? t("time.yesterday") : locale === "en" ? group.label : formatDate(group.items[0].createdAt, locale, { weekday: "short", day: "numeric", month: "short" }),
  }));
  const pair = `${role}>${partner.role}`;
  const replies = quickReplies(role, partner.role).map((reply, index) => t.dynamic(`qr.${pair}.${index}`, reply));
  const profile = profileHref(role, partner);
  const canSend = Boolean(text.trim() || staged.some((file) => file.status === "ready") || context);
  // Chats with a delivery partner: a gentle, non-blocking note while the draft shares contact or payment details.
  const draftNote = offPlatformNote(text, [role, partner.role]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-white">
      <header className="flex shrink-0 items-center gap-3 border-b border-app-line px-3 py-2.5 sm:px-4">
        {onBack && (
          <button type="button" onClick={onBack} aria-label={t("thread.back")} className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-app-canvas", !compact && "lg:hidden")}>
            <Icon name="arrowLeft" size={18} />
          </button>
        )}
        <PartnerAvatar name={partner.name} logoUrl={partner.logoUrl} size={38} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="m-0 truncate text-[15px] font-extrabold">{partner.name}</h2>
            <RoleBadge role={partner.role} />
          </div>
          <div className="truncate text-[12.5px] text-app-ink-soft">{partner.city ? t("pt.cityOn", { city: partner.city }) : t("pt.on")}</div>
        </div>
        {profile && (
          <Link href={profile} className="hidden min-h-[34px] shrink-0 items-center rounded-full border border-app-line px-3 text-[12.5px] font-bold text-app-ink no-underline hover:border-app-line-strong sm:inline-flex">
            {t("pt.profile")}
          </Link>
        )}
      </header>

      <div
        ref={scrollRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto bg-app-canvas/50 px-3 py-4 sm:px-4"
        aria-live="polite"
        aria-busy={loading}
      >
        {hasMore && (
          <div className="mb-3 text-center">
            <button type="button" onClick={() => void loadOlder()} disabled={loadingOlder} className="min-h-[34px] rounded-full border border-app-line bg-white px-3.5 text-[12.5px] font-bold text-app-ink hover:border-app-line-strong disabled:opacity-60">
              {loadingOlder ? t("loading") : t("pt.earlier")}
            </button>
          </div>
        )}
        {loading ? (
          <div className="grid gap-3 p-2" aria-label={t("pt.loadingMessages")}>
            {[60, 40, 70].map((width, index) => (
              <div key={index} className={cx("h-10 animate-pulse rounded-[16px] bg-app-line/60", index % 2 ? "ml-auto" : "")} style={{ width: `${width}%` }} />
            ))}
          </div>
        ) : loadError ? (
          <p role="alert" className="m-0 p-6 text-center text-[14px] font-semibold text-app-danger">{loadError}</p>
        ) : visible.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <PartnerAvatar name={partner.name} logoUrl={partner.logoUrl} size={56} />
            <p className="mb-0 mt-3 text-[14.5px] font-extrabold">{t("pt.sayHello", { name: partner.name })}</p>
            <p className="mb-0 mt-1 text-[13.5px] text-app-ink-soft">{t("pt.helloBody")}</p>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <div className="my-3 flex items-center gap-3 text-[11.5px] font-bold text-app-ink-faint">
                <span className="h-px flex-1 bg-app-line" />
                {group.label}
                <span className="h-px flex-1 bg-app-line" />
              </div>
              <div className="grid gap-1.5">
                {group.items.map((message) => (
                  <Bubble key={message.id} message={message} role={role} partnerRole={partner.role} seen={message.id === seenId} onRetry={() => retry(message)} onDiscard={() => discard(message)} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        className="shrink-0 border-t border-app-line bg-white px-3 pb-3 pt-2 sm:px-4"
      >
        {!text.trim() && !staged.length && !context && replies.length > 0 && (
          <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-0.5" aria-label={t("pt.quickReplies")}>
            {replies.map((reply) => (
              <button
                key={reply}
                type="button"
                onClick={() => {
                  setText(reply);
                  inputRef.current?.focus();
                }}
                className="shrink-0 whitespace-nowrap rounded-full border border-app-line bg-white px-3 py-1.5 text-[12.5px] font-semibold text-app-ink hover:border-app-line-strong"
              >
                {reply}
              </button>
            ))}
          </div>
        )}

        {(context || staged.length > 0) && (
          <div className="mb-2 grid gap-2">
            {context && <ContextCard context={context} viewerRole={role} onRemove={() => setContext(null)} />}
            {staged.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {staged.map((file) => (
                  <div key={file.key} className={cx("relative flex max-w-[220px] items-center gap-2 rounded-[12px] border px-2 py-1.5 text-[12.5px]", file.status === "failed" ? "border-app-danger/40 bg-app-danger-tint" : "border-app-line bg-white")}>
                    {file.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={file.previewUrl} alt="" className="h-8 w-8 rounded-[8px] object-cover" />
                    ) : (
                      <Icon name="file" size={16} />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{file.name}</span>
                      <span className={cx("block truncate", file.status === "failed" ? "text-app-danger" : "text-app-ink-soft")}>
                        {file.status === "uploading" ? t("pt.uploading") : file.status === "failed" ? file.error ?? t("pt.uploadFailed") : t("pt.ready")}
                      </span>
                    </span>
                    <button type="button" aria-label={t("ctx.remove", { label: file.name })} onClick={() => setStaged((current) => current.filter((item) => item.key !== file.key))} className="grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-app-canvas">
                      <Icon name="x" size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {draftNote && <OffAppNote note={draftNote} className="mb-2" />}

        {composerError && <p role="alert" className="m-0 mb-2 text-[12.5px] font-semibold text-app-danger">{composerError}</p>}

        <div className="relative flex items-end gap-1.5">
          <input ref={fileRef} type="file" multiple accept={ATTACHMENT_TYPES.join(",")} className="hidden" onChange={(event) => void addFiles(event.target.files)} />
          <button
            type="button"
            onClick={() => (filesEnabled ? fileRef.current?.click() : setComposerError(t("pt.filesSoon")))}
            aria-label={t("pt.attach")}
            title={t("pt.attach")}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-app-ink-soft hover:bg-app-canvas hover:text-app-ink"
          >
            <Icon name="paperclip" size={18} />
          </button>
          <button
            type="button"
            onClick={() => void openLinks()}
            aria-label={t("pt.link")}
            aria-expanded={linkOpen}
            title={t("pt.link")}
            className={cx("grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-app-canvas hover:text-app-ink", linkOpen ? "bg-app-canvas text-app-ink" : "text-app-ink-soft")}
          >
            <Icon name="link" size={18} />
          </button>
          <label htmlFor={`composer-${id}`} className="sr-only">{t("partner.messageName", { name: partner.name })}</label>
          <textarea
            id={`composer-${id}`}
            ref={inputRef}
            value={text}
            rows={1}
            maxLength={MESSAGE_MAX}
            onChange={(event) => {
              setText(event.target.value);
              const el = event.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              }
            }}
            placeholder={t("partner.write")}
            className="max-h-[140px] min-h-[44px] min-w-0 flex-1 resize-none rounded-[22px] border border-app-line bg-white px-4 py-[10px] text-[16px] leading-[1.4] outline-none placeholder:text-app-ink-faint focus:border-app-ink sm:text-[15px]"
          />
          <VoiceInputButton variant="icon" value={text} onChange={setText} maxLength={MESSAGE_MAX} context="a message to a business partner" />
          <button type="submit" disabled={!canSend} aria-label={t("send")} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-app-accent text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45">
            <Icon name="send" size={17} />
          </button>

          {linkOpen && (
            <div className="absolute bottom-full left-0 z-20 mb-2 max-h-[320px] w-full max-w-[380px] overflow-y-auto rounded-[18px] border border-app-line bg-white p-1.5 shadow-[0_20px_40px_-20px_rgba(22,20,31,0.35)]">
              {optionsError ? (
                <p className="m-0 p-3 text-[13px] text-app-danger">{optionsError}</p>
              ) : !options ? (
                <p className="m-0 p-3 text-[13px] text-app-ink-soft">{t("loading")}</p>
              ) : options.length === 0 ? (
                <p className="m-0 p-3 text-[13px] text-app-ink-soft">{t("pt.nothingToLink")}</p>
              ) : (
                (Object.keys(CONTEXT_GROUP) as Array<ContextSnapshot["kind"]>).map((kind) => {
                  const items = options.filter((item) => item.kind === kind);
                  if (!items.length) return null;
                  return (
                    <div key={kind} className="py-1">
                      <div className="px-2.5 pb-1 pt-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-app-ink-faint">{t(CONTEXT_GROUP[kind])}</div>
                      {items.map((item) => (
                        <button
                          key={`${item.kind}-${item.id}`}
                          type="button"
                          onClick={() => {
                            setContext(item);
                            setLinkOpen(false);
                            inputRef.current?.focus();
                          }}
                          className="flex w-full min-w-0 items-center gap-2.5 rounded-[12px] px-2.5 py-2 text-left hover:bg-app-canvas"
                        >
                          {item.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.image} alt="" className="h-9 w-9 shrink-0 rounded-[8px] object-cover" />
                          ) : (
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-app-canvas text-app-ink-soft"><Icon name={kind === "booking" ? "truck" : kind === "product" ? "bag" : "package"} size={16} /></span>
                          )}
                          <span className="min-w-0">
                            <span className="block truncate text-[13.5px] font-bold">{item.label}</span>
                            {item.sub && <span className="block truncate text-[12px] text-app-ink-soft">{item.sub}</span>}
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
        {!compact && <p className="m-0 mt-1.5 hidden text-[11.5px] text-app-ink-faint sm:block">{t("pt.enterHint")}</p>}
      </form>
    </div>
  );
}

/** The friendly "keep it in Shopinbos" note: shown, never blocking. */
function OffAppNote({ note, className }: { note: string; className?: string }) {
  return (
    <p className={cx("m-0 flex max-w-[85%] items-start gap-1.5 rounded-[12px] bg-app-peach/60 px-2.5 py-1.5 text-[12px] leading-[1.4] text-app-ink sm:max-w-[75%]", className)}>
      <Icon name="info" size={13} className="mt-[2px] shrink-0" />
      <span>{note}</span>
    </p>
  );
}

function Bubble({ message, role, partnerRole, seen, onRetry, onDiscard }: { message: LocalMessage; role: PartnerRole; partnerRole: PartnerRole; seen: boolean; onRetry: () => void; onDiscard: () => void }) {
  const t = useT("inbox", "common");
  const locale = useLocale();
  const mine = message.mine;
  const note = message.warning ?? offPlatformNote(message.text, [role, partnerRole]);
  return (
    <div className={cx("flex flex-col", mine ? "items-end" : "items-start")}>
      <div
        className={cx(
          "grid max-w-[85%] gap-2 rounded-[18px] px-3.5 py-2.5 text-[14px] leading-[1.45] sm:max-w-[75%]",
          mine ? "rounded-br-[6px] bg-app-ink text-white" : "rounded-bl-[6px] border border-app-line bg-white text-app-ink",
          message.status === "sending" && "opacity-70",
          message.status === "failed" && "ring-2 ring-app-danger/50",
        )}
      >
        {message.context && <ContextCard context={message.context} viewerRole={role} mine={mine} />}
        <Attachments files={message.attachments} mine={mine} />
        {message.text && <div className="whitespace-pre-wrap break-words">{message.text}</div>}
        <div className={cx("text-right text-[11px]", mine ? "text-white/60" : "text-app-ink-faint")}>
          {message.status === "sending" ? t("msg.sending") : formatClock(message.createdAt, locale)}
        </div>
      </div>
      {note && <OffAppNote note={note} className="mt-1" />}
      {message.status === "failed" && (
        <div className="mt-1 flex items-center gap-2 text-[12px]">
          <span className="font-semibold text-app-danger">{message.error ?? t("pt.notSent")}</span>
          <button type="button" onClick={onRetry} className="font-extrabold text-app-ink underline">{t("pt.retry")}</button>
          <button type="button" onClick={onDiscard} className="text-app-ink-soft underline">{t("delete")}</button>
        </div>
      )}
      {seen && !message.status && (
        <div className="mt-0.5 flex items-center gap-1 text-[11.5px] font-semibold text-app-ink-soft">
          <Icon name="check" size={12} /> {t("msgr.seen")}{message.readAt ? ` ${formatClock(message.readAt, locale)}` : ""}
        </div>
      )}
    </div>
  );
}
