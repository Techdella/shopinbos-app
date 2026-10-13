"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, EmptyState, Pill } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { buttonClass } from "@/components/growth/kit";
import { DeviceSwitch, EmailFrame, EmailThumbnail } from "../_kit/EmailFrame";
import { api, errorText } from "../_kit/client";
import { TemplateCopyButton } from "./TemplateCopyButton";

// The template gallery: the shop's own templates and the starters, each with a live thumbnail of the real
// email. Tabs follow the customer journey (welcome, cart, after purchase, sales, seasons, games, win-back,
// news, wholesale), with a style filter and search. Ready-made series (welcome 3, cart 3, win-back 2) can be
// switched on in one go: "Use the whole series" makes an automation draft with the emails, waits and checks.

export interface GalleryTemplate {
  /** Saved template id, or starter key. */
  id: string;
  saved: boolean;
  name: string;
  category: string;
  categoryLabel: string;
  /** Starters only: the journey tab and style family. */
  flow?: string;
  style?: string;
  styleLabel?: string;
  description: string;
  subject: string;
  html: string;
}

export interface GallerySeries {
  key: string;
  name: string;
  description: string;
  flow: string;
  steps: Array<{ templateId: string; when: string; code: boolean }>;
}

type Option = { value: string; label: string };

function Actions({ template, size = "sm" }: { template: GalleryTemplate; size?: "sm" | "md" }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link href={`/home/marketing/campaigns/new?template=${template.id}`} className={cx(buttonClass("ink", size), "no-underline")}>Use in a campaign</Link>
      {template.saved ? (
        <Link href={`/home/marketing/templates/${template.id}`} className={cx(buttonClass("white", size), "no-underline")}>Edit</Link>
      ) : (
        <TemplateCopyButton templateKey={template.id} />
      )}
    </div>
  );
}

function TemplateCard({ template, onPreview, step }: { template: GalleryTemplate; onPreview: () => void; step?: string }) {
  return (
    <Card as="article" className="flex min-w-0 flex-col overflow-hidden">
      <button type="button" onClick={onPreview} className="group relative block border-b border-app-line text-left" aria-label={`Preview ${template.name}`}>
        <EmailThumbnail html={template.html} label={template.name} />
        {step ? <span className="absolute left-3 top-3 rounded-full bg-app-ink px-2.5 py-1 text-[11.5px] font-bold text-white">{step}</span> : null}
        <span className="absolute inset-x-0 bottom-3 flex justify-center opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          <span className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-app-ink px-4 text-[13px] font-bold text-white"><Icon name="eye" size={14} /> Preview</span>
        </span>
      </button>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="m-0 min-w-0 text-[15.5px] font-extrabold leading-tight">{template.name}</h3>
          <Pill tone={template.saved ? "accent" : "muted"}>{template.categoryLabel}</Pill>
        </div>
        <p className="m-0 text-[13.5px] leading-[1.45] text-app-ink-soft">{template.description}</p>
        {template.styleLabel ? <p className="m-0 text-[12px] font-bold uppercase tracking-[0.08em] text-app-ink-faint">{template.styleLabel} style</p> : null}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <button type="button" onClick={onPreview} className={buttonClass("white", "sm")}><Icon name="eye" size={14} /> Preview</button>
          <Actions template={template} />
        </div>
      </div>
    </Card>
  );
}

function PreviewDialog({ template, onClose }: { template: GalleryTemplate; onClose: () => void }) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
      aria-label={`Preview of ${template.name}`}
      className="m-auto w-[min(920px,calc(100vw-24px))] max-w-none rounded-[22px] border-0 bg-white p-0 text-app-ink backdrop:bg-black/50"
    >
      <div className="grid max-h-[calc(100dvh-24px)] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 truncate text-[18px] font-extrabold">{template.name}</h2>
            <p className="m-0 truncate text-[13.5px] text-app-ink-soft">Subject: <strong className="text-app-ink">{template.subject}</strong></p>
          </div>
          <DeviceSwitch value={device} onChange={setDevice} />
          <button type="button" onClick={onClose} aria-label="Close preview" className="grid h-11 w-11 place-items-center rounded-full hover:bg-app-canvas"><Icon name="x" size={18} /></button>
        </div>
        <div className="min-h-0 overflow-auto">
          <EmailFrame html={template.html} device={device} className="[&_iframe]:h-[min(640px,calc(100dvh-220px))]" title={`${template.name} preview`} />
        </div>
        <Actions template={template} size="md" />
      </div>
    </dialog>
  );
}

