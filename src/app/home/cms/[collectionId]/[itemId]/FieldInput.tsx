"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Spinner, Toggle, cx } from "@/components/app-ui";
import { RichTextEditor } from "@/components/cms/RichTextEditor";
import { RecordPicker, uploadCmsFile, type PickerRow } from "@/components/cms/pickers";
import { MediaLibraryDialog } from "@/components/media/MediaLibraryDialog";
import type { CalloutValue, CmsField, FileValue, FormValue, LinkValue, MediaValue, PriceValue, StatValue, TableValue } from "@/lib/cms/fields";
import type { RichDoc } from "@/lib/cms/richtext";
import { useT } from "@/components/i18n/I18nProvider";

// One input per CMS field type, used by the item editor.

const input = "min-h-[44px] w-full rounded-[14px] border border-app-line bg-white px-3.5 text-[14.5px] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink";
const small = "inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-app-line bg-white px-3.5 text-[13px] font-bold hover:border-app-line-strong disabled:opacity-60";

function useUpload(accept: string, onDone: (files: Array<{ url: string; name: string; type: string }>) => void, multiple = false) {
  const t = useT("cms");
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const element = (
    <input
      ref={ref}
      type="file"
      accept={accept}
      multiple={multiple}
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={async (event) => {
        const files = Array.from(event.target.files ?? []);
        if (!files.length) return;
        setBusy(true);
        setError("");
        try {
          const uploaded = [];
          for (const file of files.slice(0, 20)) uploaded.push(await uploadCmsFile(file));
          onDone(uploaded);
        } catch (e) {
          setError(e instanceof Error ? e.message : t("ed.uploadError"));
        } finally {
          setBusy(false);
          if (ref.current) ref.current.value = "";
        }
      }}
    />
  );
  return { element, open: () => ref.current?.click(), busy, error };
}

export function FieldInput({ field, value, onChange, error, collections }: { field: CmsField; value: unknown; onChange: (value: unknown) => void; error?: string; collections?: Array<{ id: string; name: string }> }) {
  const t = useT("cms");
  const id = useId();
  const labelId = `${id}-label`;
  return (
    <div className="grid gap-1.5" role="group" aria-labelledby={labelId}>
      <div id={labelId} className="text-[14px] font-extrabold">
        {field.label}
        {field.required && <span className="ml-1 text-[12.5px] font-bold text-app-ink-soft">{t("fi.needed")}</span>}
        {field.help && <span className="block text-[12.5px] font-normal text-app-ink-soft">{field.help}</span>}
      </div>
      <Control field={field} value={value} onChange={onChange} id={id} collections={collections} />
      {error && <p className="m-0 text-[13px] font-medium text-app-danger" role="alert">{error}</p>}
    </div>
  );
}

