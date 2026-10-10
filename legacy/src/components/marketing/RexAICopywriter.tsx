"use client";

import { useCallback, useState } from "react";
import { Icon } from "@/components/ui";
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
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const config = MARKETING_PROMPTS[copyType];

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
        setError(data.error?.message ?? "Generation failed");
      }
    } catch {
      setError("Could not connect to Rex AI");
    } finally {
      setLoading(false);
    }
  }, [copyType, fieldValues, storeName, onResult]);

  const copyToClipboard = useCallback(async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }, []);

  function renderResult() {
    if (!result) return null;
    const r = result as Record<string, unknown>;
    const entries = Object.entries(r).filter(([k]) => k !== "id");

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        {entries.map(([key, val]) => {
          if (Array.isArray(val)) {
            return (
              <div key={key}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--teal-700)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{key}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {val.map((item: unknown, i: number) => {
                    const text = typeof item === "string" ? item : (item as Record<string, unknown>)?.body ?? (item as Record<string, unknown>)?.headline ?? JSON.stringify(item, null, 2);
                    return (
                      <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                        <div style={{ flex: 1, fontSize: 12.5, lineHeight: 1.5, padding: "8px 10px", background: "var(--ink-50)", borderRadius: 8, color: "var(--ink-800)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                          {text}
                        </div>
                        <button onClick={() => void copyToClipboard(String(text), i)}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: copiedIndex === i ? "var(--teal-600)" : "var(--ink-400)", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", fontFamily: "inherit" }}>
                          {copiedIndex === i ? "Copied!" : "Copy"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }
          if (typeof val === "string") {
            return (
              <div key={key} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <div style={{ flex: 1, fontSize: 12.5, lineHeight: 1.5, padding: "8px 10px", background: "var(--ink-50)", borderRadius: 8, color: "var(--ink-800)", whiteSpace: "pre-wrap" }}>{val}</div>
              </div>
            );
          }
          return null;
        })}
      </div>
    );
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="dbtn dBtn-mint" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>
        <Icon name="sparkle" size={14} /> Write with Rex
      </button>

      {open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100, display: "grid", placeItems: "center" }}
          onClick={() => setOpen(false)}>
          <div className="card" style={{ padding: 0, maxWidth: 640, width: "95%", maxHeight: "85vh", display: "flex", flexDirection: "column" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--ink-100)", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--teal-100)", color: "var(--teal-700)", display: "grid", placeItems: "center", fontSize: 16 }}>R</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink-900)" }}>Rex AI Copywriter</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>Generate marketing copy for your store</div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-400)", padding: 4 }}><Icon name="x" size={18} /></button>
            </div>

            <div style={{ padding: "14px 20px 0", overflow: "auto", flex: 1 }}>
              <div className="field" style={{ marginBottom: 14 }}>
                <label className="label">Copy type</label>
                <select value={copyType} onChange={(e) => handleTypeChange(e.target.value as MarketingCopyType)} className="sel">
                  {Object.entries(MARKETING_PROMPTS).map(([key, p]) => (
                    <option key={key} value={key}>{p.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {config.fields.map((f) => (
                  <div className="field" key={f.key}>
                    <label className="label">{f.label}</label>
                    {f.type === "select" ? (
                      <select value={fieldValues[f.key] ?? ""} onChange={(e) => setFieldValues({ ...fieldValues, [f.key]: e.target.value })} className="sel">
                        <option value="">Select...</option>
                        {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : f.type === "textarea" ? (
                      <textarea value={fieldValues[f.key] ?? ""} onChange={(e) => setFieldValues({ ...fieldValues, [f.key]: e.target.value })} className="ta" rows={3} placeholder={f.placeholder} />
                    ) : (
                      <input value={fieldValues[f.key] ?? ""} onChange={(e) => setFieldValues({ ...fieldValues, [f.key]: e.target.value })} className="inp" placeholder={f.placeholder} />
                    )}
                  </div>
                ))}
              </div>

              <button onClick={() => void generate()} disabled={loading}
                className="dbtn dBtn-mint" style={{ marginTop: 14, border: "none", cursor: "pointer", fontFamily: "inherit", width: "100%" }}>
                {loading ? "Generating..." : `Generate ${config.label}`}
              </button>

              {error && <div style={{ marginTop: 10, padding: "8px 12px", background: "var(--rose-50)", color: "var(--danger)", borderRadius: 8, fontSize: 12.5 }}>{error}</div>}

              <div style={{ margin: "10px 0 18px" }}>
                {renderResult()}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
