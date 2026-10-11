"use client";

import { useEffect, useState } from "react";
import { FieldLabel, Notice, PillButton, TextInput, Toggle, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";

export interface DomainPartner {
  id: string;
  name: string;
  baseUrl: string;
  affiliateUrl: string | null;
  logoUrl: string | null;
  description: string;
  featured: boolean;
  sortOrder: number;
  active: boolean;
  createdAt: string;
}

interface FormState {
  name: string;
  baseUrl: string;
  affiliateUrl: string;
  description: string;
  featured: boolean;
  sortOrder: number;
  active: boolean;
}

const empty: FormState = {
  name: "",
  baseUrl: "",
  affiliateUrl: "",
  description: "",
  featured: false,
  sortOrder: 0,
  active: true,
};

function shortUrl(url: string) {
  return url.replace(/^https?:\/\//, "");
}

export function DomainPartnersManager({ initialPartners }: { initialPartners: DomainPartner[] }) {
  const [partners, setPartners] = useState<DomainPartner[]>(initialPartners);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [toast, setToast] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }

  async function load() {
    try {
      const res = await fetch("/api/admin/domain-partners");
      if (!res.ok) throw new Error();
      const json = await res.json() as { data?: DomainPartner[] };
      setPartners(json.data ?? []);
      setError(null);
    } catch {
      setError("Could not reload domain partners. Refresh the page to try again.");
    }
  }

  useEffect(() => {
    if (!showForm) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowForm(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showForm]);

  function openCreate() {
    setEditingId(null);
    setForm(empty);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(p: DomainPartner) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      baseUrl: p.baseUrl,
      affiliateUrl: p.affiliateUrl ?? "",
      description: p.description,
      featured: p.featured,
      sortOrder: p.sortOrder,
      active: p.active,
    });
    setFormError(null);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.baseUrl.trim()) {
      setFormError("Name and website are required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        name: form.name.trim(),
        baseUrl: form.baseUrl.trim(),
        affiliateUrl: form.affiliateUrl.trim() || null,
        description: form.description.trim(),
        featured: form.featured,
        sortOrder: form.sortOrder,
        active: form.active,
      };
      const res = editingId
        ? await fetch(`/api/admin/domain-partners/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/admin/domain-partners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Save failed.");
      setShowForm(false);
      setEditingId(null);
      flash(editingId ? "Partner updated." : "Partner added.");
      await load();
    } catch {
      setFormError("Could not save this partner. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remove "${name}" from the domain partners list?`)) return;
    try {
      const res = await fetch(`/api/admin/domain-partners/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      flash("Partner removed.");
      await load();
    } catch {
      flash("Could not remove this partner.");
    }
  }

  async function toggleActive(p: DomainPartner) {
    try {
      const res = await fetch(`/api/admin/domain-partners/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !p.active }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      flash("Could not update this partner.");
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[14px] text-app-ink-soft">
          {partners.length} {partners.length === 1 ? "partner" : "partners"} · {partners.filter((p) => p.active).length} shown to sellers
        </p>
        <PillButton tone="accent" size="md" onClick={openCreate}>
          <Icon name="plus" size={16} /> Add partner
        </PillButton>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {partners.length === 0 ? (
        <section className="flex flex-col items-center rounded-[22px] border border-app-line bg-white px-6 py-12 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-app-peach text-app-accent-ink"><Icon name="globe" size={22} /></span>
          <h2 className="mb-0 mt-4 text-[18px] font-extrabold">No domain partners yet</h2>
          <p className="mb-0 mt-1.5 max-w-[460px] text-[14.5px] leading-[1.55] text-app-ink-soft">
            Add registrars with affiliate links to show sellers where to buy a domain.
          </p>
          <PillButton tone="ink" size="md" className="mt-5" onClick={openCreate}>Add first partner</PillButton>
        </section>
      ) : (
        <ul className="m-0 list-none divide-y divide-app-line overflow-hidden rounded-[22px] border border-app-line bg-white p-0">
          {partners.map((p) => (
            <li key={p.id} className={cx("flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 sm:px-5 lg:flex-nowrap", !p.active && "bg-app-canvas/60")}>
              <div className="min-w-0 flex-1 basis-[220px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[15px] font-extrabold">{p.name}</span>
                  {p.featured && <span className="rounded-full bg-app-peach px-2.5 py-0.5 text-[12px] font-bold text-app-accent-ink">Featured</span>}
                </div>
                {p.description && <div className="truncate text-[13px] text-app-ink-soft">{p.description}</div>}
              </div>

              <div className="grid min-w-0 gap-0.5 text-[13px] lg:w-[320px] lg:shrink-0">
                <a href={p.baseUrl} target="_blank" rel="noopener noreferrer" className="truncate font-bold text-app-ink underline-offset-2 hover:underline">
                  {shortUrl(p.baseUrl)}
                </a>
                {p.affiliateUrl ? (
                  <a href={p.affiliateUrl} target="_blank" rel="noopener noreferrer" className="truncate text-app-accent-ink underline-offset-2 hover:underline" title={p.affiliateUrl}>
                    Affiliate: {shortUrl(p.affiliateUrl)}
                  </a>
                ) : (
                  <span className="text-app-ink-faint">No affiliate link</span>
                )}
              </div>

              <div className="flex items-center gap-2.5">
                <Toggle on={p.active} onChange={() => void toggleActive(p)} label={`Show ${p.name} to sellers`} />
                <span className={cx("w-[52px] text-[13px] font-bold", p.active ? "text-app-success" : "text-app-ink-soft")}>{p.active ? "Shown" : "Hidden"}</span>
              </div>

              <div className="flex items-center gap-2">
                <PillButton tone="white" size="sm" onClick={() => openEdit(p)} aria-label={`Edit ${p.name}`}>
                  <Icon name="edit" size={14} /> Edit
                </PillButton>
                <PillButton tone="white" size="sm" className="text-app-danger" onClick={() => void handleDelete(p.id, p.name)} aria-label={`Delete ${p.name}`}>
                  <Icon name="trash" size={14} /> Delete
                </PillButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[9000] flex items-end justify-center bg-app-ink/50 p-0 sm:items-center sm:p-4" onClick={() => setShowForm(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="domain-partner-form-title"
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[22px] bg-white p-5 font-app text-app-ink shadow-[0_16px_48px_rgba(22,20,31,0.2)] sm:max-w-[560px] sm:rounded-[22px] sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="domain-partner-form-title" className="m-0 text-[20px] font-extrabold">
                {editingId ? "Edit partner" : "Add domain partner"}
              </h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                aria-label="Close"
                className="grid h-10 w-10 place-items-center rounded-full text-app-ink-soft hover:bg-app-canvas hover:text-app-ink"
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSave();
              }}
            >
              <div>
                <FieldLabel htmlFor="dp-name">Registrar name</FieldLabel>
                <TextInput id="dp-name" required autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Namecheap" />
              </div>
              <div>
                <FieldLabel htmlFor="dp-base">Website</FieldLabel>
                <TextInput id="dp-base" required type="url" value={form.baseUrl} onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))} placeholder="https://namecheap.com" />
              </div>
              <div>
                <FieldLabel htmlFor="dp-aff">Affiliate link</FieldLabel>
                <TextInput id="dp-aff" type="url" value={form.affiliateUrl} onChange={(e) => setForm((f) => ({ ...f, affiliateUrl: e.target.value }))} placeholder="https://namecheap.com?aff=YOUR_ID" />
                <p className="mb-0 mt-1.5 text-[13px] text-app-ink-soft">Leave empty to send sellers to the website without tracking.</p>
              </div>
              <div>
                <FieldLabel htmlFor="dp-desc">Short description</FieldLabel>
                <TextInput id="dp-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. Popular choice with fair prices" />
              </div>
              <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
                <div>
                  <FieldLabel htmlFor="dp-sort">Sort order</FieldLabel>
                  <TextInput id="dp-sort" type="number" min={0} value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))} />
                </div>
                <div className="grid content-end gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[14px] font-bold">Featured</span>
                    <Toggle on={form.featured} onChange={(on) => setForm((f) => ({ ...f, featured: on }))} label="Featured" />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[14px] font-bold">Shown to sellers</span>
                    <Toggle on={form.active} onChange={(on) => setForm((f) => ({ ...f, active: on }))} label="Shown to sellers" />
                  </div>
                </div>
              </div>

              {formError && <Notice tone="error">{formError}</Notice>}

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <PillButton tone="white" size="md" onClick={() => setShowForm(false)}>Cancel</PillButton>
                <PillButton tone="ink" size="md" type="submit" busy={saving}>
                  {editingId ? "Save changes" : "Add partner"}
                </PillButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div role="status" className="pointer-events-none fixed bottom-6 left-1/2 z-[9999] -translate-x-1/2 rounded-full bg-app-ink px-5 py-2.5 text-[14px] font-bold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
