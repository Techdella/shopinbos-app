"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Notice, PillButton } from "@/components/app-ui";
import { useT } from "@/components/i18n/I18nProvider";
import { PRODUCT_TYPES } from "@shared/product-types";
import { IMPORT_FIELDS, type AnalysedRow, type ColumnMap, type ColumnSuggestion, type ColumnTarget, type ImportIssue } from "@shared/product-import";
import { CONTENT_BATCH, CONTENT_FIELDS, IMPORT_AI_MAX_ROWS, ImportEnhancementSchema, ruleBasedContent, toEnhancement, type ImportEnhancement } from "@shared/product-content";

// "Let Peggy check and fill in": the file is checked (columns, prices, SKUs, photo links), then Peggy suggests a
// description, category, type, specs, tags, SEO, FAQs and care for each product, in small batches with progress.
// The seller accepts all, some, or edits them; nothing is saved until they press Import.

export type ImportResult = { imported: number; withImages?: number; enhanced?: number; errors: string[]; notices?: string[] };

interface Analysis {
  headers: string[];
  columns: ColumnSuggestion[];
  columnMap: ColumnMap;
  aiColumns: boolean;
  headerProblem: string | null;
  rows: AnalysedRow[];
  issues: ImportIssue[];
  issueCount: number;
  counts: { rows: number; ready: number; blocked: number; noPhoto: number; noDescription: number };
  linksChecked: number;
}

interface Entry {
  enhancement: ImportEnhancement;
  source: "ai" | "rules";
  accepted: boolean;
}

const TARGETS: ColumnTarget[] = [...IMPORT_FIELDS, "detail", "ignored"];
const PAGE = 20;
const ISSUES_SHOWN = 12;

async function readJson(res: Response) {
  return res.json().catch(() => null);
}

function rulesFor(row: AnalysedRow): ImportEnhancement {
  return toEnhancement(ruleBasedContent({ name: row.name, description: row.description, category: row.category, price: row.price, tags: row.tags, specifications: row.specifications }, CONTENT_FIELDS));
}

function specsToText(specs: ImportEnhancement["specifications"]) {
  return (specs ?? []).map((s) => `${s.name}: ${s.value}`).join("\n");
}
function textToSpecs(text: string) {
  return text.split("\n").flatMap((line) => {
    const at = line.indexOf(":");
    const name = (at > 0 ? line.slice(0, at) : "").trim().slice(0, 100);
    const value = (at > 0 ? line.slice(at + 1) : "").trim().slice(0, 500);
    return name && value ? [{ name, value }] : [];
  });
}
function faqsToText(faqs: ImportEnhancement["faqs"]) {
  return (faqs ?? []).map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n");
}
function textToFaqs(text: string) {
  const out: { question: string; answer: string }[] = [];
  let question = "";
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (/^q[:.]/i.test(line)) question = line.slice(2).trim();
    else if (/^a[:.]/i.test(line) && question) {
      const answer = line.slice(2).trim();
      if (answer) out.push({ question: question.slice(0, 500), answer: answer.slice(0, 2000) });
      question = "";
    }
  }
  return out.slice(0, 10);
}