function Control({ field, value, onChange, id, collections }: { field: CmsField; value: unknown; onChange: (value: unknown) => void; id: string; collections?: Array<{ id: string; name: string }> }) {
  const t = useT("cms");
  switch (field.type) {
    case "richText":
      return <RichTextEditor label={field.label} value={((value as { json?: RichDoc } | undefined)?.json) ?? null} onChange={(json) => onChange({ json, html: "" })} />;
    case "text":
      return <textarea aria-label={field.label} rows={2} className={cx(input, "resize-y py-2.5 leading-6")} value={(value as string) ?? ""} maxLength={5000} onChange={(e) => onChange(e.target.value)} />;
    case "number":
      return <input aria-label={field.label} type="number" inputMode="decimal" className={cx(input, "sm:max-w-[220px]")} value={typeof value === "number" ? value : ""} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} />;
    case "price": {
      const price = value as PriceValue | undefined;
      return (
        <div className="flex items-center gap-2 sm:max-w-[260px]">
          <span className="text-[15px] font-bold" aria-hidden>₦</span>
          <input aria-label={t("fi.inNaira", { label: field.label })} type="number" min={0} inputMode="decimal" className={input} value={price?.amount ?? ""} onChange={(e) => onChange(e.target.value === "" ? undefined : { amount: Number(e.target.value), currency: "NGN" })} />
        </div>
      );
    }
    case "date":
      return <input aria-label={field.label} type="date" className={cx(input, "sm:max-w-[220px]")} value={typeof value === "string" ? value.slice(0, 10) : ""} onChange={(e) => onChange(e.target.value || undefined)} />;
    case "boolean":
      return <div><Toggle on={value === true} onChange={onChange} label={field.label} /></div>;
    case "choice": {
      const options = field.options ?? [];
      if (field.multiple) {
        const picked = Array.isArray(value) ? (value as string[]) : [];
        return (
          <div className="flex flex-wrap gap-2">
            {options.map((option) => {
              const on = picked.includes(option);
              return (
                <label key={option} className={cx("inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-bold", on ? "border-app-ink bg-app-canvas" : "border-app-line bg-white")}>
                  <input type="checkbox" checked={on} onChange={() => onChange(on ? picked.filter((entry) => entry !== option) : [...picked, option])} />
                  {option}
                </label>
              );
            })}
          </div>
        );
      }
      return (
        <select aria-label={field.label} className={cx(input, "sm:max-w-[320px]")} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">{t("fi.notSet")}</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      );
    }
    case "tags":
      return <TagsInput label={field.label} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} />;
    case "link": {
      const link = (value as LinkValue | undefined) ?? { url: "", label: "" };
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <input aria-label={t("fi.webAddress", { label: field.label })} className={input} placeholder="https://…" value={link.url} onChange={(e) => onChange(e.target.value || link.label ? { ...link, url: e.target.value } : undefined)} />
          <input aria-label={t("fi.buttonWords", { label: field.label })} className={input} placeholder={t("fi.buttonWordsPh")} value={link.label} maxLength={80} onChange={(e) => onChange({ ...link, label: e.target.value })} />
        </div>
      );
    }
    case "stats":
      return <StatsInput label={field.label} value={Array.isArray(value) ? (value as StatValue[]) : []} onChange={onChange} />;
    case "callout": {
      const callout = (value as CalloutValue | undefined) ?? { tone: "info", title: "", body: "" };
      return (
        <div className="grid gap-2 rounded-[16px] bg-app-canvas p-3">
          <div className="flex flex-wrap gap-2">
            <select aria-label={t("fi.style", { label: field.label })} className={cx(input, "w-auto")} value={callout.tone} onChange={(e) => onChange({ ...callout, tone: e.target.value })}>
              <option value="info">{t("fi.note")}</option>
              <option value="tip">{t("fi.tip")}</option>
              <option value="success">{t("fi.good")}</option>
              <option value="warning">{t("fi.warning")}</option>
            </select>
            <input aria-label={t("fi.heading", { label: field.label })} className={cx(input, "min-w-0 flex-1 basis-[200px]")} placeholder={t("fi.headingPh")} value={callout.title} maxLength={120} onChange={(e) => onChange({ ...callout, title: e.target.value })} />
          </div>
          <textarea aria-label={t("fi.text", { label: field.label })} rows={3} className={cx(input, "py-2.5")} value={callout.body} maxLength={3000} onChange={(e) => onChange({ ...callout, body: e.target.value })} />
        </div>
      );
    }
    case "table":
      return <TableInput label={field.label} value={value as TableValue | undefined} onChange={onChange} />;
    case "image":
      return <ImageInput label={field.label} value={value as MediaValue | undefined} onChange={onChange} />;
    case "gallery":
      return <GalleryInput label={field.label} value={Array.isArray(value) ? (value as MediaValue[]) : []} onChange={onChange} />;
    case "video":
      return <VideoInput label={field.label} value={value} onChange={onChange} id={id} />;
    case "file":
      return <FileInput label={field.label} value={value as FileValue | undefined} onChange={onChange} />;
    case "products":
    case "items":
      return <RefInput kind={field.type} label={field.label} collectionId={field.collectionId ?? null} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} collections={collections} />;
    case "form":
      return <FormPicker label={field.label} value={(value as FormValue | undefined) ?? { formId: null, heading: "" }} onChange={onChange} />;
  }
}

