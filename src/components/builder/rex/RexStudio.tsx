"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Mascot, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { StoreLaunchBillingModal, type StoreLaunchPricing } from "@/components/billing/StoreLaunchBillingModal";
import type { StoreEditorSnapshot } from "@/lib/store-templates";
import { themeLibraryEntry } from "@/lib/store-templates/theme-library";
import { computeStoreHealth, draftHealthFacts, rexSuggestionChips, type StorePageKey, type StorePageStatus } from "@/lib/store-health";
import type { RexVersionSummary } from "@/lib/ai/rex/studio-versions";
import { askRexStudio, buildWholeStore, publishDraft, restoreVersion } from "./api";
import { RexChat } from "./RexChat";
import { RexPreview } from "./RexPreview";
import { RexSidePanel } from "./RexSidePanel";
import type { ChatMessage, RexStudioProps } from "./types";

const BUILD_REQUEST = /^(please\s+)?(build|create|generate|make)\s+(me\s+)?(my|a|the)?\s*(whole|full|complete|entire|new)?\s*(online\s+)?(store|shop)\b/i;

let seq = 0;
const nextId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

function greeting(firstName: string, fromOnboarding: boolean, draftSaved: boolean) {
  if (!draftSaved) {
    return `Hi ${firstName}. Your store isn't built yet. Say "Build my store" and I'll design it, write the pages and add sample products as drafts. Nothing goes to your shoppers until you press Publish.`;
  }
  if (fromOnboarding) {
    return `Hi ${firstName}. I brought in your answers from setup. Tell me what to change and I'll do it on the live preview. Nothing goes to your shoppers until you press Publish.`;
  }
  return `Hi ${firstName}. Tell me what to change and I'll do it on the live preview. Nothing goes to your shoppers until you press Publish.`;
}

