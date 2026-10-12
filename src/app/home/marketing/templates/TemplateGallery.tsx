"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, EmptyState, Pill } from "@/components/app-kit";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { buttonClass } from "@/components/growth/kit";
import { DeviceSwitch, EmailFrame, EmailThumbnail } from "../_kit/EmailFrame";
import { TemplateCopyButton } from "./TemplateCopyButton";

// The template gallery: the shop's own templates and the starters, each with a live thumbnail of the real
// email, category chips, search, and a full-size preview (computer or phone) before using one.

export interface GalleryTemplate {
  /** Saved template id, or starter key. */
  id: string;
  saved: boolean;
  name: string;
  category: string;
  categoryLabel: string;
  description: string;
  subject: string;
  html: string;
}

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

function TemplateCard({ template, onPreview }: { template: GalleryTemplate; onPreview: () => void }) {
  return (
    <Card as="article" className="flex min-w-0 flex-col overflow-hidden">
      <button type="button" onClick={onPreview} className="group relative block border-b border-app-line text-left" aria-label={`Preview ${template.name}`}>
        <EmailThumbnail html={template.html} label={template.name} />
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

export function TemplateGallery({ saved, library, categories }: { saved: GalleryTemplate[]; library: GalleryTemplate[]; categories: Array<{ value: string; label: string }> }) {
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<GalleryTemplate | null>(null);

  const used = useMemo(() => new Set([...saved, ...library].map((t) => t.category)), [saved, library]);
  const chips = [{ value: "all", label: "All" }, ...(saved.length ? [{ value: "mine", label: `Yours · ${saved.length}` }] : []), ...categories.filter((c) => used.has(c.value))];
  const matches = (t: GalleryTemplate) => {
    if (filter !== "all" && filter !== "mine" && t.category !== filter) return false;
    const q = query.trim().toLowerCase();
    return !q || `${t.name} ${t.description} ${t.subject} ${t.categoryLabel}`.toLowerCase().includes(q);
  };
  const mine = saved.filter(matches);
  const starters = filter === "mine" ? [] : library.filter(matches);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Template kinds" className="flex min-w-0 flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip.value}
              type="button"
              aria-pressed={filter === chip.value}
              onClick={() => setFilter(chip.value)}
              className={cx("inline-flex min-h-[40px] items-center rounded-full border px-4 text-[14px] font-bold", filter === chip.value ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong")}
            >
              {chip.label}
            </button>
          ))}
        </nav>
        <label className="flex min-h-[44px] w-full items-center gap-2 rounded-full border border-app-line bg-white px-4 sm:w-[300px]">
          <Icon name="search" size={16} className="shrink-0 text-app-ink-soft" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search templates" aria-label="Search templates" className="min-w-0 flex-1 border-0 bg-transparent text-[14.5px] outline-none placeholder:text-app-ink-faint" />
        </label>
      </div>

      {(filter === "all" || filter === "mine") && (saved.length > 0 || filter === "mine") ? (
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

      {filter !== "mine" ? (
        <section className="grid gap-3">
          <h2 className="m-0 text-[17px] font-extrabold">Starter templates</h2>
          {starters.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {starters.map((t) => <TemplateCard key={t.id} template={t} onPreview={() => setPreview(t)} />)}
            </div>
          ) : (
            <EmptyState icon="search" title="No starters match">Try another word, or start a new template and ask Peggy to write it.</EmptyState>
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
