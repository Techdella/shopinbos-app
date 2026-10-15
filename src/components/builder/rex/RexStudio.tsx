"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { DeviceToggle, Mascot, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { StoreLaunchBillingModal, type StoreLaunchPricing } from "@/components/billing/StoreLaunchBillingModal";
import type { StoreEditorSnapshot } from "@/lib/store-templates";
import { themeLibraryEntry } from "@/lib/store-templates/theme-library";
import { computeStoreHealth, draftHealthFacts, rexSuggestionChips, type StorePageKey, type StorePageStatus } from "@/lib/store-health";
import type { RexVersionSummary } from "@/lib/ai/rex/studio-versions";
import { cardNote } from "@/lib/ai/rex/cards";
import { isPreviewRequest } from "@/lib/ai/rex/starters";
import { askRex, buildWholeStore, publishDraft, restoreVersion } from "./api";
import { RexChat } from "./RexChat";
import { guessRexJob, type RexJob } from "@shared/rex-progress";
import { ChatHistoryMenu, useChatAutosave } from "@/components/ai/ChatHistory";
import { RexPreview } from "./RexPreview";
import { RexSidePanel } from "./RexSidePanel";
import type { ChatMessage, RexStudioProps } from "./types";

// Rex Studio, chat first: the seller talks to Rex (pictures, logos, videos, store edits, copy, marketing) and
// the store preview opens beside the chat (full screen on phones) when they ask for it or Rex changes the
// store. The preview keeps the page tabs, desktop/mobile, versions with undo, and Publish.

const BUILD_REQUEST = /^(please\s+)?(build|create|generate|make)\s+(me\s+)?(my|a|the)?\s*(whole|full|complete|entire|new)?\s*(online\s+)?(store|shop)\b/i;
const MAX_HISTORY = 20;

let seq = 0;
const nextId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Tool page names to the preview's tabs. */
function previewTab(page: string | null | undefined): StorePageKey | null {
  if (!page) return null;
  if (page === "categories" || page === "products" || page === "collections") return "collections";
  if (page === "home" || page === "product" || page === "about" || page === "faq") return page;
  return "home";
}

type Words = ReturnType<typeof useT<["builder", "common"]>>;

// Offers are sent to Rex as written (in English, which the build/preview matchers read); RexChat shows them translated.
function greeting(t: Words, firstName: string, fromOnboarding: boolean, draftSaved: boolean): Extract<ChatMessage, { role: "rex" }> {
  if (!draftSaved) {
    return {
      id: "hello",
      role: "rex",
      text: t("rex.hi.new", { name: firstName }),
      offer: "Build my store",
    };
  }
  return {
    id: "hello",
    role: "rex",
    text: fromOnboarding ? t("rex.hi.onboarded", { name: firstName }) : t("rex.hi.back", { name: firstName }),
    offer: "Show me my store",
  };
}