function TagsInput({ label, value, onChange }: { label: string; value: string[]; onChange: (value: unknown) => void }) {
  const t = useT("cms");
  const [draft, setDraft] = useState("");
  const add = () => {
    const tags = draft.split(",").map((tag) => tag.trim()).filter(Boolean);
    if (tags.length) onChange([...new Set([...value, ...tags])].slice(0, 30));
    setDraft("");
  };
  return (
    <div className="flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-[14px] border border-app-line bg-white px-2 py-1.5 focus-within:border-app-ink">
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-app-canvas py-1 pl-2.5 pr-1 text-[13px] font-bold">
          {tag}
          <button type="button" aria-label={t("fi.removeTag", { tag })} onClick={() => onChange(value.filter((entry) => entry !== tag))} className="grid h-6 w-6 place-items-center rounded-full hover:bg-white"><Icon name="x" size={12} /></button>
        </span>
      ))}
      <input
        aria-label={t("fi.addTag", { label })}
        className="min-h-[32px] min-w-[120px] flex-1 border-0 bg-transparent px-1.5 text-[14.5px] outline-none"
        placeholder={value.length ? "" : t("fi.typeEnter")}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={add}
      />
    </div>
  );
}

function StatsInput({ label, value, onChange }: { label: string; value: StatValue[]; onChange: (value: unknown) => void }) {
  const t = useT("cms");
  const rows = value.length ? value : [];
  const set = (index: number, patch: Partial<StatValue>) => onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <div className="grid gap-2">
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap gap-2">
          <input aria-label={t("fi.statName", { label, n: index + 1 })} className={cx(input, "min-w-0 flex-1 basis-[140px]")} placeholder={t("fi.statNamePh")} value={row.label} maxLength={60} onChange={(e) => set(index, { label: e.target.value })} />
          <input aria-label={t("fi.statValue", { label, n: index + 1 })} className={cx(input, "min-w-0 flex-1 basis-[120px]")} placeholder={t("fi.statValuePh")} value={row.value} maxLength={60} onChange={(e) => set(index, { value: e.target.value })} />
          <button type="button" aria-label={t("fi.removeTag", { tag: row.label || t("fi.row") })} onClick={() => onChange(rows.filter((_, i) => i !== index))} className="grid h-11 w-11 place-items-center rounded-full text-app-danger hover:bg-app-danger-tint"><Icon name="trash" size={15} /></button>
        </div>
      ))}
      <div><button type="button" className={small} onClick={() => onChange([...rows, { label: "", value: "" }])}><Icon name="plus" size={14} /> {t("fi.addStat")}</button></div>
    </div>
  );
}

