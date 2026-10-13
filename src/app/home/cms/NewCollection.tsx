"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Notice, PillButton, cx } from "@/components/app-ui";
import { Modal } from "@/components/cms/pickers";
import { COLLECTION_TEMPLATES, FIELD_TYPE_INFO, getTemplate, slugError, slugify, type TemplateId } from "@/lib/cms/fields";
import { TEMPLATE_ICON } from "./shared";

// Template gallery and the "New collection" dialog on /home/cms.

const input = "min-h-[44px] w-full rounded-[14px] border border-app-line bg-white px-3.5 text-[14.5px] outline-none focus:border-app-ink";

function CreateDialog({ template, takenSlugs, onClose }: { template: TemplateId; takenSlugs: string[]; onClose: () => void }) {
  const router = useRouter();
  const base = getTemplate(template);
  const [name, setName] = useState(base.name === "Blank collection" ? "" : base.name);
  const [slug, setSlug] = useState(takenSlugs.includes(base.slug) ? "" : base.slug);
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const effectiveSlug = slugTouched ? slug : slug || slugify(name);
  const problem = effectiveSlug ? slugError(effectiveSlug, "collection") ?? (takenSlugs.includes(effectiveSlug) ? "Another collection already uses this address" : null) : null;

  async function create() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/app/cms/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template, name: name.trim() || undefined, slug: effectiveSlug || undefined }) });
      const json = (await res.json().catch(() => null)) as { data?: { id: string }; error?: { message?: string } } | null;
      if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "Couldn't create the collection");
      router.push(`/home/cms/${json.data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the collection");
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`New ${base.id === "blank" ? "collection" : base.name.toLowerCase()}`}
      onClose={onClose}
      footer={<><PillButton tone="white" size="sm" onClick={onClose}>Cancel</PillButton><PillButton tone="ink" size="sm" busy={busy} disabled={!name.trim() || Boolean(problem)} onClick={() => void create()}>Create collection</PillButton></>}
    >
      <div className="grid gap-4">
        {error && <Notice>{error}</Notice>}
        <div>
          <label htmlFor="cms-new-name" className="mb-1.5 block text-[13.5px] font-bold">Name</label>
          <input id="cms-new-name" className={input} value={name} maxLength={80} placeholder="e.g. Spice recipes" onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(""); }} />
        </div>
        <div>
          <label htmlFor="cms-new-slug" className="mb-1.5 block text-[13.5px] font-bold">Web address <span className="block text-[12.5px] font-normal text-app-ink-soft">Shoppers find it at yourstore/{effectiveSlug || "…"}</span></label>
          <input id="cms-new-slug" className={input} value={effectiveSlug} maxLength={80} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-")); }} aria-invalid={Boolean(problem)} aria-describedby="cms-new-slug-error" />
          {problem && <p id="cms-new-slug-error" className="m-0 mt-1.5 text-[13px] text-app-danger">{problem}</p>}
        </div>
        <div>
          <p className="m-0 mb-2 text-[13.5px] font-bold">Starts with these fields</p>
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            <li className="rounded-full bg-app-canvas px-2.5 py-1 text-[12.5px] font-bold">Title</li>
            {base.fields.map((field) => (
              <li key={field.key} className="rounded-full bg-app-canvas px-2.5 py-1 text-[12.5px]"><strong>{field.label}</strong> · {FIELD_TYPE_INFO[field.type].label.toLowerCase()}</li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-[12.5px] text-app-ink-soft">Add, remove and reorder fields any time. Every item also gets a search (SEO) tab.</p>
        </div>
      </div>
    </Modal>
  );
}

export function TemplateGallery({ takenSlugs, compact = false }: { takenSlugs: string[]; compact?: boolean }) {
  const [picked, setPicked] = useState<TemplateId | null>(null);
  return (
    <>
      <ul className={cx("m-0 grid list-none gap-3 p-0", compact ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-5" : "sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5")}>
        {COLLECTION_TEMPLATES.map((template) => (
          <li key={template.id} className="min-w-0">
            <button type="button" onClick={() => setPicked(template.id)} className="flex h-full w-full flex-col items-start gap-2 rounded-[18px] border border-app-line bg-white p-4 text-left transition hover:border-app-ink focus-visible:border-app-ink">
              <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-app-peach text-app-accent-ink"><Icon name={TEMPLATE_ICON[template.id] ?? "layers"} size={18} /></span>
              <span className="text-[15px] font-extrabold">{template.name}</span>
              {!compact && <span className="text-[13px] leading-5 text-app-ink-soft">{template.blurb}</span>}
            </button>
          </li>
        ))}
      </ul>
      {picked && <CreateDialog template={picked} takenSlugs={takenSlugs} onClose={() => setPicked(null)} />}
    </>
  );
}

export function NewCollectionButton({ takenSlugs }: { takenSlugs: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PillButton tone="accent" size="md" onClick={() => setOpen(true)}><Icon name="plus" size={16} /> New collection</PillButton>
      {open && (
        <Modal title="Start from a template" wide onClose={() => setOpen(false)}>
          <TemplateGallery takenSlugs={takenSlugs} compact />
        </Modal>
      )}
    </>
  );
}
