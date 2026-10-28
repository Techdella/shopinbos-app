"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/app-ui/cx";
import { PillButton } from "@/components/app-ui";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatMoney } from "@shared/i18n";
import type { BulkRole } from "@shared/bulk-products";
import { addFiles, bulkApi, forgetLost, lostUploads, queueFor, type BulkSession, type PublishResult } from "./client";
import { BulkChat } from "./BulkChat";
import { BulkDrafts } from "./BulkDrafts";
import { ShareWhatsAppButton } from "@/components/products/ShareWhatsAppButton";

// "Add many with Peggy" on the web (sellers: /products/bulk, suppliers: /supplier/products/bulk). Pick or drop up to
// 300 photos; they upload in the background (3 at a time, retried) while Peggy reads them 10 at a time; price them
// by chatting or in the grid; publish in chunks of 20 with progress. Desktop: chat and the grid side by side. Phones:
// a Chat / Products switch. Logic in shared/bulk-products.ts; API in src/lib/products/bulk/.

const EMPTY = { total: 0, done: 0, failed: 0, uploading: 0, waiting: 0, fraction: 0 };

function useQueue(sessionId: string | null) {
  const subscribe = useCallback((onChange: () => void) => (sessionId ? queueFor(sessionId).subscribe(onChange) : () => undefined), [sessionId]);
  const cache = useRef<{ key: string; value: typeof EMPTY }>({ key: "", value: EMPTY });
  const read = useCallback(() => {
    if (!sessionId) return EMPTY;
    const now = queueFor(sessionId).snapshot();
    const key = JSON.stringify(now);
    if (key !== cache.current.key) cache.current = { key, value: now };
    return cache.current.value;
  }, [sessionId]);
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function BulkAddWithPeggy({ role, productsHref, importHref, oneHref }: { role: BulkRole; productsHref: string; importHref: string; oneHref: string }) {
  const t = useT("bulkAdd", "common");
  const locale = useLocale();
  const money = useCallback((kobo: number) => formatMoney(Math.round(kobo / 100), locale), [locale]);
  const [session, setSession] = useState<BulkSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"chat" | "list">("chat");
  const [lost, setLost] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [publishing, setPublishing] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ published: PublishResult["published"]; failed: PublishResult["failed"]; overLimit: number; notReady: number; live: boolean } | null>(null);
  const [live, setLive] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const queue = useQueue(session?.id ?? null);
  const looking = useRef(false);

  useEffect(() => {
    let alive = true;
    bulkApi
      .current()
      .then((found) => {
        if (!alive) return;
        setSession(found);
        if (found) setLost(lostUploads(found.id));
      })
      .catch((loadError) => alive && setError(loadError instanceof Error ? loadError.message : String(loadError)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // Peggy reads waiting photos 10 at a time, as they arrive; the list refreshes after each batch.
  const pumpLook = useCallback(async (id: string) => {
    if (looking.current) return;
    looking.current = true;
    try {
      for (let round = 0; round < 40; round++) {
        const answer = await bulkApi.look(id);
        if (answer.session) setSession(answer.session);
        if (!answer.pending || !answer.drafted) break;
      }
    } catch {
      // The next upload or a refresh tries again.
    } finally {
      looking.current = false;
    }
  }, []);

  // While photos upload, refresh every few seconds so new products appear, and keep Peggy reading.
  useEffect(() => {
    if (!session?.id) return;
    const id = session.id;
    const busy = queue.uploading + queue.waiting > 0;
    if (!busy && !session.summary.drafting) return;
    const timer = setInterval(() => {
      void bulkApi.get(id).then((fresh) => {
        setSession(fresh);
        if (fresh.summary.drafting) void pumpLook(id);
      }).catch(() => undefined);
    }, 3500);
    return () => clearInterval(timer);
  }, [session?.id, session?.summary.drafting, queue.uploading, queue.waiting, pumpLook]);

  useEffect(() => {
    if (session?.id && queue.total && !queue.uploading && !queue.waiting) void bulkApi.get(session.id).then((fresh) => { setSession(fresh); void pumpLook(fresh.id); }).catch(() => undefined);
  }, [session?.id, queue.total, queue.uploading, queue.waiting, pumpLook]);

  async function pick(files: FileList | File[] | null) {
    if (!files || !files.length) return;
    setError(null);
    setResult(null);
    try {
      const current = session ?? (await bulkApi.open());
      if (!session) setSession(current);
      const room = current.max - current.items.length;
      if (room <= 0) return setError(t("upload.full"));
      addFiles(current.id, Array.from(files).slice(0, room));
      forgetLost(current.id);
      setLost(0);
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : String(pickError));
    }
  }

  async function act(run: () => Promise<BulkSession | null>) {
    setError(null);
    try {
      const fresh = await run();
      if (fresh) setSession(fresh);
    } catch (actError) {
      setError(actError instanceof Error ? actError.message : String(actError));
    }
  }

  async function publish(ids?: string[]) {
    if (!session) return;
    setError(null);
    const total = ids?.length ?? session.ready;
    const done: PublishResult["published"] = [];
    let last: PublishResult | null = null;
    setPublishing({ done: 0, total });
    try {
      for (let round = 0; round < 30; round++) {
        last = await bulkApi.publish(session.id, live, ids);
        done.push(...last.published);
        setPublishing({ done: done.length, total });
        if (last.session) setSession(last.session);
        if (!last.remaining || !last.published.length) break;
      }
      setResult({ published: done, failed: last?.failed ?? [], overLimit: last?.overLimit ?? 0, notReady: last?.notReady ?? 0, live });
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : String(publishError));
      if (done.length) setResult({ published: done, failed: [], overLimit: 0, notReady: 0, live });
    } finally {
      setPublishing(null);
    }
  }

  const items = session?.items ?? [];
  const hasItems = items.length > 0 || queue.total > 0;
  const allDone = result && result.published.length > 0 && !session?.ready && !result.failed.length;

  if (loading) return <div className="h-40 animate-pulse rounded-[22px] bg-white" aria-busy="true" />;

  const picker = (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void pick(event.dataTransfer.files);
      }}
      className={cx("flex flex-col items-center gap-3 rounded-[22px] border-2 border-dashed px-5 py-8 text-center transition", dragging ? "border-app-accent bg-app-accent/5" : "border-app-line bg-white", hasItems && "py-4")}
    >
      {!hasItems && (
        <>
          <span className="grid h-16 w-16 place-items-center rounded-[20px] bg-app-mint"><Icon name="image" size={28} /></span>
          <h2 className="m-0 text-[22px] font-extrabold tracking-[-0.4px]">{t("pick.title")}</h2>
          <p className="m-0 max-w-[520px] text-[14.5px] text-app-ink-soft">{t("pick.sub")}</p>
        </>
      )}
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple className="sr-only" onChange={(event) => { void pick(event.target.files); event.target.value = ""; }} aria-label={t("pick.choose")} data-testid="bulk-file-input" />
      <div className="flex flex-wrap items-center justify-center gap-2 text-[14px] text-app-ink-soft">
        <span className="hidden lg:inline">{t("pick.drop")}</span>
        <PillButton tone={hasItems ? "white" : "orange"} size="md" onClick={() => fileInput.current?.click()}>
          <Icon name={hasItems ? "plus" : "upload"} size={16} />
          {hasItems ? t("pick.more") : t("pick.choose")}
        </PillButton>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4" data-testid="bulk-add">
      {error && <p role="alert" className="m-0 rounded-[14px] bg-app-danger-tint px-4 py-3 text-[14px] text-app-danger">{error}</p>}
      {lost > 0 && (
        <p className="m-0 rounded-[14px] bg-[#FFF4E5] px-4 py-3 text-[14px]">{t("upload.lost", { count: lost })}</p>
      )}

      {allDone ? (
        <DonePanel result={result!} role={role} productsHref={productsHref} onMore={() => setResult(null)} />
      ) : (
        <>
          {picker}
          {queue.total > 0 && (queue.uploading + queue.waiting + queue.failed > 0 || (session?.summary.drafting ?? 0) > 0) && (
            <section className="rounded-[18px] border border-app-line bg-white px-4 py-3" aria-live="polite">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
                <strong>{t("upload.progress", { done: queue.done, total: queue.total })}</strong>
                {session && session.summary.total > 0 && <span className="text-app-ink-soft">{t("upload.reading", { done: session.summary.total - session.summary.drafting, total: session.summary.total })}</span>}
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-app-canvas"><div className="h-full rounded-full bg-app-accent transition-all" style={{ width: `${Math.round(queue.fraction * 100)}%` }} /></div>
              {queue.failed > 0 && (
                <div className="mt-2 flex items-center gap-3 text-[13.5px] text-app-danger">
                  {t("upload.failed", { count: queue.failed })}
                  <button type="button" className="font-bold underline" onClick={() => session && queueFor(session.id).retryFailed()}>{t("upload.retry")}</button>
                </div>
              )}
            </section>
          )}

          {session && hasItems && (
            <>
              <div className="flex rounded-full bg-white p-1 lg:hidden" role="tablist">
                {(["chat", "list"] as const).map((key) => (
                  <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={cx("min-h-[42px] flex-1 rounded-full text-[14px] font-bold", tab === key ? "bg-app-ink text-white" : "text-app-ink-soft")}>
                    {key === "chat" ? t("tab.chat") : t("tab.list", { count: items.length })}
                  </button>
                ))}
              </div>
              <div className="grid gap-4 lg:grid-cols-[minmax(340px,5fr)_7fr]">
                <div className={cx(tab !== "chat" && "max-lg:hidden")}>
                  <BulkChat session={session} money={money} onSession={setSession} onError={setError} onAct={act} />
                </div>
                <div className={cx(tab !== "list" && "max-lg:hidden")}>
                  <BulkDrafts session={session} money={money} onAct={act} onPublishSome={(ids) => void publish(ids)} />
                </div>
              </div>

              <section className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-[22px] border border-app-line bg-white px-4 py-3 shadow-[0_8px_30px_rgba(22,20,31,0.08)]">
                <label className="flex items-center gap-2 text-[14px]">
                  <input type="checkbox" checked={live} onChange={(event) => setLive(event.target.checked)} className="h-5 w-5 accent-[var(--color-app-forest)]" />
                  {role === "supplier" ? t("publish.liveSupplier") : t("publish.live")}
                </label>
                <span className="text-[13px] text-app-ink-soft">{session.summary.left > 0 || session.summary.unnamed > 0 ? t("publish.notReady", { count: session.summary.left + session.summary.unnamed - Math.min(session.summary.left, session.summary.unnamed) }) : null}</span>
                <PillButton tone="orange" size="md" className="ml-auto" disabled={!session.ready || Boolean(publishing)} busy={false} onClick={() => void publish()} data-testid="bulk-publish">
                  {publishing ? t("publish.progress", { done: publishing.done, total: publishing.total }) : t("publish.button", { count: session.ready })}
                </PillButton>
                {result && (result.overLimit > 0 || result.failed.length > 0) && (
                  <div className="w-full text-[13.5px]">
                    {result.overLimit > 0 && <p className="m-0 text-app-ink-soft">{t("publish.overLimit", { count: result.overLimit })}</p>}
                    {result.failed.length > 0 && (
                      <p className="m-0 text-app-danger">
                        {t("publish.failed", { count: result.failed.length })} ({result.failed.map((entry) => entry.number).join(", ")}){" "}
                        <button type="button" className="font-bold underline" onClick={() => void publish(result.failed.map((entry) => entry.itemId))}>{t("upload.retry")}</button>
                      </p>
                    )}
                  </div>
                )}
              </section>
            </>
          )}

          <section className="flex flex-wrap gap-2 text-[14px]">
            <span className="w-full text-[12px] font-extrabold uppercase tracking-[0.08em] text-app-ink-soft">{t("other.title")}</span>
            <Link href={importHref} className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-app-line bg-white px-4 font-bold text-app-ink no-underline" title={t("other.csvSub")}>
              <Icon name="upload" size={15} /> {t("other.csv")}
            </Link>
            <Link href={oneHref} className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-app-line bg-white px-4 font-bold text-app-ink no-underline">
              <Icon name="plus" size={15} /> {t("other.one")}
            </Link>
          </section>
        </>
      )}
    </div>
  );
}

