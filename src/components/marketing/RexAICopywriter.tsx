"use client";

import { useCallback, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Notice, PillButton } from "@/components/app-ui";
import { Modal } from "@/components/growth/Modal";
import { Field, buttonClass, inputClass, selectClass, textareaClass } from "@/components/growth/kit";
import { MARKETING_PROMPTS, type MarketingCopyType } from "@/lib/ai/marketing-prompts";

interface RexAICopywriterProps {
  storeName?: string;
  onResult?: (type: MarketingCopyType, data: unknown) => void;
}

export function RexAICopywriter({ storeName, onResult }: RexAICopywriterProps) {
  const [open, setOpen] = useState(false);
  const [copyType, setCopyType] = useState<MarketingCopyType>("email_subject");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const config = MARKETING_PROMPTS[copyType];
  const close = useCallback(() => setOpen(false), []);

  const handleTypeChange = useCallback((type: MarketingCopyType) => {
    setCopyType(type);
    setFieldValues({});
    setResult(null);
    setError(null);
  }, []);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ai/marketing-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: copyType, fields: fieldValues, storeName }),
      });
      const data = await res.json();
      if (data.data) {
        setResult(data.data);
        onResult?.(copyType, data.data);
      } else {
        setError(data.error?.message ?? "Rex couldn't write that. Try again.");
      }
    } catch {
      setError("Couldn't reach Rex. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [copyType, fieldValues, storeName, onResult]);

  const copyText = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setError("Couldn't copy. Select the text and copy it.");
    }
  }, []);

  function copyRow(text: string, id: string) {
    return (
      <div key={id} className="flex items-start gap-2">
        <div className="min-w-0 flex-1 whitespace-pre-wrap break-words rounded-[14px] bg-app-canvas px-3.5 py-2.5 text-[14px] leading-[1.5]">{text}</div>
        <button type="button" onClick={() => void copyText(text, id)} className={buttonClass("white", "sm")}>
          {copied === id ? "Copied" : "Copy"}
        </button>
      </div>
    );
  }

  function renderResult() {
    if (!result) return null;
    const entries = Object.entries(result as Record<string, unknown>).filter(([key]) => key !== "id");
    return (
      <div className="mt-4 grid gap-3">
        {entries.map(([key, value]) => {
          if (Array.isArray(value)) {
            return (
              <div key={key} className="grid gap-2">
                <div className="text-[13px] font-bold text-app-ink-soft">{key.replace(/_/g, " ")}</div>
                {value.map((item: unknown, index: number) => {
                  const record = item as Record<string, unknown>;
                  const text = typeof item === "string" ? item : String(record?.body ?? record?.headline ?? JSON.stringify(item, null, 2));
                  return copyRow(text, `${key}-${index}`);
                })}
              </div>
            );
          }
          if (typeof value === "string") return copyRow(value, key);
          return null;
        })}
      </div>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("white")}>
        <Icon name="sparkle" size={16} /> Write with Rex
      </button>

      {open && (
        <Modal title="Write with Rex" onClose={close} wide>
          <p className="m-0 mb-4 text-[14px] text-app-ink-soft">Rex writes subject lines, messages and captions for {storeName || "your shop"}. Pick what you need.</p>
          <div className="grid gap-3">
            <Field label="What should Rex write?" htmlFor="rex-type">
              <select id="rex-type" value={copyType} onChange={(event) => handleTypeChange(event.target.value as MarketingCopyType)} className={selectClass}>
                {Object.entries(MARKETING_PROMPTS).map(([key, prompt]) => (
                  <option key={key} value={key}>{prompt.label}</option>
                ))}
              </select>
            </Field>
            {config.fields.map((field) => {
              const id = `rex-${field.key}`;
              const value = fieldValues[field.key] ?? "";
              const set = (next: string) => setFieldValues({ ...fieldValues, [field.key]: next });
              return (
                <Field key={field.key} label={field.label} htmlFor={id}>
                  {field.type === "select" ? (
                    <select id={id} value={value} onChange={(event) => set(event.target.value)} className={selectClass}>
                      <option value="">Choose</option>
                      {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  ) : field.type === "textarea" ? (
                    <textarea id={id} value={value} onChange={(event) => set(event.target.value)} className={textareaClass} rows={3} placeholder={field.placeholder} />
                  ) : (
                    <input id={id} value={value} onChange={(event) => set(event.target.value)} className={inputClass} placeholder={field.placeholder} />
                  )}
                </Field>
              );
            })}
            <PillButton size="md" busy={loading} onClick={() => void generate()} className="w-full">
              Write {config.label.toLowerCase()}
            </PillButton>
            {error && <Notice>{error}</Notice>}
          </div>
          {renderResult()}
        </Modal>
      )}
    </>
  );
}