function TableInput({ label, value, onChange }: { label: string; value: TableValue | undefined; onChange: (value: unknown) => void }) {
  const t = useT("cms");
  const table = value ?? { header: true, rows: [["", ""], ["", ""]] };
  const width = Math.max(1, ...table.rows.map((row) => row.length));
  const setCell = (r: number, c: number, text: string) => onChange({ ...table, rows: table.rows.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? text : cell)) : row)) });
  return (
    <div className="grid gap-2">
      <div className="overflow-x-auto rounded-[14px] border border-app-line">
        <table className="w-full border-collapse text-[14px]">
          <tbody>
            {table.rows.map((row, r) => (
              <tr key={r} className={cx(r === 0 && table.header && "bg-app-canvas")}>
                {Array.from({ length: width }, (_, c) => (
                  <td key={c} className="min-w-[110px] border-b border-r border-app-line p-0 last:border-r-0">
                    <input aria-label={t("fi.cell", { label, r: r + 1, c: c + 1 })} className={cx("min-h-[42px] w-full bg-transparent px-2.5 outline-none focus:bg-white", r === 0 && table.header && "font-bold")} value={row[c] ?? ""} maxLength={300} onChange={(e) => setCell(r, c, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={small} onClick={() => onChange({ ...table, rows: [...table.rows, Array(width).fill("")] })}><Icon name="plus" size={14} /> {t("fi.rowBtn")}</button>
        <button type="button" className={small} onClick={() => onChange({ ...table, rows: table.rows.map((row) => [...row, ...Array(width - row.length).fill(""), ""]) })}><Icon name="plus" size={14} /> {t("fi.columnBtn")}</button>
        <button type="button" className={small} disabled={table.rows.length <= 1} onClick={() => onChange({ ...table, rows: table.rows.slice(0, -1) })}><Icon name="minus" size={14} /> {t("fi.rowBtn")}</button>
        <button type="button" className={small} disabled={width <= 1} onClick={() => onChange({ ...table, rows: table.rows.map((row) => row.slice(0, width - 1)) })}><Icon name="minus" size={14} /> {t("fi.columnBtn")}</button>
        <label className="inline-flex min-h-[38px] items-center gap-2 px-2 text-[13.5px]"><input type="checkbox" checked={table.header} onChange={(e) => onChange({ ...table, header: e.target.checked })} /> {t("fi.header")}</label>
      </div>
    </div>
  );
}

function ImageInput({ label, value, onChange }: { label: string; value: MediaValue | undefined; onChange: (value: unknown) => void }) {
  const t = useT("cms");
  const tm = useT("media");
  const [libraryOpen, setLibraryOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-start gap-3">
      <button type="button" onClick={() => setLibraryOpen(true)} aria-label={value?.url ? t("ed.replace") : tm("field.choose")} className="grid h-[110px] w-[150px] place-items-center overflow-hidden rounded-[14px] border border-dashed border-app-line-strong bg-app-canvas text-[13px] font-bold text-app-ink-soft">
        {value?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value.url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="grid place-items-center gap-1"><Icon name="image" size={18} /> {t("fi.addMedia")}</span>
        )}
      </button>
      <div className="grid min-w-0 flex-1 basis-[220px] gap-2">
        <input aria-label={t("fi.describe", { label })} className={input} placeholder={t("fi.describePh")} value={value?.alt ?? ""} maxLength={300} disabled={!value?.url} onChange={(e) => onChange({ ...value, alt: e.target.value })} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={small} onClick={() => setLibraryOpen(true)}><Icon name={value?.url ? "refresh" : "grid"} size={14} /> {value?.url ? t("ed.replace") : tm("field.choose")}</button>
          {value?.url && <button type="button" className={small} onClick={() => onChange(undefined)}><Icon name="trash" size={14} /> {t("ed.remove")}</button>}
        </div>
      </div>
      <MediaLibraryDialog open={libraryOpen} onClose={() => setLibraryOpen(false)} onSelect={([asset]) => asset && onChange({ url: asset.url, alt: asset.alt || value?.alt || "" })} />
    </div>
  );
}

function GalleryInput({ label, value, onChange }: { label: string; value: MediaValue[]; onChange: (value: unknown) => void }) {
  const t = useT("cms");
  const tm = useT("media");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const move = (index: number, by: number) => {
    const next = [...value];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return (
    <div className="grid gap-3">
      {value.length > 0 && (
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 xl:grid-cols-4">
          {value.map((photo, index) => (
            <li key={`${photo.url}-${index}`} className="grid gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" className="aspect-square w-full rounded-[14px] border border-app-line object-cover" />
              <input aria-label={t("fi.picDesc", { label, n: index + 1 })} className={cx(input, "min-h-[38px] text-[13px]")} placeholder={t("fi.description")} value={photo.alt} maxLength={300} onChange={(e) => onChange(value.map((entry, i) => (i === index ? { ...entry, alt: e.target.value } : entry)))} />
              <div className="flex gap-1">
                <button type="button" aria-label={t("fi.earlier")} disabled={index === 0} onClick={() => move(index, -1)} className="grid h-9 w-9 place-items-center rounded-[10px] border border-app-line disabled:opacity-40"><Icon name="arrowLeft" size={14} /></button>
                <button type="button" aria-label={t("fi.later")} disabled={index === value.length - 1} onClick={() => move(index, 1)} className="grid h-9 w-9 place-items-center rounded-[10px] border border-app-line disabled:opacity-40"><Icon name="arrow" size={14} /></button>
                <button type="button" aria-label={t("fi.removePic", { n: index + 1 })} onClick={() => onChange(value.filter((_, i) => i !== index))} className="ml-auto grid h-9 w-9 place-items-center rounded-full text-app-danger hover:bg-app-danger-tint"><Icon name="trash" size={14} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div>
        <button type="button" className={small} onClick={() => setLibraryOpen(true)}><Icon name="plus" size={14} /> {t("fi.addPictures")}</button>
      </div>
      <MediaLibraryDialog open={libraryOpen} multiple onClose={() => setLibraryOpen(false)} onSelect={(assets) => onChange([...value, ...assets.filter((asset) => !value.some((photo) => photo.url === asset.url)).map((asset) => ({ url: asset.url, alt: asset.alt ?? "" }))].slice(0, 60))} />
    </div>
  );
}

function VideoInput({ label, value, onChange, id }: { label: string; value: unknown; onChange: (value: unknown) => void; id: string }) {
  const t = useT("cms");
  const url = typeof value === "string" ? value : ((value as { url?: string } | undefined)?.url ?? "");
  const tm = useT("media");
  const [libraryOpen, setLibraryOpen] = useState(false);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <label htmlFor={`${id}-video`} className="sr-only">{t("fi.link", { label })}</label>
        <input id={`${id}-video`} className={cx(input, "min-w-0 flex-1 basis-[240px]")} placeholder={t("fi.videoPh")} value={url} onChange={(e) => onChange(e.target.value ? { url: e.target.value } : undefined)} />
        <button type="button" className={cx(small, "min-h-[44px]")} onClick={() => setLibraryOpen(true)}><Icon name="play" size={14} /> {tm("field.choose")}</button>
        {url && <button type="button" aria-label={t("fi.removeVideo")} className="grid h-11 w-11 place-items-center rounded-full text-app-danger hover:bg-app-danger-tint" onClick={() => onChange(undefined)}><Icon name="trash" size={15} /></button>}
      </div>
      <p className="m-0 text-[12.5px] text-app-ink-soft">{t("fi.videoHelp")}</p>
      <MediaLibraryDialog open={libraryOpen} accept="any" initialKind="video" title={t("fi.chooseVideo")} onClose={() => setLibraryOpen(false)} onSelect={([asset]) => asset?.kind === "video" && onChange({ url: asset.url })} />
    </div>
  );
}

function FileInput({ label, value, onChange }: { label: string; value: FileValue | undefined; onChange: (value: unknown) => void }) {
  const t = useT("cms");
  const upload = useUpload("application/pdf,image/jpeg,image/png,image/webp", ([file]) => onChange({ url: file.url, name: file.name }));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {upload.element}
      {value?.url ? (
        <>
          <span className="inline-flex min-h-[44px] min-w-0 items-center gap-2 rounded-[14px] bg-app-canvas px-3.5 text-[14px] font-bold"><Icon name="file" size={15} /><span className="truncate">{value.name}</span></span>
          <input aria-label={t("fi.fileName", { label })} className={cx(input, "min-w-0 flex-1 basis-[200px]")} value={value.name} maxLength={120} onChange={(e) => onChange({ ...value, name: e.target.value })} />
          <button type="button" aria-label={t("fi.removeFile")} className="grid h-11 w-11 place-items-center rounded-full text-app-danger hover:bg-app-danger-tint" onClick={() => onChange(undefined)}><Icon name="trash" size={15} /></button>
        </>
      ) : (
        <button type="button" className={cx(small, "min-h-[44px]")} onClick={upload.open} disabled={upload.busy}>{upload.busy ? <Spinner className="h-4 w-4" /> : <Icon name="upload" size={14} />} {t("fi.uploadFile")}</button>
      )}
      {upload.error && <p className="m-0 w-full text-[13px] text-app-danger" role="alert">{upload.error}</p>}
    </div>
  );
}

function RefInput({ kind, label, collectionId, value, onChange, collections }: { kind: "products" | "items"; label: string; collectionId: string | null; value: string[]; onChange: (value: unknown) => void; collections?: Array<{ id: string; name: string }> }) {
  const t = useT("cms");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, PickerRow>>({});
  const missing = value.filter((idValue) => !rows[idValue]).join(",");
  useEffect(() => {
    if (!missing) return;
    let active = true;
    fetch(`/api/app/cms/lookups?${new URLSearchParams({ kind, ids: missing })}`)
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((json: { data?: PickerRow[] }) => active && setRows((current) => ({ ...current, ...Object.fromEntries((json.data ?? []).map((row) => [row.id, row])) })))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [kind, missing]);
  const sourceName = collectionId ? collections?.find((collection) => collection.id === collectionId)?.name : null;
  return (
    <div className="grid gap-2">
      {value.length > 0 && (
        <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {value.map((rowId) => {
            const row = rows[rowId];
            return (
              <li key={rowId} className="flex min-w-0 items-center gap-2.5 rounded-[14px] border border-app-line p-2">
                {row?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.image} alt="" className="h-10 w-10 shrink-0 rounded-[10px] object-cover" />
                ) : (
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-app-canvas"><Icon name={kind === "products" ? "box" : "document"} size={15} /></span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-bold">{row?.name ?? t("fi.loading")}</span>
                  {row?.price && <span className="block text-[12px] text-app-ink-soft">{row.price}</span>}
                </span>
                <button type="button" aria-label={t("fi.removeTag", { tag: row?.name ?? t("fi.item") })} onClick={() => onChange(value.filter((entry) => entry !== rowId))} className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-app-canvas"><Icon name="x" size={14} /></button>
              </li>
            );
          })}
        </ul>
      )}
      <div>
        <button type="button" className={small} onClick={() => setOpen(true)}><Icon name="plus" size={14} /> {kind === "products" ? t("fi.addProducts") : sourceName ? t("fi.addItemsFrom", { name: sourceName }) : t("fi.addItems")}</button>
      </div>
      {open && (
        <RecordPicker
          kind={kind}
          collectionId={collectionId}
          multiple
          selected={value}
          title={label}
          onClose={() => setOpen(false)}
          onPick={(picked) => {
            setRows((current) => ({ ...current, ...Object.fromEntries(picked.map((row) => [row.id, row])) }));
            onChange([...value, ...picked.map((row) => row.id)].slice(0, 50));
          }}
        />
      )}
    </div>
  );
}

function FormPicker({ label, value, onChange }: { label: string; value: FormValue; onChange: (value: unknown) => void }) {
  const t = useT("cms");
  const [forms, setForms] = useState<Array<{ id: string; name: string; active: boolean }> | null>(null);
  useEffect(() => {
    fetch("/api/app/cms/lookups?kind=forms")
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((json: { data?: Array<{ id: string; name: string; active: boolean }> }) => setForms(json.data ?? []))
      .catch(() => setForms([]));
  }, []);
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <select aria-label={t("fi.whichForm", { label })} className={input} value={value.formId ?? ""} onChange={(e) => onChange({ ...value, formId: e.target.value || null })}>
        <option value="">{t("fi.simpleForm")}</option>
        {(forms ?? []).map((form) => <option key={form.id} value={form.id}>{form.name}{form.active ? "" : ` ${t("fi.off")}`}</option>)}
      </select>
      <input aria-label={t("fi.heading", { label })} className={input} placeholder={t("fi.formHeadingPh")} value={value.heading} maxLength={120} onChange={(e) => onChange({ ...value, heading: e.target.value })} />
      <p className="m-0 text-[12.5px] text-app-ink-soft sm:col-span-2">{t("fi.formHelp")}</p>
    </div>
  );
}
