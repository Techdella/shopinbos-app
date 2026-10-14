"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { PillButton, Spinner, cx } from "@/components/app-ui";
import { useT } from "@/components/i18n/I18nProvider";

// Small shared pieces for the CMS editors: a modal dialog, an upload helper and a product / item picker.

export function Modal({ title, onClose, children, footer, wide = false }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const t = useT("cms");
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input, textarea, select, button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 font-app sm:items-center sm:p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} className={cx("flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[24px] bg-white text-app-ink shadow-xl sm:rounded-[24px]", wide ? "sm:max-w-[720px]" : "sm:max-w-[480px]")}>
        <div className="flex items-center justify-between gap-3 border-b border-app-line px-5 py-4">
          <h2 id={id} className="m-0 text-[17px] font-extrabold">{title}</h2>
          <button type="button" onClick={onClose} aria-label={t("pk.close")} className="grid h-10 w-10 place-items-center rounded-full hover:bg-app-canvas">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-app-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export interface UploadedFile {
  url: string;
  name: string;
  type: string;
}

export async function uploadCmsFile(file: File): Promise<UploadedFile> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/app/cms/upload", { method: "POST", body: form });
  const json = (await res.json().catch(() => null)) as { data?: UploadedFile; error?: { message?: string } } | null;
  if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "Upload failed");
  return json.data;
}

export interface PickerRow {
  id: string;
  name: string;
  image: string | null;
  price?: string;
  status?: string;
  collection?: string;
}

/** Search the store's products (or items of a collection) and pick one or several. */
export function RecordPicker({
  kind,
  collectionId,
  multiple,
  selected,
  onPick,
  onClose,
  title,
}: {
  kind: "products" | "items";
  collectionId?: string | null;
  multiple: boolean;
  selected: string[];
  onPick: (rows: PickerRow[]) => void;
  onClose: () => void;
  title: string;
}) {
  const t = useT("cms");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PickerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<PickerRow[]>([]);
  const searchId = useId();

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ kind, q });
      if (collectionId) params.set("collectionId", collectionId);
      fetch(`/api/app/cms/lookups?${params}`)
        .then((res) => (res.ok ? res.json() : { data: [] }))
        .then((json: { data?: PickerRow[] }) => active && setRows(json.data ?? []))
        .catch(() => active && setRows([]))
        .finally(() => active && setLoading(false));
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [kind, q, collectionId]);

  const toggle = (row: PickerRow) => {
    if (!multiple) {
      onPick([row]);
      onClose();
      return;
    }
    setPicked((current) => (current.some((entry) => entry.id === row.id) ? current.filter((entry) => entry.id !== row.id) : [...current, row]));
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        multiple ? (
          <>
            <PillButton tone="white" size="sm" onClick={onClose}>{t("pk.cancel")}</PillButton>
            <PillButton tone="ink" size="sm" disabled={!picked.length} onClick={() => { onPick(picked); onClose(); }}>
              {picked.length ? t("pk.add", { count: picked.length }) : t("pk.addNone")}
            </PillButton>
          </>
        ) : undefined
      }
    >
      <label htmlFor={searchId} className="sr-only">{t("pk.search")}</label>
      <div className="mb-3 flex min-h-[44px] items-center gap-2 rounded-full border border-app-line px-4 focus-within:border-app-ink">
        <Icon name="search" size={16} />
        <input id={searchId} value={q} onChange={(e) => setQ(e.target.value)} placeholder={kind === "products" ? t("pk.searchProducts") : t("pk.searchItems")} className="min-w-0 flex-1 border-0 bg-transparent text-[14.5px] outline-none" />
      </div>
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[14px] text-app-ink-soft" role="status"><Spinner /> {t("pk.loading")}</div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-[14px] text-app-ink-soft">{kind === "products" ? t("pk.noProducts") : t("pk.noItems")}</p>
      ) : (
        <ul className="m-0 grid list-none gap-1 p-0">
          {rows.map((row) => {
            const already = selected.includes(row.id);
            const on = picked.some((entry) => entry.id === row.id);
            return (
              <li key={row.id}>
                <button
                  type="button"
                  disabled={already}
                  onClick={() => toggle(row)}
                  aria-pressed={multiple ? on : undefined}
                  className={cx("flex min-h-[56px] w-full items-center gap-3 rounded-[14px] px-2 text-left hover:bg-app-canvas disabled:opacity-50", on && "bg-app-canvas")}
                >
                  {row.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.image} alt="" className="h-11 w-11 shrink-0 rounded-[10px] object-cover" />
                  ) : (
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-app-canvas"><Icon name={kind === "products" ? "box" : "document"} size={16} /></span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold">{row.name}</span>
                    <span className="block truncate text-[12.5px] text-app-ink-soft">{[row.price, row.collection, row.status].filter(Boolean).join(" · ")}{already ? ` · ${t("pk.added")}` : ""}</span>
                  </span>
                  {multiple && <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full border", on ? "border-app-ink bg-app-ink text-white" : "border-app-line")}>{on && <Icon name="check" size={13} />}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