export function ImportPeggyReview({ file, imageMap, photoErrors, onDone, onBack }: { file: File; imageMap: Record<string, string>; photoErrors: string[]; onDone: (result: ImportResult) => void; onBack: () => void }) {
  const t = useT("products", "productTypes", "common");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [columnMap, setColumnMap] = useState<ColumnMap>({});
  const [columnsChanged, setColumnsChanged] = useState(false);
  const [entries, setEntries] = useState<Record<number, Entry>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [notes, setNotes] = useState<{ basic: boolean; limited: boolean; capped: number }>({ basic: false, limited: false, capped: 0 });
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState<"with" | "without" | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [shown, setShown] = useState(PAGE);
  const alive = useRef(true);
  const started = useRef(false);

  useEffect(() => () => {
    alive.current = false;
  }, []);

  const fill = useCallback(async (result: Analysis) => {
    const ready = result.rows.filter((row) => row.ok);
    const aiRows = ready.slice(0, IMPORT_AI_MAX_ROWS);
    const rest = ready.slice(IMPORT_AI_MAX_ROWS);
    const next: Record<number, Entry> = {};
    for (const row of rest) next[row.index] = { enhancement: rulesFor(row), source: "rules", accepted: true };
    setEntries({ ...next });
    setNotes({ basic: false, limited: false, capped: rest.length ? IMPORT_AI_MAX_ROWS : 0 });
    setProgress({ done: 0, total: aiRows.length });
    let limited = false;
    let anyAi = false;
    for (let start = 0; start < aiRows.length && alive.current; start += CONTENT_BATCH) {
      const batch = aiRows.slice(start, start + CONTENT_BATCH);
      let suggestions: ImportEnhancement[] | null = null;
      let source: "ai" | "rules" = "rules";
      if (!limited) {
        try {
          const res = await fetch("/api/products/import/suggest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              products: batch.map((row) => ({ name: row.name, description: row.description, category: row.category, price: row.price, tags: row.tags, specifications: row.specifications, imageUrl: row.images[0] ?? null })),
              usePhotos: true,
            }),
          });
          const data = await readJson(res);
          if (res.ok && Array.isArray(data?.data?.suggestions)) {
            // Never trust the reply's shape: each suggestion is checked again here.
            suggestions = data.data.suggestions.map((value: unknown) => {
              const checked = ImportEnhancementSchema.safeParse(value);
              return checked.success ? checked.data : null;
            });
            source = data.data.source === "ai" ? "ai" : "rules";
            if (data.data.limited) limited = true;
          }
        } catch {
          suggestions = null;
        }
      }
      if (!alive.current) return;
      if (source === "ai") anyAi = true;
      batch.forEach((row, i) => {
        next[row.index] = { enhancement: suggestions?.[i] ?? rulesFor(row), source: suggestions?.[i] ? source : "rules", accepted: true };
      });
      setEntries({ ...next });
      setProgress({ done: Math.min(start + CONTENT_BATCH, aiRows.length), total: aiRows.length });
    }
    if (!alive.current) return;
    setProgress(null);
    setNotes({ basic: !anyAi && !limited && aiRows.length > 0, limited, capped: rest.length ? IMPORT_AI_MAX_ROWS : 0 });
  }, []);

  const analyse = useCallback(async (map: ColumnMap | null) => {
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("csv", file);
      if (Object.keys(imageMap).length) body.append("imageMap", JSON.stringify(imageMap));
      if (map) body.append("columnMap", JSON.stringify(map));
      const res = await fetch("/api/products/import/analyse", { method: "POST", body });
      const data = await readJson(res);
      if (!res.ok || !data?.data) {
        setError(data?.error?.message ?? t("importAi.failed"));
        return null;
      }
      const result = data.data as Analysis;
      if (!alive.current) return null;
      setAnalysis(result);
      setColumnMap(result.columnMap);
      setColumnsChanged(false);
      setShown(PAGE);
      return result;
    } catch {
      setError(t("importAi.failed"));
      return null;
    } finally {
      setBusy(false);
    }
  }, [file, imageMap, t]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void analyse(null).then((result) => {
      if (result && !result.headerProblem) void fill(result);
    });
  }, [analyse, fill]);

  const recheck = async () => {
    const result = await analyse(columnMap);
    if (result && !result.headerProblem) await fill(result);
  };

  const setAll = (accepted: boolean) => setEntries((current) => Object.fromEntries(Object.entries(current).map(([key, entry]) => [key, { ...entry, accepted }])));
  const update = (index: number, change: Partial<Entry>) => setEntries((current) => ({ ...current, [index]: { ...current[index]!, ...change } }));

  const runImport = async (withChanges: boolean) => {
    setImporting(withChanges ? "with" : "without");
    setError("");
    try {
      const body = new FormData();
      body.append("csv", file);
      if (Object.keys(imageMap).length) body.append("imageMap", JSON.stringify(imageMap));
      body.append("columnMap", JSON.stringify(columnMap));
      if (withChanges) {
        const accepted = Object.fromEntries(Object.entries(entries).filter(([, entry]) => entry.accepted).map(([key, entry]) => [key, entry.enhancement]));
        body.append("enhancements", JSON.stringify(accepted));
      }
      const res = await fetch("/api/products/import", { method: "POST", body });
      const data = await readJson(res);
      if (!res.ok) {
        setError(data?.error?.message ?? t("import.failed"));
        return;
      }
      const out: ImportResult = data?.data ?? data;
      onDone({ ...out, errors: [...photoErrors, ...(out.errors ?? [])] });
    } catch {
      setError(t("import.uploadError"));
    } finally {
      setImporting(null);
    }
  };

  if (!analysis) {
    return (
      <div className="grid gap-4 rounded-[22px] border border-app-line bg-white p-5 sm:p-6">
        {error ? <Notice>{error}</Notice> : <div className="text-[14.5px] font-bold text-app-ink-soft" role="status">{t("importAi.checking")}</div>}
        <div><PillButton tone="white" size="sm" onClick={onBack}>{t("importAi.back")}</PillButton></div>
      </div>
    );
  }

  const readyRows = analysis.rows.filter((row) => row.ok);
  const acceptedCount = readyRows.filter((row) => entries[row.index]?.accepted).length;
  const filling = progress !== null;

  return (
    <div className="grid gap-4">
      {error && <Notice>{error}</Notice>}

      <section className="grid gap-3 rounded-[22px] border border-app-line bg-white p-5 sm:p-6">
        <div>
          <h2 className="m-0 text-[17px] font-extrabold">{t("importAi.columnsTitle")}</h2>
          <p className="m-0 mt-1 text-[13.5px] leading-[1.55] text-app-ink-soft">{t("importAi.columnsHelp")}{analysis.aiColumns ? ` ${t("importAi.aiColumns")}` : ""}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {analysis.columns.map((column) => (
            <label key={column.header} className="grid gap-1 rounded-[14px] bg-app-canvas px-3 py-2">
              <span className="flex flex-wrap items-center gap-2 text-[13.5px] font-bold">
                <span className="break-all">{column.header}</span>
                <span className="text-[11.5px] font-medium text-app-ink-soft">{t.dynamic(`importAi.how.${column.how}`, column.how)}</span>
              </span>
              <select
                className="min-h-[40px] w-full rounded-[10px] border border-app-line bg-white px-2 text-[14px]"
                value={columnMap[column.header] ?? column.target}
                onChange={(e) => {
                  setColumnMap((current) => ({ ...current, [column.header]: e.target.value as ColumnTarget }));
                  setColumnsChanged(true);
                }}
              >
                {TARGETS.map((target) => <option key={target} value={target}>{t.dynamic(`importAi.field.${target}`, target)}</option>)}
              </select>
            </label>
          ))}
        </div>
        {(columnsChanged || analysis.headerProblem) && (
          <div className="flex flex-wrap items-center gap-2">
            {analysis.headerProblem && <span className="text-[13.5px] font-bold text-app-danger">{t("importAi.needNamePrice")}</span>}
            <PillButton tone="ink" size="sm" busy={busy} disabled={filling} onClick={recheck}>{t("importAi.recheck")}</PillButton>
          </div>
        )}
      </section>

      <section className="grid gap-2 rounded-[22px] border border-app-line bg-white p-5 sm:p-6">
        <h2 className="m-0 text-[17px] font-extrabold">{t("importAi.summary", { ready: analysis.counts.ready, rows: analysis.counts.rows })}</h2>
        <ul className="m-0 grid gap-0.5 pl-5 text-[13.5px] text-app-ink-soft">
          {analysis.counts.blocked > 0 && <li className="text-app-danger">{t("importAi.blocked", { count: analysis.counts.blocked })}</li>}
          {analysis.counts.noPhoto > 0 && <li>{t("importAi.noPhoto", { count: analysis.counts.noPhoto })}</li>}
          {analysis.counts.noDescription > 0 && <li>{t("importAi.noDescription", { count: analysis.counts.noDescription })}</li>}
          {analysis.linksChecked > 0 && <li>{t("importAi.linksChecked", { count: analysis.linksChecked })}</li>}
        </ul>
        {analysis.issues.length > 0 && (
          <div className="grid gap-1">
            <h3 className="m-0 mt-1 text-[14.5px] font-extrabold">{t("importAi.issuesTitle")}</h3>
            <ul className="m-0 grid gap-0.5 pl-5 text-[13.5px]">
              {analysis.issues.slice(0, ISSUES_SHOWN).map((issue, i) => (
                <li key={i} className={issue.kind === "no_name" || issue.kind === "no_price" || issue.kind === "bad_price" ? "text-app-danger" : "text-app-ink"}>
                  {t.dynamic(`importAi.issue.${issue.kind}`, issue.kind, { row: issue.row, value: issue.value ?? "" })}
                </li>
              ))}
            </ul>
            {analysis.issueCount > ISSUES_SHOWN && <div className="text-[13px] text-app-ink-soft">{t("importAi.moreIssues", { count: analysis.issueCount - ISSUES_SHOWN })}</div>}
          </div>
        )}
      </section>

      <section className="grid gap-3 rounded-[22px] border border-app-line bg-white p-5 sm:p-6">
        {filling && <div className="text-[14px] font-bold text-app-ink-soft" role="status">{t("importAi.filling", { done: progress.done, total: progress.total })}</div>}
        {!filling && readyRows.length > 0 && <div className="text-[14px] font-bold">{t("importAi.filled", { count: readyRows.length })}</div>}
        {notes.basic && <Notice tone="info">{t("importAi.basic")}</Notice>}
        {notes.limited && <Notice tone="info">{t("importAi.limited")}</Notice>}
        {notes.capped > 0 && <Notice tone="info">{t("importAi.aiCap", { count: notes.capped })}</Notice>}

        <div className="flex flex-wrap gap-2">
          <PillButton tone="white" size="sm" disabled={filling} onClick={() => setAll(true)}>{t("importAi.acceptAll")}</PillButton>
          <PillButton tone="white" size="sm" disabled={filling} onClick={() => setAll(false)}>{t("importAi.clearAll")}</PillButton>
        </div>

        <ul className="m-0 grid list-none gap-2 p-0">
          {analysis.rows.slice(0, shown).map((row) => {
            const entry = entries[row.index];
            return (
              <li key={row.index} className="grid gap-2 rounded-[16px] border border-app-line p-3">
                <div className="flex items-start gap-3">
                  {row.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.images[0]} alt="" className="h-14 w-14 shrink-0 rounded-[10px] object-cover" loading="lazy" />
                  ) : (
                    <div className="h-14 w-14 shrink-0 rounded-[10px] bg-app-canvas" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-[14.5px] font-extrabold">{row.name || t("importAi.noName", { row: row.row })}</div>
                    <div className="text-[12.5px] text-app-ink-soft">
                      {row.price !== null ? row.price.toLocaleString() : t("importAi.noPrice")}
                      {row.sku ? ` · ${row.sku}` : ""}
                    </div>
                  </div>
                  {row.ok && entry && (
                    <label className="flex shrink-0 items-center gap-2 text-[13px] font-bold">
                      <input type="checkbox" checked={entry.accepted} onChange={(e) => update(row.index, { accepted: e.target.checked })} className="h-5 w-5" />
                      <span className="hidden sm:inline">{t("importAi.accept")}</span>
                    </label>
                  )}
                </div>
                {!row.ok && <div className="text-[13px] font-bold text-app-danger">{t("importAi.cantImport")}</div>}
                {row.ok && !entry && <div className="text-[13px] text-app-ink-soft">{t("importAi.waiting")}</div>}
                {row.ok && entry && editing !== row.index && (
                  <div className="grid gap-1 text-[13px]">
                    <div className="text-[11.5px] font-bold uppercase tracking-wide text-app-ink-soft">{entry.source === "ai" ? t("importAi.fromAi") : t("importAi.fromRules")}</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-app-ink-soft">
                      {entry.enhancement.category && <span>{t("importAi.f.category")}: <b className="text-app-ink">{entry.enhancement.category}</b></span>}
                      {entry.enhancement.productType && <span>{t("importAi.f.type")}: <b className="text-app-ink">{t.dynamic(`type.${entry.enhancement.productType}`, entry.enhancement.productType)}</b></span>}
                      {!!entry.enhancement.specifications?.length && <span>{t("importAi.specsCount", { count: entry.enhancement.specifications.length })}</span>}
                      {!!entry.enhancement.faqs?.length && <span>{t("importAi.faqsCount", { count: entry.enhancement.faqs.length })}</span>}
                      {!!entry.enhancement.tags?.length && <span>{entry.enhancement.tags.join(", ")}</span>}
                    </div>
                    {entry.enhancement.description && <p className="m-0 line-clamp-3 whitespace-pre-line text-app-ink">{entry.enhancement.description}</p>}
                    <div>
                      <PillButton tone="ghost" size="sm" disabled={filling} onClick={() => setEditing(row.index)}>{t("importAi.edit")}</PillButton>
                    </div>
                  </div>
                )}
                {row.ok && entry && editing === row.index && (
                  <EditSuggestion
                    value={entry.enhancement}
                    onSave={(enhancement) => {
                      update(row.index, { enhancement, accepted: true });
                      setEditing(null);
                    }}
                    onCancel={() => setEditing(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>
        {analysis.rows.length > shown && (
          <div><PillButton tone="white" size="sm" onClick={() => setShown((n) => n + PAGE)}>{t("importAi.showMore")}</PillButton></div>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <PillButton tone="accent" size="md" busy={importing === "with"} disabled={filling || importing !== null || !analysis.counts.ready || Boolean(analysis.headerProblem) || columnsChanged} onClick={() => runImport(true)}>
          {t("importAi.importWith", { count: analysis.counts.ready })}
        </PillButton>
        <PillButton tone="white" size="md" busy={importing === "without"} disabled={importing !== null || !analysis.counts.ready || Boolean(analysis.headerProblem) || columnsChanged} onClick={() => runImport(false)}>
          {t("importAi.importWithout")}
        </PillButton>
        <PillButton tone="ghost" size="md" disabled={importing !== null} onClick={onBack}>{t("importAi.back")}</PillButton>
      </div>
      {acceptedCount < readyRows.length && !filling && <div className="text-[13px] text-app-ink-soft">{t("importAi.acceptedCount", { count: acceptedCount, total: readyRows.length })}</div>}
    </div>
  );
}

function EditSuggestion({ value, onSave, onCancel }: { value: ImportEnhancement; onSave: (value: ImportEnhancement) => void; onCancel: () => void }) {
  const t = useT("products", "productTypes");
  const [description, setDescription] = useState(value.description ?? "");
  const [category, setCategory] = useState(value.category ?? "");
  const [productType, setProductType] = useState(value.productType ?? "");
  const [specs, setSpecs] = useState(specsToText(value.specifications));
  const [tags, setTags] = useState((value.tags ?? []).join(", "));
  const [seoTitle, setSeoTitle] = useState(value.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(value.seoDescription ?? "");
  const [faqs, setFaqs] = useState(faqsToText(value.faqs));
  const [care, setCare] = useState(value.careInstructions ?? "");

  const save = () => {
    const next = ImportEnhancementSchema.safeParse({
      ...value,
      description: description.trim() || undefined,
      category: category.trim() || undefined,
      productType: productType || undefined,
      specifications: textToSpecs(specs).slice(0, 30),
      tags: tags.split(",").map((tag) => tag.trim().slice(0, 40)).filter(Boolean).slice(0, 20),
      seoTitle: seoTitle.trim().slice(0, 70) || undefined,
      seoDescription: seoDescription.trim().slice(0, 160) || undefined,
      faqs: textToFaqs(faqs),
      careInstructions: care.trim() || undefined,
      productDetails: productType && productType === value.productType ? value.productDetails : undefined,
    });
    if (next.success) onSave(next.data);
  };

  const input = "min-h-[40px] w-full rounded-[10px] border border-app-line bg-white px-3 py-2 text-[14px]";
  const field = (label: string, control: React.ReactNode) => (
    <label className="grid gap-1 text-[13px] font-bold">
      <span>{label}</span>
      {control}
    </label>
  );
  return (
    <div className="grid gap-2">
      {field(t("importAi.f.description"), <textarea className={input} rows={4} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} />)}
      <div className="grid gap-2 sm:grid-cols-2">
        {field(t("importAi.f.category"), <input className={input} maxLength={60} value={category} onChange={(e) => setCategory(e.target.value)} />)}
        {field(
          t("importAi.f.type"),
          <select className={input} value={productType} onChange={(e) => setProductType(e.target.value)}>
            <option value="">—</option>
            {PRODUCT_TYPES.map((type) => <option key={type.key} value={type.key}>{t.dynamic(`type.${type.key}`, type.label)}</option>)}
          </select>,
        )}
      </div>
      {field(t("importAi.f.specs"), <textarea className={input} rows={4} value={specs} onChange={(e) => setSpecs(e.target.value)} />)}
      {field(t("importAi.f.tags"), <input className={input} value={tags} onChange={(e) => setTags(e.target.value)} />)}
      <div className="grid gap-2 sm:grid-cols-2">
        {field(t("importAi.f.seoTitle"), <input className={input} maxLength={70} value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />)}
        {field(t("importAi.f.seoDescription"), <input className={input} maxLength={160} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} />)}
      </div>
      {field(t("importAi.f.faqs"), <textarea className={input} rows={4} value={faqs} onChange={(e) => setFaqs(e.target.value)} />)}
      {field(t("importAi.f.care"), <textarea className={input} rows={2} maxLength={5000} value={care} onChange={(e) => setCare(e.target.value)} />)}
      <div className="flex flex-wrap gap-2">
        <PillButton tone="ink" size="sm" onClick={save}>{t("importAi.done")}</PillButton>
        <PillButton tone="ghost" size="sm" onClick={onCancel}>{t("importAi.cancel")}</PillButton>
      </div>
    </div>
  );
}