function DonePanel({ result, role, productsHref, onMore }: { result: { published: PublishResult["published"]; live: boolean }; role: BulkRole; productsHref: string; onMore: () => void }) {
  const t = useT("bulkAdd");
  const shown = result.published.slice(0, 6);
  return (
    <section className="flex flex-col items-center gap-4 rounded-[24px] bg-white px-5 py-8 text-center" data-testid="bulk-done">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-app-mint"><Icon name="checkCircle" size={30} /></span>
      <h2 className="m-0 text-[26px] font-extrabold tracking-[-0.5px]">{t("done.title", { count: result.published.length })}</h2>
      <p className="m-0 max-w-[520px] text-[15px] text-app-ink-soft">{role === "supplier" ? t("done.subSupplier") : result.live ? t("done.sub") : t("done.subDraft")}</p>
      {role === "seller" && result.live && shown.some((entry) => entry.url) && (
        <ul className="m-0 grid w-full max-w-[640px] list-none gap-2 p-0 text-left">
          {shown.map((entry) => (
            <li key={entry.productId} className="flex items-center gap-3 rounded-[14px] border border-app-line px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-bold">{entry.number}. {entry.name}</span>
              {entry.url ? <ShareWhatsAppButton compact product={{ name: entry.name, price: entry.price, shortCode: entry.shortCode, url: entry.url }} /> : null}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <Link href={productsHref} className="inline-flex min-h-[48px] items-center rounded-full bg-app-ink px-5 font-bold text-white no-underline">{t("done.viewAll")}</Link>
        <PillButton tone="white" size="md" onClick={onMore}>{t("done.addMore")}</PillButton>
      </div>
    </section>
  );
}