/**
 * "Use the whole series": an automation draft (switched off) with every email, wait and check. If that can't
 * be made, the emails are copied into the shop's templates instead, with a link to Automations.
 */
function SeriesButton({ series }: { series: GallerySeries }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  async function useSeries() {
    setBusy(true);
    setMessage(null);
    try {
      const flow = await api<{ id: string }>("/api/app/marketing/automations", "POST", { presetKey: `series:${series.key}` });
      router.push(`/home/automations/${flow.id}`);
    } catch (error) {
      try {
        for (const step of series.steps) await api("/api/app/marketing/templates", "POST", { copy: step.templateId });
        setMessage({ tone: "info", text: `The automation couldn't be made (${errorText(error)}), so the ${series.steps.length} emails were saved to your designs. Add them to a flow in Automations.` });
      } catch (copyError) {
        setMessage({ tone: "error", text: errorText(copyError) });
      }
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void useSeries()} className={buttonClass("ink", "sm")}>
          <Icon name="automation" size={14} /> {busy ? "Setting up…" : "Use the whole series"}
        </button>
        {message?.tone === "info" ? <Link href="/home/automations" className={cx(buttonClass("white", "sm"), "no-underline")}>Open Automations</Link> : null}
      </div>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </div>
  );
}

function SeriesCard({ series, templates, onPreview }: { series: GallerySeries; templates: Map<string, GalleryTemplate>; onPreview: (template: GalleryTemplate) => void }) {
  return (
    <Card as="article" className="grid min-w-0 gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 font-mono text-[11px] uppercase tracking-[0.16em] text-app-ink-soft">Series · {series.steps.length} emails</p>
          <h3 className="m-0 text-[18px] font-extrabold">{series.name}</h3>
          <p className="m-0 max-w-[640px] text-[13.5px] leading-[1.45] text-app-ink-soft">{series.description}</p>
        </div>
        <SeriesButton series={series} />
      </div>
      <ol className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
        {series.steps.map((step, index) => {
          const template = templates.get(step.templateId);
          if (!template) return null;
          return (
            <li key={step.templateId} className="min-w-0">
              <button type="button" onClick={() => onPreview(template)} className="group block w-full overflow-hidden rounded-[16px] border border-app-line text-left hover:border-app-line-strong" aria-label={`Preview ${template.name}`}>
                <EmailThumbnail html={template.html} label={template.name} ratio={0.9} />
                <span className="block border-t border-app-line px-3 py-2">
                  <span className="block text-[12px] font-bold text-app-ink-soft">{index + 1}. {step.when}{step.code ? " · makes a code" : ""}</span>
                  <span className="block truncate text-[13.5px] font-extrabold">{template.name.replace(/^[^:]+:\s*/, "")}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

export function TemplateGallery({ saved, library, series, flows, styles }: { saved: GalleryTemplate[]; library: GalleryTemplate[]; series: GallerySeries[]; flows: Option[]; styles: Option[] }) {
  const [filter, setFilter] = useState<string>("all");
  const [style, setStyle] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<GalleryTemplate | null>(null);

  const byId = useMemo(() => new Map(library.map((t) => [t.id, t])), [library]);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of library) if (t.flow) map.set(t.flow, (map.get(t.flow) ?? 0) + 1);
    return map;
  }, [library]);
  const tabs = [{ value: "all", label: "All", count: library.length }, ...(saved.length ? [{ value: "mine", label: "Yours", count: saved.length }] : []), ...flows.filter((f) => counts.has(f.value)).map((f) => ({ ...f, count: counts.get(f.value) ?? 0 }))];
  const q = query.trim().toLowerCase();
  const matchesText = (t: GalleryTemplate) => !q || `${t.name} ${t.description} ${t.subject} ${t.categoryLabel} ${t.styleLabel ?? ""}`.toLowerCase().includes(q);
  const matches = (t: GalleryTemplate) => {
    if (filter !== "all" && filter !== "mine" && t.flow !== filter) return false;
    if (style !== "all" && t.style !== style) return false;
    return matchesText(t);
  };
  const mine = saved.filter(matchesText);
  const starters = filter === "mine" ? [] : library.filter(matches);
  const shownSeries = filter === "mine" || q || style !== "all" ? [] : series.filter((s) => filter === "all" || s.flow === filter);

  return (
    <div className="grid gap-5">
      <nav aria-label="Template journeys" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              aria-pressed={filter === tab.value}
              onClick={() => setFilter(tab.value)}
              className={cx("inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-[14px] font-bold", filter === tab.value ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong")}
            >
              {tab.label}
              <span className={cx("text-[12px] font-semibold", filter === tab.value ? "text-white/70" : "text-app-ink-soft")}>{tab.count}</span>
            </button>
          ))}
        </div>
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-[44px] w-full items-center gap-2 rounded-full border border-app-line bg-white px-4 sm:w-[300px]">
          <Icon name="search" size={16} className="shrink-0 text-app-ink-soft" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search templates" aria-label="Search templates" className="min-w-0 flex-1 border-0 bg-transparent text-[14.5px] outline-none placeholder:text-app-ink-faint" />
        </label>
        <label className="flex min-h-[44px] items-center gap-2 rounded-full border border-app-line bg-white pl-4 pr-2 text-[13.5px] font-bold">
          <Icon name="palette" size={15} className="shrink-0 text-app-ink-soft" />
          <span className="sr-only">Style</span>
          <select value={style} onChange={(e) => setStyle(e.target.value)} aria-label="Style" className="h-[40px] border-0 bg-transparent pr-1 text-[14px] font-bold outline-none">
            <option value="all">All styles</option>
            {styles.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
      </div>

      {(filter === "all" || filter === "mine") && (saved.length > 0 || filter === "mine") && style === "all" ? (
        <section className="grid gap-3">
          <h2 className="m-0 text-[17px] font-extrabold">Your templates</h2>
          {mine.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {mine.map((t) => <TemplateCard key={t.id} template={t} onPreview={() => setPreview(t)} />)}
            </div>
          ) : (
            <p className="m-0 text-[14px] text-app-ink-soft">None of your templates match.</p>
          )}
        </section>
      ) : null}

      {shownSeries.length ? (
        <section className="grid gap-3">
          <div>
            <h2 className="m-0 text-[17px] font-extrabold">Ready-made series</h2>
            <p className="m-0 text-[13.5px] text-app-ink-soft">Emails that work as a set. Switch one on and it becomes an automation you can check and edit before it goes live.</p>
          </div>
          <div className="grid gap-4 2xl:grid-cols-2">
            {shownSeries.map((s) => <SeriesCard key={s.key} series={s} templates={byId} onPreview={setPreview} />)}
          </div>
        </section>
      ) : null}

      {filter !== "mine" ? (
        <section className="grid gap-3">
          <h2 className="m-0 text-[17px] font-extrabold">{filter === "all" ? "Starter templates" : tabs.find((tab) => tab.value === filter)?.label}</h2>
          {starters.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {starters.map((t) => <TemplateCard key={t.id} template={t} onPreview={() => setPreview(t)} />)}
            </div>
          ) : (
            <EmptyState icon="search" title="No starters match">Try another word or style, or start a new template and ask Peggy to write it.</EmptyState>
          )}
        </section>
      ) : null}

      {!saved.length && filter === "all" && !query ? (
        <p className="m-0 text-[13.5px] text-app-ink-soft">Templates you save show up first here, and in the campaign editor.</p>
      ) : null}

      {preview ? <PreviewDialog template={preview} onClose={() => setPreview(null)} /> : null}
    </div>
  );
}
