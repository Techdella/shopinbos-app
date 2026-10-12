"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState, Pill } from "@/components/app-kit";
import { Notice, PillButton, Segmented, Spinner } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/growth/Modal";
import { Field, buttonClass, inputClass, selectClass } from "@/components/growth/kit";
import { OP_LABEL, SEGMENT_FIELDS, SOURCE_LABEL, type SegmentCondition, type SegmentField, type SegmentOp, type SegmentRules } from "@/lib/marketing/segment-rules";
import { api, errorText, useDebounced } from "../_kit/client";

interface Segment {
  id: string;
  name: string;
  description: string | null;
  rules: SegmentRules;
  summary: string;
  count: number;
}

interface Preview {
  total: number;
  email: number;
  phone: number;
  subscribed: number;
  description: string;
  sample: Array<{ name: string | null; email: string | null; phone: string | null; orders: number; spent: number; status: string }>;
}

const FIELDS = Object.keys(SEGMENT_FIELDS) as SegmentField[];

function defaultCondition(field: SegmentField): SegmentCondition {
  const op = SEGMENT_FIELDS[field].ops[0] as SegmentOp;
  const input = SEGMENT_FIELDS[field].input;
  return { field, op, value: input === "money" ? 10000 : input === "number" ? 2 : input === "days" ? 30 : input === "source" ? "popup" : "", label: null };
}

const STARTERS: Array<{ name: string; rules: SegmentRules }> = [
  { name: "Repeat buyers", rules: { match: "all", conditions: [{ field: "orders", op: "gte", value: 2 }] } },
  { name: "Big spenders", rules: { match: "all", conditions: [{ field: "spent", op: "gte", value: 50000 }] } },
  { name: "Gone quiet (90 days)", rules: { match: "all", conditions: [{ field: "last_order", op: "more_than_days", value: 90 }] } },
  { name: "Subscribed, never bought", rules: { match: "all", conditions: [{ field: "subscribed", op: "is_true" }, { field: "orders", op: "eq", value: 0 }] } },
  { name: "New this month", rules: { match: "any", conditions: [{ field: "joined", op: "within_days", value: 30 }, { field: "first_order", op: "within_days", value: 30 }] } },
];

