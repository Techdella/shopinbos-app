"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Notice, PillButton, cx } from "@/components/app-ui";
import { FIELD_TYPES, FIELD_TYPE_INFO, fieldKey, newFieldId, validateFields, type CmsField, type FieldType } from "@/lib/cms/fields";
import { useT } from "@/components/i18n/I18nProvider";

// The collection's fields: add, rename, reorder, remove, required on/off, options for choices. Items keep
// values of a removed field in the database until they are saved again, so an accidental remove followed by
// adding the field back with the same key brings the values back.

const input = "min-h-[42px] w-full rounded-[12px] border border-app-line bg-white px-3 text-[14px] outline-none focus:border-app-ink";

export function FieldsEditor({ collectionId, initial, collections }: { collectionId: string; initial: CmsField[]; collections: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const t = useT("cms");
  const [fields, setFields] = useState<CmsField[]>(initial);
  const [adding, setAdding] = useState<FieldType>("text");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const dirty = JSON.stringify(fields) !== JSON.stringify(initial);

  const update = (index: number, patch: Partial<CmsField>) => setFields((current) => current.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  const move = (index: number, by: number) =>
    setFields((current) => {
      const next = [...current];
      const target = index + by;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  function add() {
    const base = FIELD_TYPE_INFO[adding].label;
    let label = base;
    for (let n = 2; fields.some((field) => field.label.toLowerCase() === label.toLowerCase()); n++) label = `${base} ${n}`;
    const field: CmsField = { id: newFieldId(), key: fieldKey(label), label, type: adding };
    if (adding === "choice") field.options = ["Option 1", "Option 2"];
    setFields((current) => [...current, field]);
  }

  async function save() {
    const checked = validateFields(fields);
    if (!checked.ok) {
      setNotice({ tone: "error", text: checked.error });
      return;
    }
    setBusy(true);
    setNotice(null);
    const res = await fetch(`/api/app/cms/collections/${collectionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: checked.fields }) });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setNotice({ tone: "error", text: json?.error?.message ?? t("fe.saveError") });
      return;
    }
    setNotice({ tone: "success", text: t("fe.saved") });
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <section className="overflow-hidden rounded-[22px] border border-app-line bg-white">
        <div className="flex items-center gap-3 border-b border-app-line px-4 py-3 sm:px-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-app-canvas"><Icon name="lock" size={15} /></span>
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[14px] font-bold">{t("fe.builtIn")}</p>
            <p className="m-0 text-[12.5px] text-app-ink-soft">{t("fe.builtInHelp")}</p>
          </div>
        </div>
        {fields.length === 0 && <p className="m-0 px-5 py-6 text-[14px] text-app-ink-soft">{t("fe.none")}</p>}
        <ol className="m-0 list-none divide-y divide-app-line p-0">
          {fields.map((field, index) => (
            <li key={field.id} className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[auto_minmax(0,1fr)_200px_auto] lg:items-start">
              <div className="flex gap-1 lg:flex-col">
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={t("fe.moveUp", { label: field.label })} className="grid h-9 w-9 place-items-center rounded-[10px] border border-app-line disabled:opacity-40"><Icon name="arrowUp" size={14} /></button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === fields.length - 1} aria-label={t("fe.moveDown", { label: field.label })} className="grid h-9 w-9 place-items-center rounded-[10px] border border-app-line disabled:opacity-40"><Icon name="arrowDown" size={14} /></button>
              </div>
              <div className="grid min-w-0 gap-2">
                <label className="sr-only" htmlFor={`label-${field.id}`}>{t("fe.name")}</label>
                <input id={`label-${field.id}`} className={cx(input, "font-bold")} value={field.label} maxLength={60} onChange={(e) => update(index, { label: e.target.value })} />
                <label className="sr-only" htmlFor={`help-${field.id}`}>{t("fe.help")}</label>
                <input id={`help-${field.id}`} className={input} value={field.help ?? ""} maxLength={200} placeholder={t("fe.helpPh")} onChange={(e) => update(index, { help: e.target.value || undefined })} />
                {field.type === "choice" && (
                  <div>
                    <label className="mb-1 block text-[12.5px] font-bold" htmlFor={`opts-${field.id}`}>{t("fe.options")}</label>
                    <textarea id={`opts-${field.id}`} rows={3} className={cx(input, "py-2")} value={(field.options ?? []).join("\n")} onChange={(e) => update(index, { options: e.target.value.split("\n").map((option) => option.trimStart()).slice(0, 50) })} />
                    <label className="mt-1.5 flex items-center gap-2 text-[13.5px]"><input type="checkbox" checked={Boolean(field.multiple)} onChange={(e) => update(index, { multiple: e.target.checked || undefined })} /> {t("fe.several")}</label>
                  </div>
                )}
                {field.type === "items" && (
                  <div>
                    <label className="mb-1 block text-[12.5px] font-bold" htmlFor={`col-${field.id}`}>{t("fe.fromCollection")}</label>
                    <select id={`col-${field.id}`} className={input} value={field.collectionId ?? ""} onChange={(e) => update(index, { collectionId: e.target.value || null })}>
                      <option value="">{t("fe.anyCollection")}</option>
                      {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
                    </select>
                  </div>
                )}
                <p className="m-0 text-[12px] text-app-ink-soft">{t("fe.key")} <code>{field.key}</code></p>
              </div>
              <div className="grid gap-2">
                <span className="inline-flex min-h-[42px] items-center rounded-[12px] bg-app-canvas px-3 text-[13.5px] font-bold">{t(`ftype.${field.type}`)}</span>
                <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" checked={Boolean(field.required)} onChange={(e) => update(index, { required: e.target.checked || undefined })} /> {t("fe.required")}</label>
              </div>
              <button type="button" onClick={() => setFields((current) => current.filter((_, i) => i !== index))} aria-label={t("fe.remove", { label: field.label })} className="grid h-10 w-10 place-items-center justify-self-start rounded-full text-app-danger hover:bg-app-danger-tint lg:justify-self-end">
                <Icon name="trash" size={16} />
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-wrap items-end gap-3 rounded-[22px] border border-app-line bg-white p-4 sm:p-5">
        <div className="min-w-0 flex-1 basis-[240px]">
          <label htmlFor="cms-add-type" className="mb-1.5 block text-[13.5px] font-bold">{t("fe.add")}</label>
          <select id="cms-add-type" className={input} value={adding} onChange={(e) => setAdding(e.target.value as FieldType)}>
            {FIELD_TYPES.map((type) => <option key={type} value={type}>{t(`ftype.${type}`)} · {t(`fhint.${type}`)}</option>)}
          </select>
        </div>
        <PillButton tone="white" size="md" onClick={add}><Icon name="plus" size={16} /> {t("fe.addBtn")}</PillButton>
      </section>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-end gap-2 rounded-full bg-white/90 p-2 backdrop-blur">
        {dirty && <span className="mr-auto pl-3 text-[13.5px] text-app-ink-soft">{t("fe.unsaved")}</span>}
        <PillButton tone="white" size="md" disabled={!dirty || busy} onClick={() => { setFields(initial); setNotice(null); }}>{t("fe.undo")}</PillButton>
        <PillButton tone="ink" size="md" busy={busy} disabled={!dirty} onClick={() => void save()}>{t("fe.save")}</PillButton>
      </div>
    </div>
  );
}
