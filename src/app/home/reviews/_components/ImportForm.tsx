"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { importReview, type ActionState } from "@/app/actions/reviews";
import { Notice, PillButton, Segmented, Spinner } from "@/components/app-ui";
import { field } from "@/components/seller-core";
import { useT } from "@/components/i18n/I18nProvider";

type Draft = { authorName: string; rating: number | null; body: string; reviewedAt: string | null; source: string | null };

export function ImportForm({ sources, products, defaultSource = "whatsapp", aiReady }: { sources: { value: string; label: string }[]; products: { id: string; name: string }[]; defaultSource?: string; aiReady: boolean }) {
  const t = useT("reviews");
  const [state, action, pending] = useActionState<ActionState, FormData>(importReview, null);
  const [mode, setMode] = useState<"screenshot" | "paste">("screenshot");
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<{ tone: "info" | "error" | "success"; text: string } | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [showShot, setShowShot] = useState(false);
  const [values, setValues] = useState({ source: defaultSource, authorName: "", rating: "", body: "", reviewedAt: "" });
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setValues({ source: defaultSource, authorName: "", rating: "", body: "", reviewedAt: "" });
      setShot(null);
      setShowShot(false);
      setReadNote(null);
    }
  }, [state, defaultSource]);

  async function readScreenshot(file: File | undefined) {
    if (!file) return;
    setReading(true);
    setReadNote(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/app/reviews/import/screenshot", { method: "POST", body });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? t("imp.uploadFailed"));
      setShot(json.data.imageUrl);
      const draft = json.data.draft as Draft | null;
      if (draft) {
        setValues((current) => ({
          source: draft.source && sources.some((s) => s.value === draft.source) ? draft.source : current.source,
          authorName: draft.authorName || current.authorName,
          rating: draft.rating ? String(draft.rating) : "",
          body: draft.body || current.body,
          reviewedAt: draft.reviewedAt ? draft.reviewedAt.slice(0, 10) : current.reviewedAt,
        }));
        setReadNote({ tone: "success", text: t("imp.read") });
      } else {
        setReadNote({ tone: "info", text: json.data.reason ?? t("imp.typeBelow") });
      }
    } catch (error) {
      setReadNote({ tone: "error", text: error instanceof Error ? error.message : t("imp.uploadFailed") });
    } finally {
      setReading(false);
    }
  }

  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => setValues((current) => ({ ...current, [key]: e.target.value }));

  return (
    <form ref={formRef} action={action} className="grid gap-4">
      <Segmented className="bg-app-canvas sm:w-fit" options={[{ value: "screenshot", label: t("imp.fromShot") }, { value: "paste", label: t("imp.paste") }]} value={mode} onChange={setMode} />
      <input type="hidden" name="importMethod" value={mode === "screenshot" && shot ? "screenshot" : "manual"} />
      {shot && showShot ? <input type="hidden" name="images" value={shot} /> : null}

      {mode === "screenshot" ? (
        <div className="grid gap-2">
          <label htmlFor="shot" className={field.label}>{t("imp.screenshot")}</label>
          <input id="shot" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => readScreenshot(e.target.files?.[0])} className="block w-full text-[14px] file:mr-3 file:min-h-[40px] file:rounded-full file:border-0 file:bg-app-ink file:px-4 file:font-bold file:text-white" />
          <p className={field.hint}>{aiReady ? t("imp.aiHint") : t("imp.noAiHint")}</p>
          {reading ? <p role="status" className="m-0 flex items-center gap-2 text-[14px]"><Spinner /> {t("imp.reading")}</p> : null}
          {shot ? (
            <div className="flex flex-wrap items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={shot} alt={t("imp.shotAlt")} className="max-h-[260px] w-auto max-w-full rounded-[14px] border border-app-line" />
              <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={showShot} onChange={(e) => setShowShot(e.target.checked)} className={field.checkbox} /> {t("imp.showShot")}</label>
            </div>
          ) : null}
          {shot ? <p className={field.hint}>{t("imp.privacy")}</p> : null}
          {readNote ? <Notice tone={readNote.tone}>{readNote.text}</Notice> : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="source" className={field.label}>{t("detail.cameFrom")}</label>
          <select id="source" name="source" value={values.source} onChange={set("source")} className={field.select}>
            {sources.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="sourceUrl" className={field.label}>{t("imp.link")} <span className="font-normal text-app-ink-soft">{t("imp.optional")}</span></label>
          <input id="sourceUrl" name="sourceUrl" type="url" placeholder="https://" className={field.input} />
        </div>
        <div>
          <label htmlFor="authorName" className={field.label}>{t("imp.customer")}</label>
          <input id="authorName" name="authorName" required maxLength={120} value={values.authorName} onChange={set("authorName")} className={field.input} />
        </div>
        <div>
          <label htmlFor="rating" className={field.label}>{t("imp.stars")}</label>
          <select id="rating" name="rating" value={values.rating} onChange={set("rating")} className={field.select}>
            <option value="">{t("imp.noStars")}</option>
            {[5, 4, 3, 2, 1].map((star) => <option key={star} value={star}>{t("filter.stars", { count: star })}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="body" className={field.label}>{t("imp.wrote")}</label>
        <textarea id="body" name="body" required rows={4} maxLength={5000} value={values.body} onChange={set("body")} className={field.textarea} placeholder={t("imp.wrotePlaceholder")} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="reviewedAt" className={field.label}>{t("imp.date")}</label>
          <input id="reviewedAt" name="reviewedAt" type="date" value={values.reviewedAt} onChange={set("reviewedAt")} className={field.input} />
        </div>
        <div>
          <label htmlFor="productId" className={field.label}>{t("detail.product")} <span className="font-normal text-app-ink-soft">{t("imp.optional")}</span></label>
          <select id="productId" name="productId" defaultValue="" className={field.select}>
            <option value="">{t("detail.wholeShop")}</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="orderNumberImport" className={field.label}>{t("order.label")} <span className="font-normal text-app-ink-soft">{t("imp.optional")}</span></label>
          <input id="orderNumberImport" name="orderNumber" placeholder={t("imp.orderPlaceholder")} className={field.input} />
        </div>
      </div>
      <p className={field.hint}>{t("imp.note")}</p>
      {state ? (
        <Notice tone={state.ok ? "success" : "error"}>
          {state.message} {state.ok && state.href ? <Link href={state.href} className="font-bold underline">{t("imp.openIt")}</Link> : null}
        </Notice>
      ) : null}
      <PillButton type="submit" size="md" tone="ink" busy={pending} disabled={reading} className="w-fit">{t("imp.save")}</PillButton>
    </form>
  );
}
