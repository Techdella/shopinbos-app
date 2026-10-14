"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { FieldLabel, Mascot, Notice, PillButton, TextInput, cx } from "@/components/app-ui";
import { useT } from "@/components/i18n/I18nProvider";

const PAGE_TYPES = [
  { id: "home", icon: "home" },
  { id: "product", icon: "box" },
  { id: "collection", icon: "layers" },
  { id: "about", icon: "info" },
  { id: "contact", icon: "mail" },
  { id: "faq", icon: "chat" },
  { id: "blog", icon: "book" },
  { id: "custom", icon: "code" },
] as const satisfies ReadonlyArray<{ id: string; icon: IconName }>;

// The pages API keys pages by type, so creating a type that already exists would overwrite it.
export function NewPageForm({ existing }: { existing: Array<{ id: string; slug: string; title: string }> }) {
  const router = useRouter();
  const t = useT("store");
  const pageTypes = PAGE_TYPES.map((pt) => ({ ...pt, name: t(`pages.type.${pt.id}`), desc: t(`pages.type.${pt.id}.desc`) }));
  const [type, setType] = useState<string>("");
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const existingFor = (id: string) => existing.find((page) => page.slug === id);

  function pick(id: string) {
    setType(id);
    const preset = pageTypes.find((pt) => pt.id === id);
    if (preset && (!title || pageTypes.some((pt) => pt.name === title))) setTitle(preset.name);
  }

  async function create() {
    if (!type || !title.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/store/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages: [{ type, title: title.trim(), userContent: brief.trim() || undefined }] }),
      });
      const json = (await res.json().catch(() => null)) as { data?: Array<{ id: string }>; error?: { message?: string } } | null;
      const created = json?.data?.[0];
      if (!res.ok || !created) throw new Error(json?.error?.message ?? t("pages.createError"));
      router.push(`/home/pages/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("pages.createError"));
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="min-w-0 rounded-[22px] border border-app-line bg-white p-5">
        <h2 className="m-0 text-[17px] font-extrabold">{t("pages.pageType")}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" role="radiogroup" aria-label={t("pages.pageType")}>
          {pageTypes.map((pt) => {
            const already = existingFor(pt.id);
            const on = type === pt.id;
            if (already) {
              return (
                <a
                  key={pt.id}
                  href={`/home/pages/${already.id}`}
                  className="flex min-w-0 flex-col gap-2 rounded-[18px] border-2 border-dashed border-app-line p-4 text-app-ink no-underline hover:border-app-line-strong"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-app-canvas"><Icon name={pt.icon} size={18} /></span>
                  <span className="text-[14.5px] font-extrabold">{pt.name}</span>
                  <span className="text-[13px] text-app-ink-soft">{t("pages.already")}</span>
                </a>
              );
            }
            return (
              <button
                key={pt.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pick(pt.id)}
                className={cx("flex min-w-0 flex-col items-start gap-2 rounded-[18px] border-2 p-4 text-left transition", on ? "border-app-ink bg-app-canvas" : "border-app-line hover:border-app-line-strong")}
              >
                <span className={cx("grid h-10 w-10 place-items-center rounded-full", on ? "bg-app-ink text-white" : "bg-app-canvas")}><Icon name={pt.icon} size={18} /></span>
                <span className="text-[14.5px] font-extrabold">{pt.name}</span>
                <span className="text-[13px] leading-[1.45] text-app-ink-soft">{pt.desc}</span>
              </button>
            );
          })}
        </div>
      </section>

      <aside className="grid min-w-0 content-start gap-5">
        <section className="rounded-[22px] border border-app-line bg-white p-5">
          <h2 className="m-0 text-[17px] font-extrabold">{t("pages.details")}</h2>
          <div className="mt-4 grid gap-4">
            <div>
              <FieldLabel htmlFor="page-title">{t("pages.name")}</FieldLabel>
              <TextInput id="page-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("pages.namePh")} maxLength={200} />
            </div>
            <div>
              <FieldLabel htmlFor="page-brief">{t("pages.brief")}</FieldLabel>
              <textarea
                id="page-brief"
                rows={4}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder={t("pages.briefPh")}
                className="w-full resize-y rounded-[16px] border border-app-line bg-white px-4 py-3 text-[15px] text-app-ink outline-none placeholder:text-app-ink-faint focus:border-app-ink"
              />
            </div>
            {error && <Notice>{error}</Notice>}
            <PillButton tone="accent" size="md" onClick={() => void create()} busy={busy} disabled={!type || !title.trim()} className="w-full">
              {t("pages.createBtn")}
            </PillButton>
            {!type && <p className="m-0 text-center text-[13px] text-app-ink-soft">{t("pages.pickFirst")}</p>}
          </div>
        </section>
        <div className="flex items-start gap-3 rounded-[18px] bg-app-peach px-4 py-3">
          <Mascot name="rex" className="h-9 w-9 shrink-0" />
          <p className="m-0 text-[14px] leading-[1.5]">{t("pages.rexDrafts")}</p>
        </div>
      </aside>
    </div>
  );
}