export function RexStudio(props: RexStudioProps) {
  const t = useT("builder", "common");
  const [draft, setDraft] = useState<StoreEditorSnapshot>(props.initialDraft);
  const [draftSaved, setDraftSaved] = useState(props.draftSaved);
  const [versions, setVersions] = useState<RexVersionSummary[]>(props.versions);
  const [messages, setMessages] = useState<ChatMessage[]>([greeting(t, props.firstName, props.fromOnboarding, props.draftSaved)]);
  const [busy, setBusy] = useState<null | "chat" | "build">(null);
  const [busyJob, setBusyJob] = useState<RexJob | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [tab, setTab] = useState<StorePageKey>("home");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [previewOpen, setPreviewOpen] = useState(props.openPreview);
  const [panelOpen, setPanelOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [live, setLive] = useState(props.live);
  const [unpublished, setUnpublished] = useState(props.hasUnpublishedChanges);
  const [pricing, setPricing] = useState<StoreLaunchPricing | null>(null);
  const [toast, setToast] = useState<{ text: string; href?: string } | null>(null);
  const [isPhone, setIsPhone] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  const closePreviewRef = useRef<HTMLButtonElement>(null);

  // Phones always preview at phone width (the desktop toggle is hidden there).
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setIsPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (props.fromOnboarding) {
      try {
        window.localStorage.removeItem("shopinbos:first-run-walkthrough:seller");
      } catch {
        // Storage can be blocked; the walkthrough flag is only a convenience.
      }
    }
  }, [props.fromOnboarding]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!toolsOpen) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !toolsRef.current?.contains(event.target as Node)) setToolsOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [toolsOpen]);

  // Escape closes the preview (it covers the chat on phones); focus moves to its close button when it opens.
  useEffect(() => {
    if (!previewOpen) return;
    closePreviewRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !panelOpen && !pricing) setPreviewOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [previewOpen, panelOpen, pricing]);

  const facts = useMemo(() => ({ ...props.healthFacts, draft: draftHealthFacts(draft) }), [props.healthFacts, draft]);
  const health = useMemo(() => computeStoreHealth(facts), [facts]);
  const pages = facts.draft.pages;
  const page = pages.find((entry) => entry.key === tab) ?? pages[0];
  const lastSeller = [...messages].reverse().find((message) => message.role === "seller")?.text;
  const chips = useMemo(() => rexSuggestionChips(facts, { hasDraft: draftSaved, exclude: lastSeller ? [lastSeller] : [] }), [facts, draftSaved, lastSeller]);
  const themeName = themeLibraryEntry(draft.templateId)?.name ?? (draft.templateId === props.initialDraft.templateId ? props.themeName : draft.templateName);
  const busyLabel = busy === "build" ? t("rex.st.building") : t("rex.st.working");
  const { chatId, adopt } = useChatAutosave("rex", messages, busy === null, messages.some((message) => message.role === "seller"));

  /** Reopens a saved chat (Rex carries on from it; undo buttons of old versions still work). */
  function openChat(chat: { id: string; messages: unknown[] }) {
    const stamp = Date.now();
    const loaded = chat.messages
      .filter((entry): entry is ChatMessage => Boolean(entry) && typeof entry === "object" && ((entry as ChatMessage).role === "seller" || (entry as ChatMessage).role === "rex") && typeof (entry as ChatMessage).text === "string")
      .map((entry, index) => ({ ...entry, id: entry.id === "hello" ? "hello" : `h${stamp}-${index}` }));
    if (!loaded.length) return;
    setMessages(loaded);
    adopt(chat.id, loaded.length);
  }

  function newChat() {
    const fresh = [greeting(t, props.firstName, false, draftSaved)];
    setMessages(fresh);
    adopt(null, fresh.length);
  }

  /** The conversation for Rex: his words plus a note of what each card made, and the seller's photo links. */
  function history() {
    return messages
      .filter((message) => message.id !== "hello" && !(message.role === "rex" && message.tone === "error"))
      .map((message) =>
        message.role === "seller"
          ? { role: "user" as const, content: message.images?.length ? `${message.text}\n[Photos attached: ${message.images.join(" ")}]` : message.text }
          : { role: "assistant" as const, content: [message.text, ...(message.cards ?? []).map(cardNote)].filter(Boolean).join("\n") },
      )
      .filter((turn) => turn.content.trim())
      .slice(-MAX_HISTORY);
  }

  function rexSays(message: Omit<Extract<ChatMessage, { role: "rex" }>, "id" | "role">) {
    setMessages((prev) => [...prev, { id: nextId(), role: "rex", ...message }]);
  }

  function showPreview(target?: string | null) {
    const key = previewTab(target);
    if (key) setTab(key);
    setPreviewOpen(true);
  }

  function takeDraft(next: StoreEditorSnapshot, nextVersions?: RexVersionSummary[] | null) {
    setDraft(next);
    setDraftSaved(true);
    setUnpublished(true);
    if (nextVersions) setVersions(nextVersions);
  }

  async function send(text: string, imageUrls: string[] = [], videoStills: string[] = []) {
    const request = text.trim();
    if (!request || busy) return;
    const past = history();
    setMessages((prev) => [...prev, { id: nextId(), role: "seller", text: request, ...(imageUrls.length ? { images: imageUrls } : {}) }]);

    if (!imageUrls.length && isPreviewRequest(request)) {
      showPreview("home");
      rexSays({ text: draftSaved ? t("rex.st.hereDraft") : t("rex.st.hereStart") });
      return;
    }

    if (BUILD_REQUEST.test(request)) {
      setBusyJob("build");
      setBusy("build");
      try {
        const result = await buildWholeStore({
          request,
          history: past,
          brief: props.buildContext.brief,
          brandContext: { category: props.buildContext.category, businessDescription: props.buildContext.businessDescription },
          templateContext: props.buildContext.template,
        });
        takeDraft(result.draft, result.versions);
        setTab("home");
        setPreviewOpen(true);
        rexSays({
          text: [t("rex.st.built"), ...result.notes].join("\n\n"),
          changes: [
            t("rex.st.designed", { count: result.pages.length }),
            result.products.length ? t("rex.st.samples", { count: result.products.length }) : t("rex.st.keptProducts"),
            result.images.hero ? t("rex.st.banner") : "",
            result.images.product ? t("rex.st.productPhoto") : "",
          ].filter(Boolean),
          version: result.version ?? null,
          undoTo: result.undoTo ?? null,
        });
      } catch (error) {
        rexSays({ text: error instanceof Error ? error.message : t("rex.st.buildFailed"), tone: "error" });
      } finally {
        setBusy(null);
      }
      return;
    }

    setBusyJob(guessRexJob(request, imageUrls.length > 0));
    setBusy("chat");
    try {
      const photos = imageUrls.filter((url) => !videoStills.includes(url));
      const attachedNote = [
        photos.length ? `[Photos attached: ${photos.join(" ")}]` : "",
        videoStills.length ? `[Stills from a video the seller attached: ${videoStills.join(" ")}]` : "",
      ].filter(Boolean);
      const messagesForRex = [...past, { role: "user" as const, content: [request, ...attachedNote].join("\n") }];
      const result = await askRex({ messages: messagesForRex, imageUrls });
      if (result.draft) takeDraft(result.draft, result.versions);
      rexSays({ text: result.text, cards: result.cards });
      // Rex changed the store or was asked to show it: open the preview on the page he worked on.
      const storeCard = [...result.cards].reverse().find((card) => card.type === "store" || card.type === "preview");
      if (result.draft || storeCard) showPreview(storeCard && "page" in storeCard ? storeCard.page : null);
    } catch (error) {
      rexSays({ text: error instanceof Error ? error.message : t("rex.st.answerFailed"), tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function undo(undoTo: string) {
    if (undoingId) return false;
    setUndoingId(undoTo);
    try {
      const result = await restoreVersion(undoTo);
      setDraft(result.draft);
      setVersions(result.versions);
      setUnpublished(true);
      setMessages((prev) => prev.map((entry) => (entry.role === "rex" && entry.undoTo === undoTo ? { ...entry, undone: true } : entry)));
      rexSays({ text: t("rex.st.undone", { n: result.restored.n }) });
      return true;
    } catch (error) {
      rexSays({ text: error instanceof Error ? error.message : t("rex.st.undoFailed"), tone: "error" });
      return false;
    } finally {
      setUndoingId(null);
    }
  }

  async function restore(version: RexVersionSummary) {
    if (restoringId) return;
    setRestoringId(version.id);
    try {
      const result = await restoreVersion(version.id);
      setDraft(result.draft);
      setVersions(result.versions);
      setUnpublished(true);
      setToast({ text: t("rex.st.restored", { n: result.restored.n }) });
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : t("rex.st.restoreFailed") });
    } finally {
      setRestoringId(null);
    }
  }

  async function publish() {
    if (publishing || busy) return;
    setPublishing(true);
    try {
      const result = await publishDraft();
      if (result.ok) {
        setLive(true);
        setUnpublished(false);
        setToast({ text: t("rex.st.published", { host: props.storeHost }), href: props.storeUrl });
      } else if ("billing" in result) {
        setPricing(result.billing);
      } else {
        setToast({ text: result.message });
        if (result.blockers.some((blocker) => /title and meta description/i.test(blocker))) {
          rexSays({
            text: t("rex.st.needSeo"),
            offer: "Write the search titles and descriptions for every page",
          });
          if (isPhone) setPreviewOpen(false);
        }
      }
    } finally {
      setPublishing(false);
    }
  }

  function writePage(target: StorePageStatus) {
    if (isPhone) setPreviewOpen(false);
    void send(target.key === "home" ? "Write my homepage." : `Write my ${target.label} page.`);
  }

  function viewPage(target: StorePageStatus) {
    setTab(target.key);
    setPanelOpen(false);
    setPreviewOpen(true);
  }

  const publishButton = (
    <button
      type="button"
      onClick={() => void publish()}
      disabled={publishing || busy !== null}
      className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full bg-app-accent px-4 text-[13.5px] font-bold text-white hover:brightness-95 disabled:opacity-60"
    >
      {publishing ? t("rex.st.publishing") : t("rex.st.publish")}
    </button>
  );

  const tabs = (
    <nav aria-label={t("rex.st.storePages")} className="min-w-0">
      <ul className="m-0 flex list-none gap-1 overflow-x-auto rounded-full bg-app-canvas p-1 [scrollbar-width:none]">
        {pages.map((entry) => (
          <li key={entry.key} className="shrink-0">
            <button
              type="button"
              aria-current={entry.key === tab ? "page" : undefined}
              onClick={() => setTab(entry.key)}
              className={cx(
                "min-h-[36px] whitespace-nowrap rounded-full px-3.5 text-[13.5px] font-bold",
                entry.key === tab ? "bg-white shadow-[0_1px_3px_rgba(22,20,31,0.12)]" : "text-app-ink-soft hover:text-app-ink",
              )}
            >
              {t.dynamic(`rex.page.${entry.key}`, entry.label)}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );

  const deviceToggle = <DeviceToggle value={device} onChange={setDevice} />;

  const side = (
    <RexSidePanel
      health={health}
      pages={pages}
      versions={versions}
      busy={busy !== null}
      restoringId={restoringId}
      storeName={props.store.name}
      logoUrl={props.store.logoUrl ?? null}
      tokens={draft.themeTokens}
      onAskRex={(prompt) => {
        setPanelOpen(false);
        if (isPhone) setPreviewOpen(false);
        void send(prompt);
      }}
      onViewPage={viewPage}
      onRestore={(version) => void restore(version)}
    />
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-app-canvas font-app text-app-ink">
      <header className="shrink-0 border-b border-app-line bg-white">
        <div className="flex min-h-[64px] items-center gap-2 px-3 sm:gap-3 sm:px-4">
          <Link href="/home/store" aria-label={t("rex.st.exit")} className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-app-canvas">
            <Icon name="arrowLeft" size={18} />
          </Link>
          <Mascot name="rex" alt="" className="hidden h-9 w-9 shrink-0 sm:block" />
          <div className="min-w-0 flex-1">
            <h1 className="m-0 truncate text-[16px] font-extrabold leading-tight">Rex Studio</h1>
            <p className="m-0 truncate text-[12.5px] text-app-ink-soft">
              {props.store.name} · {t("rex.st.theme", { name: themeName })}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <ChatHistoryMenu assistant="rex" currentId={chatId} onOpen={openChat} onNew={newChat} />
            <div ref={toolsRef} className="relative hidden sm:block">
              <button
                type="button"
                aria-expanded={toolsOpen}
                aria-haspopup="menu"
                onClick={() => setToolsOpen((open) => !open)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-[13.5px] font-bold hover:bg-app-canvas"
              >
                <Icon name="wand" size={16} />
                <span className="hidden xl:inline">{t("rex.st.tools")}</span>
                <span className="sr-only xl:hidden">{t("rex.st.tools")}</span>
                <Icon name="chevDown" size={14} />
              </button>
              {toolsOpen ? (
                <div role="menu" className="absolute right-0 top-full z-30 mt-2 max-h-[calc(100dvh-140px)] w-[240px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-[18px] border border-app-line bg-white p-1.5 shadow-[0_18px_50px_rgba(22,20,31,0.14)]">
                  <Link role="menuitem" href="/studio/images" className="flex min-h-[44px] items-center gap-2.5 rounded-[12px] px-3 text-[14px] font-bold hover:bg-app-canvas">
                    <Icon name="image" size={16} /> {t("rex.makeImages")}
                  </Link>
                  <Link role="menuitem" href="/studio/logo" className="flex min-h-[44px] items-center gap-2.5 rounded-[12px] px-3 text-[14px] font-bold hover:bg-app-canvas">
                    <Icon name="palette" size={16} /> {t("rex.makeLogo")}
                  </Link>
                  <Link role="menuitem" href="/home/video" className="flex min-h-[44px] items-center gap-2.5 rounded-[12px] px-3 text-[14px] font-bold hover:bg-app-canvas">
                    <Icon name="play" size={16} /> {t("rex.videoStudio")}
                  </Link>
                  <Link role="menuitem" href="/home/brand-kit" className="flex min-h-[44px] items-center gap-2.5 rounded-[12px] px-3 text-[14px] font-bold hover:bg-app-canvas">
                    <Icon name="tag" size={16} /> {t("rex.brandKit")}
                  </Link>
                  <Link role="menuitem" href="/seller/store/builder" className="flex min-h-[44px] items-center gap-2.5 rounded-[12px] px-3 text-[14px] font-bold hover:bg-app-canvas">
                    <Icon name="monitor" size={16} /> {t("rex.openBuilder")}
                  </Link>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setPreviewOpen((open) => !open)}
              aria-pressed={previewOpen}
              className={cx(
                "inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-bold",
                previewOpen ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white hover:border-app-line-strong",
              )}
            >
              <Icon name="eye" size={16} />
              <span className="hidden sm:inline">{previewOpen ? t("rex.st.hideStore") : t("rex.st.previewStore")}</span>
              <span className="sm:hidden">{t("rex.st.store")}</span>
              {unpublished ? <span className="h-2 w-2 rounded-full bg-app-accent" aria-hidden /> : null}
            </button>
            {publishButton}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <section
          aria-label={t("rex.chatWith")}
          className={cx("flex min-h-0 min-w-0 flex-col bg-white", previewOpen ? "w-full lg:w-[420px] lg:shrink-0 lg:border-r lg:border-app-line xl:w-[460px] 2xl:w-[520px]" : "w-full")}
        >
          <RexChat
            messages={messages}
            busy={busy !== null}
            busyLabel={busyLabel}
            busyJob={busy ? busyJob : null}
            chips={chips}
            wide={!previewOpen}
            initialText={props.initialPrompt}
            disabledReason={props.aiReady ? null : t("rex.st.aiOff")}
            onSend={send}
            onUndo={undo}
            onOpenPreview={showPreview}
            undoingId={undoingId}
          />
        </section>

        {previewOpen ? (
          <section
            aria-label={t("rex.st.storePreview")}
            role={isPhone ? "dialog" : undefined}
            aria-modal={isPhone ? true : undefined}
            className="fixed inset-0 z-40 flex min-h-0 min-w-0 flex-col bg-app-canvas lg:static lg:z-auto lg:flex-1"
          >
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-app-line bg-white px-3 py-2.5 sm:px-4">
              <button
                ref={closePreviewRef}
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-app-line px-3 text-[13.5px] font-bold hover:border-app-line-strong"
              >
                <Icon name={isPhone ? "arrowLeft" : "x"} size={16} />
                <span className="lg:sr-only">{isPhone ? t("rex.st.backToRex") : t("rex.st.closePreview")}</span>
              </button>
              <p className="m-0 flex min-w-0 items-center gap-2 text-[13px] text-app-ink-soft">
                <span className={cx("h-2 w-2 shrink-0 rounded-full", unpublished ? "bg-app-accent" : "bg-app-success")} aria-hidden />
                <span className="truncate">
                  {unpublished ? t("rex.st.draftUnpublished") : live ? t("rex.st.matchesLive") : t("rex.st.draft")}
                </span>
              </p>
              <div className="ml-auto flex items-center gap-2">
                <div className="hidden md:block">{deviceToggle}</div>
                <button
                  type="button"
                  onClick={() => setPanelOpen(true)}
                  aria-label={t("rex.st.healthVersions", { score: health.score })}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-app-line px-3 text-[13.5px] font-bold hover:border-app-line-strong"
                >
                  <Icon name="pulse" size={16} /> {health.score}
                  <span className="hidden sm:inline">· {t("rex.sp.versions")}</span>
                </button>
                <div className="md:hidden">{publishButton}</div>
              </div>
              <div className="w-full">{tabs}</div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-8 pt-3 sm:px-5">
              <RexPreview store={props.store} draft={draft} page={page} device={isPhone ? "mobile" : device} busy={busy !== null} onWrite={writePage} />
            </div>
          </section>
        ) : null}
      </div>

      {panelOpen ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t("rex.st.healthAndVersions")}>
          <button type="button" aria-label={t("close")} className="absolute inset-0 bg-app-ink/30" onClick={() => setPanelOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[min(380px,100%)] flex-col bg-white shadow-[-18px_0_50px_rgba(22,20,31,0.16)]">
            <div className="flex shrink-0 items-center justify-between border-b border-app-line px-4 py-3">
              <p className="m-0 text-[15px] font-extrabold">{t("rex.st.yourStore")}</p>
              <button type="button" onClick={() => setPanelOpen(false)} aria-label={t("rex.st.closePanel")} className="grid h-10 w-10 place-items-center rounded-full hover:bg-app-canvas">
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {side}
              <div className="flex flex-col gap-3 px-5 pb-6 sm:hidden">
                <Link href="/studio/images" className="text-[14px] font-bold">{t("rex.makeImages")}</Link>
                <Link href="/studio/logo" className="text-[14px] font-bold">{t("rex.makeLogo")}</Link>
                <Link href="/home/video" className="text-[14px] font-bold">{t("rex.videoStudio")}</Link>
                <Link href="/seller/store/builder" className="text-[14px] font-bold">{t("rex.openBuilder")}</Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div role="status" className="fixed bottom-5 left-1/2 z-[60] flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-3 rounded-full bg-app-ink px-5 py-3 text-[13.5px] font-bold text-white shadow-[0_18px_50px_rgba(22,20,31,0.24)]">
          {toast.href ? <Icon name="checkCircle" size={16} className="shrink-0 text-[#6FE3C8]" /> : null}
          <span className="min-w-0 truncate">{toast.text}</span>
          {toast.href ? (
            <a href={toast.href} target="_blank" rel="noopener noreferrer" className="shrink-0 underline">{t("rex.view")}</a>
          ) : null}
        </div>
      ) : null}

      <StoreLaunchBillingModal open={Boolean(pricing)} pricing={pricing} onClose={() => setPricing(null)} />
    </div>
  );
}