export function RexStudio(props: RexStudioProps) {
  const [draft, setDraft] = useState<StoreEditorSnapshot>(props.initialDraft);
  const [draftSaved, setDraftSaved] = useState(props.draftSaved);
  const [versions, setVersions] = useState<RexVersionSummary[]>(props.versions);
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: "hello", role: "rex", text: greeting(props.firstName, props.fromOnboarding, props.draftSaved) }]);
  const [busy, setBusy] = useState<null | "edit" | "build">(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [tab, setTab] = useState<StorePageKey>("home");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [phoneView, setPhoneView] = useState<"chat" | "preview">("chat");
  const [panelOpen, setPanelOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [live, setLive] = useState(props.live);
  const [unpublished, setUnpublished] = useState(props.hasUnpublishedChanges);
  const [pricing, setPricing] = useState<StoreLaunchPricing | null>(null);
  const [toast, setToast] = useState<{ text: string; href?: string } | null>(null);
  const [isPhone, setIsPhone] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);

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

  const facts = useMemo(() => ({ ...props.healthFacts, draft: draftHealthFacts(draft) }), [props.healthFacts, draft]);
  const health = useMemo(() => computeStoreHealth(facts), [facts]);
  const pages = facts.draft.pages;
  const page = pages.find((entry) => entry.key === tab) ?? pages[0];
  const lastSeller = [...messages].reverse().find((message) => message.role === "seller")?.text;
  const chips = useMemo(() => rexSuggestionChips(facts, { hasDraft: draftSaved, exclude: lastSeller ? [lastSeller] : [] }), [facts, draftSaved, lastSeller]);
  const themeName = themeLibraryEntry(draft.templateId)?.name ?? (draft.templateId === props.initialDraft.templateId ? props.themeName : draft.templateName);
  const busyLabel = busy === "build" ? "Building your store. This can take a minute…" : "Rex is working on it…";

  function history() {
    return messages
      .filter((message) => message.id !== "hello" && message.text.trim())
      .map((message) => ({ role: message.role === "seller" ? ("user" as const) : ("assistant" as const), content: message.text }))
      .slice(-12);
  }

  function rexSays(message: Omit<Extract<ChatMessage, { role: "rex" }>, "id" | "role">) {
    setMessages((prev) => [...prev, { id: nextId(), role: "rex", ...message }]);
  }

  async function send(text: string, imageUrls: string[] = []) {
    const request = text.trim();
    if (!request || busy) return;
    const past = history();
    setMessages((prev) => [...prev, { id: nextId(), role: "seller", text: request, ...(imageUrls.length ? { images: imageUrls } : {}) }]);
    setPhoneView("chat");

    if (BUILD_REQUEST.test(request)) {
      setBusy("build");
      try {
        const result = await buildWholeStore({
          request,
          history: past,
          brief: props.buildContext.brief,
          brandContext: { category: props.buildContext.category, businessDescription: props.buildContext.businessDescription },
          templateContext: props.buildContext.template,
        });
        setDraft(result.draft);
        setDraftSaved(true);
        setUnpublished(true);
        if (result.versions) setVersions(result.versions);
        setTab("home");
        rexSays({
          text: ["I built the store as a draft. Have a look in the preview.", ...result.notes].join("\n\n"),
          changes: [
            `Designed the store and saved ${result.pages.length} pages`,
            result.products.length ? `Added ${result.products.length} sample products as drafts, marked "(sample)"` : "Kept your products and prices",
            result.images.hero ? "Made a banner picture" : "",
            result.images.product ? "Made a product photo" : "",
          ].filter(Boolean),
          version: result.version ?? null,
          undoTo: result.undoTo ?? null,
        });
      } catch (error) {
        rexSays({ text: error instanceof Error ? error.message : "Rex couldn't build the store.", tone: "error" });
      } finally {
        setBusy(null);
      }
      return;
    }

    setBusy("edit");
    try {
      const result = await askRexStudio({ message: request, history: past, imageUrls });
      if (result.draft) {
        setDraft(result.draft);
        setDraftSaved(true);
        setUnpublished(true);
        if (result.versions) setVersions(result.versions);
        // Show the page Rex just wrote.
        const written = (["about", "faq", "collections", "product"] as StorePageKey[]).find((key) =>
          result.changes.some((change) => change.toLowerCase().includes(pages.find((entry) => entry.key === key)?.label.toLowerCase() ?? "@")),
        );
        if (written) setTab(written);
      }
      rexSays({ text: result.reply, changes: result.changes, version: result.version, undoTo: result.undoTo });
    } catch (error) {
      rexSays({ text: error instanceof Error ? error.message : "Rex couldn't make that change.", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function undo(message: Extract<ChatMessage, { role: "rex" }>) {
    if (!message.undoTo || undoingId) return;
    setUndoingId(message.id);
    try {
      const result = await restoreVersion(message.undoTo);
      setDraft(result.draft);
      setVersions(result.versions);
      setUnpublished(true);
      setMessages((prev) => prev.map((entry) => (entry.id === message.id ? { ...entry, undone: true } as ChatMessage : entry)));
      rexSays({ text: `Undone. Your draft is back to version ${result.restored.n}.` });
    } catch (error) {
      rexSays({ text: error instanceof Error ? error.message : "Couldn't undo that.", tone: "error" });
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
      setToast({ text: `Restored version ${result.restored.n} to your draft.` });
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : "Couldn't restore that version." });
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
        setToast({ text: `Published to ${props.storeHost}`, href: props.storeUrl });
      } else if ("billing" in result) {
        setPricing(result.billing);
      } else {
        setToast({ text: result.message });
        if (result.blockers.some((blocker) => /title and meta description/i.test(blocker))) {
          rexSays({
            text: "Before your store can go live, every page needs a search title and a short description. I can write them for you.",
            offer: "Write the search titles and descriptions for every page",
          });
          setPhoneView("chat");
        }
      }
    } finally {
      setPublishing(false);
    }
  }

  function writePage(target: StorePageStatus) {
    void send(target.key === "home" ? "Write my homepage." : `Write my ${target.label} page.`);
  }

  function viewPage(target: StorePageStatus) {
    setTab(target.key);
    setPanelOpen(false);
    setPhoneView("preview");
  }

  const tabs = (
    <nav aria-label="Store pages" className="min-w-0">
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
              {entry.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );

  const deviceToggle = (
    <div className="flex shrink-0 gap-1 rounded-full bg-app-canvas p-1" role="group" aria-label="Preview size">
      {(["desktop", "mobile"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={device === option}
          aria-label={option === "desktop" ? "Desktop" : "Mobile"}
          title={option === "desktop" ? "Desktop" : "Mobile"}
          onClick={() => setDevice(option)}
          className={cx("grid h-9 w-10 place-items-center rounded-full", device === option ? "bg-white shadow-[0_1px_3px_rgba(22,20,31,0.12)]" : "text-app-ink-soft")}
        >
          <Icon name={option === "desktop" ? "monitor" : "phone"} size={16} />
        </button>
      ))}
    </div>
  );

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
          <Link href="/home/store" aria-label="Exit Rex Studio" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-app-canvas">
            <Icon name="arrowLeft" size={18} />
          </Link>
          <Mascot name="rex" alt="" className="hidden h-9 w-9 shrink-0 sm:block" />
          <div className="min-w-0 flex-1 lg:flex-none lg:basis-[230px]">
            <h1 className="m-0 truncate text-[16px] font-extrabold leading-tight">Rex Studio</h1>
            <p className="m-0 truncate text-[12.5px] text-app-ink-soft">
              {props.store.name} · {themeName} theme
            </p>
          </div>

          <div className="hidden min-w-0 flex-1 items-center justify-center gap-2 lg:flex">
            {tabs}
            {deviceToggle}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <div ref={toolsRef} className="relative hidden sm:block">
              <button
                type="button"
                aria-expanded={toolsOpen}
                aria-haspopup="menu"
                onClick={() => setToolsOpen((open) => !open)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-[13.5px] font-bold hover:bg-app-canvas"
              >
                <Icon name="image" size={16} />
                <span className="hidden xl:inline">Images and logo</span>
                <span className="sr-only xl:hidden">Images and logo</span>
                <Icon name="chevDown" size={14} />
              </button>
              {toolsOpen ? (
                <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-[230px] rounded-[18px] border border-app-line bg-white p-1.5 shadow-[0_18px_50px_rgba(22,20,31,0.14)]">
                  <Link role="menuitem" href="/studio/images" className="flex min-h-[44px] items-center gap-2.5 rounded-[12px] px-3 text-[14px] font-bold hover:bg-app-canvas">
                    <Icon name="image" size={16} /> Make images
                  </Link>
                  <Link role="menuitem" href="/studio/logo" className="flex min-h-[44px] items-center gap-2.5 rounded-[12px] px-3 text-[14px] font-bold hover:bg-app-canvas">
                    <Icon name="palette" size={16} /> Make a logo
                  </Link>
                  <Link role="menuitem" href="/home/brand-kit" className="flex min-h-[44px] items-center gap-2.5 rounded-[12px] px-3 text-[14px] font-bold hover:bg-app-canvas">
                    <Icon name="tag" size={16} /> Brand kit
                  </Link>
                </div>
              ) : null}
            </div>
            <Link
              href="/seller/store/builder"
              className="hidden min-h-[40px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13.5px] font-bold hover:border-app-line-strong md:inline-flex"
            >
              <Icon name="monitor" size={16} /> Open in builder
            </Link>
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              aria-label={`Store health ${health.score}`}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-app-line px-3 text-[13.5px] font-bold xl:hidden"
            >
              <Icon name="pulse" size={16} /> {health.score}
            </button>
            <button
              type="button"
              onClick={() => setPhoneView((view) => (view === "chat" ? "preview" : "chat"))}
              aria-pressed={phoneView === "preview"}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-app-line px-3 text-[13.5px] font-bold md:hidden"
            >
              <Icon name={phoneView === "chat" ? "eye" : "chat"} size={16} /> {phoneView === "chat" ? "Preview" : "Chat"}
            </button>
            <button
              type="button"
              onClick={() => void publish()}
              disabled={publishing || busy !== null}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-app-accent px-4 text-[13.5px] font-bold text-white hover:brightness-95 disabled:opacity-60"
            >
              {publishing ? "Publishing…" : "Publish"}
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="Chat with Rex"
          className={cx("min-h-0 w-full shrink-0 flex-col border-r border-app-line bg-white md:flex md:w-[340px] lg:w-[360px]", phoneView === "chat" ? "flex" : "hidden")}
        >
          <RexChat
            messages={messages}
            busy={busy !== null}
            busyLabel={busyLabel}
            chips={chips}
            disabledReason={props.aiReady ? null : "Rex's AI isn't switched on for this account yet, so he can't make changes right now. You can still edit everything in the advanced builder."}
            onSend={send}
            onUndo={(message) => void undo(message)}
            undoingId={undoingId}
          />
        </aside>

        <main className={cx("min-h-0 min-w-0 flex-1 flex-col md:flex", phoneView === "preview" ? "flex" : "hidden")}>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 pt-3 lg:justify-center">
            <p className="m-0 flex items-center gap-2 text-[13px] text-app-ink-soft">
              <span className={cx("h-2 w-2 rounded-full", unpublished ? "bg-app-accent" : "bg-app-success")} aria-hidden />
              <span>
                Live preview · <span className="font-bold text-app-ink">{page.key === "home" ? "Home page" : page.label}</span>
                <span className="sr-only">{unpublished ? ", changes not published yet" : live ? ", matches your live store" : ""}</span>
              </span>
            </p>
            <div className="hidden md:block lg:hidden">{deviceToggle}</div>
          </div>
          <div className="shrink-0 px-4 pt-2 lg:hidden">{tabs}</div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-8 pt-3 sm:px-5">
            <RexPreview store={props.store} draft={draft} page={page} device={isPhone ? "mobile" : device} busy={busy !== null} onWrite={writePage} />
          </div>
        </main>

        <aside aria-label="Store health and versions" className="hidden w-[310px] shrink-0 overflow-y-auto border-l border-app-line bg-white xl:block">
          {side}
        </aside>
      </div>

      {panelOpen ? (
        <div className="fixed inset-0 z-40 xl:hidden" role="dialog" aria-modal="true" aria-label="Store health and versions">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-app-ink/30" onClick={() => setPanelOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[min(360px,100%)] flex-col bg-white shadow-[-18px_0_50px_rgba(22,20,31,0.16)]">
            <div className="flex shrink-0 items-center justify-between border-b border-app-line px-4 py-3">
              <p className="m-0 text-[15px] font-extrabold">Your store</p>
              <button type="button" onClick={() => setPanelOpen(false)} aria-label="Close panel" className="grid h-10 w-10 place-items-center rounded-full hover:bg-app-canvas">
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {side}
              <div className="flex flex-col gap-2 px-5 pb-6 sm:hidden">
                <Link href="/studio/images" className="text-[14px] font-bold">Make images</Link>
                <Link href="/studio/logo" className="text-[14px] font-bold">Make a logo</Link>
              </div>
              <div className="px-5 pb-6 md:hidden">
                <Link href="/seller/store/builder" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-app-line px-4 text-[13.5px] font-bold">
                  <Icon name="monitor" size={16} /> Open in builder
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div role="status" className="fixed bottom-5 left-1/2 z-50 flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-3 rounded-full bg-app-ink px-5 py-3 text-[13.5px] font-bold text-white shadow-[0_18px_50px_rgba(22,20,31,0.24)]">
          {toast.href ? <Icon name="checkCircle" size={16} className="shrink-0 text-[#6FE3C8]" /> : null}
          <span className="min-w-0 truncate">{toast.text}</span>
          {toast.href ? (
            <a href={toast.href} target="_blank" rel="noopener noreferrer" className="shrink-0 underline">View</a>
          ) : null}
        </div>
      ) : null}

      <StoreLaunchBillingModal open={Boolean(pricing)} pricing={pricing} onClose={() => setPricing(null)} />
    </div>
  );
}