function ValueInput({ condition, onChange, products, tags }: { condition: SegmentCondition; onChange: (patch: Partial<SegmentCondition>) => void; products: Array<{ id: string; name: string }>; tags: string[] }) {
  const input = SEGMENT_FIELDS[condition.field].input;
  if (input === "none" || condition.op === "never") return null;
  if (input === "source") {
    return (
      <select aria-label="Source" className={selectClass} value={String(condition.value ?? "")} onChange={(e) => onChange({ value: e.target.value })}>
        {Object.entries(SOURCE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    );
  }
  if (input === "product") {
    return (
      <select
        aria-label="Product"
        className={selectClass}
        value={String(condition.value ?? "")}
        onChange={(e) => onChange({ value: e.target.value, label: products.find((p) => p.id === e.target.value)?.name ?? null })}
      >
        <option value="">Choose a product</option>
        {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
      </select>
    );
  }
  if (input === "tag") {
    return (
      <>
        <input aria-label="Tag" list="segment-tags" className={inputClass} value={String(condition.value ?? "")} onChange={(e) => onChange({ value: e.target.value.toLowerCase() })} placeholder="e.g. vip" />
        <datalist id="segment-tags">{tags.map((tag) => <option key={tag} value={tag} />)}</datalist>
      </>
    );
  }
  const numeric = input === "money" || input === "number" || input === "days";
  return (
    <div className="flex items-center gap-2">
      {input === "money" ? <span className="text-[14px] font-bold">₦</span> : null}
      <input
        aria-label="Value"
        className={inputClass}
        inputMode={numeric ? "numeric" : "text"}
        type={numeric ? "number" : "text"}
        min={0}
        value={condition.value ?? ""}
        onChange={(e) => onChange({ value: numeric ? Number(e.target.value) : e.target.value })}
        placeholder={input === "text" ? "e.g. Lagos" : ""}
      />
      {input === "days" ? <span className="shrink-0 text-[14px] text-app-ink-soft">days</span> : null}
    </div>
  );
}

function SegmentEditor({ editing, start, products, tags, onClose, onSaved }: { editing: Segment | null; start: { name: string; rules: SegmentRules } | null; products: Array<{ id: string; name: string }>; tags: string[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(editing?.name ?? start?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [rules, setRules] = useState<SegmentRules>(editing?.rules.conditions.length ? editing.rules : start?.rules ?? { match: "all", conditions: [defaultCondition("orders")] });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [counting, setCounting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounced = useDebounced(JSON.stringify(rules), 450);

  useEffect(() => {
    let cancelled = false;
    setCounting(true);
    api<Preview>("/api/app/marketing/segments/preview", "POST", { rules: JSON.parse(debounced) })
      .then((data) => !cancelled && setPreview(data))
      .catch(() => !cancelled && setPreview(null))
      .finally(() => !cancelled && setCounting(false));
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const update = (index: number, patch: Partial<SegmentCondition>) => setRules((current) => ({ ...current, conditions: current.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)) }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = { name, description: description || null, rules };
      if (editing) await api(`/api/app/marketing/segments/${editing.id}`, "PATCH", body);
      else await api("/api/app/marketing/segments", "POST", body);
      onSaved();
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? `Edit ${editing.name}` : "New group of customers"} onClose={onClose} wide>
      <form onSubmit={(event) => void save(event)} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="seg-name">
            <input id="seg-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required maxLength={120} placeholder="e.g. Lagos big spenders" />
          </Field>
          <Field label="Note (optional)" htmlFor="seg-desc">
            <input id="seg-desc" value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} maxLength={500} />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[14px]">
          <span className="font-bold">People who match</span>
          <Segmented options={[{ value: "all", label: "all rules" }, { value: "any", label: "any rule" }]} value={rules.match} onChange={(match) => setRules({ ...rules, match })} />
        </div>

        <ol className="m-0 grid list-none gap-2.5 p-0">
          {rules.conditions.map((condition, index) => (
            <li key={index} className="grid gap-2 rounded-[16px] border border-app-line p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-center">
              <select aria-label="Rule" className={selectClass} value={condition.field} onChange={(e) => update(index, defaultCondition(e.target.value as SegmentField))}>
                {FIELDS.map((field) => <option key={field} value={field}>{SEGMENT_FIELDS[field].label}</option>)}
              </select>
              <select aria-label="Condition" className={selectClass} value={condition.op} onChange={(e) => update(index, { op: e.target.value as SegmentOp })}>
                {(SEGMENT_FIELDS[condition.field].ops as readonly SegmentOp[]).map((op) => <option key={op} value={op}>{OP_LABEL[op]}</option>)}
              </select>
              <div className="min-w-0">
                <ValueInput condition={condition} onChange={(patch) => update(index, patch)} products={products} tags={tags} />
              </div>
              <button type="button" aria-label="Remove rule" onClick={() => setRules({ ...rules, conditions: rules.conditions.filter((_, i) => i !== index) })} className="grid h-11 w-11 place-items-center justify-self-end rounded-full text-app-danger hover:bg-app-danger-tint">
                <Icon name="trash" size={16} />
              </button>
            </li>
          ))}
        </ol>
        <div>
          <button type="button" className={buttonClass("white", "sm")} onClick={() => setRules({ ...rules, conditions: [...rules.conditions, defaultCondition("spent")] })} disabled={rules.conditions.length >= 20}>
            <Icon name="plus" size={14} /> Add a rule
          </button>
        </div>

        <div className="rounded-[18px] bg-app-canvas p-4" aria-live="polite">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[26px] font-extrabold">{preview ? preview.total.toLocaleString("en-NG") : "…"}</span>
            <span className="text-[14px] text-app-ink-soft">{preview?.total === 1 ? "person matches" : "people match"} right now</span>
            {counting ? <Spinner className="text-app-ink-soft" /> : null}
          </div>
          {preview ? (
            <>
              <p className="mb-2 mt-1 text-[13px] text-app-ink-soft">
                {preview.email} reachable by email · {preview.phone} by phone · {preview.subscribed} subscribed
              </p>
              {preview.sample.length ? (
                <ul className="m-0 grid list-none gap-1 p-0 text-[13px]">
                  {preview.sample.map((person, i) => (
                    <li key={i} className="flex min-w-0 justify-between gap-3">
                      <span className="min-w-0 truncate">{person.name || person.email || person.phone}</span>
                      <span className="shrink-0 text-app-ink-soft">{person.orders} orders · ₦{person.spent.toLocaleString("en-NG")}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </div>

        {error ? <Notice>{error}</Notice> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <PillButton size="md" tone="white" onClick={onClose}>Cancel</PillButton>
          <PillButton size="md" type="submit" busy={saving} disabled={!rules.conditions.length}>{editing ? "Save segment" : "Create segment"}</PillButton>
        </div>
      </form>
    </Modal>
  );
}

export function SegmentsManager({ segments, products, tags }: { segments: Segment[]; products: Array<{ id: string; name: string }>; tags: string[] }) {
  const router = useRouter();
  const [editor, setEditor] = useState<{ editing: Segment | null; start: { name: string; rules: SegmentRules } | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(segment: Segment) {
    if (!window.confirm(`Delete "${segment.name}"? Messages already sent to it keep their history.`)) return;
    setError(null);
    try {
      await api(`/api/app/marketing/segments/${segment.id}`, "DELETE");
      router.refresh();
    } catch (deleteError) {
      setError(errorText(deleteError));
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[13.5px] font-bold text-app-ink-soft">Quick start:</span>
        {STARTERS.map((starter) => (
          <button key={starter.name} type="button" className={buttonClass("white", "sm")} onClick={() => setEditor({ editing: null, start: starter })}>{starter.name}</button>
        ))}
        <PillButton size="md" tone="accent" className="sm:ml-auto" onClick={() => setEditor({ editing: null, start: null })}>
          <Icon name="plus" size={16} /> New group of customers
        </PillButton>
      </div>
      {error ? <Notice>{error}</Notice> : null}

      {segments.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {segments.map((segment) => (
            <Card key={segment.id} as="article" className="flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="m-0 min-w-0 break-words text-[17px] font-extrabold">{segment.name}</h2>
                <Pill tone="info">{segment.count.toLocaleString("en-NG")} people</Pill>
              </div>
              <p className="m-0 text-[14px] leading-[1.5] text-app-ink-soft">{segment.rules.conditions.length ? segment.summary : "No rules yet. Edit it to add some."}</p>
              {segment.description ? <p className="m-0 text-[13px] text-app-ink-soft">{segment.description}</p> : null}
              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                <a href={`/home/marketing/campaigns/new?segment=${segment.id}`} className={buttonClass("ink", "sm")}>Message them</a>
                <button type="button" onClick={() => setEditor({ editing: segment, start: null })} className={buttonClass("white", "sm")}>Edit</button>
                <button type="button" onClick={() => void remove(segment)} className={buttonClass("danger", "sm")}>Delete</button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon="layers" title="No groups of customers yet" action={<PillButton size="md" onClick={() => setEditor({ editing: null, start: STARTERS[0] })}>Start with repeat buyers</PillButton>}>
          A group of customers is saved, like “spent over ₦50,000” or “bought the Ankara dress”. Use it for messages to customers, automations and discounts.
        </EmptyState>
      )}

      {editor ? (
        <SegmentEditor
          editing={editor.editing}
          start={editor.start}
          products={products}
          tags={tags}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
