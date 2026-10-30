"use client";

import { useId, useState } from "react";
import { readSizeChart, recommendSize, str } from "./block-logic";
import { words, type BlockContext } from "./shared";

function measure(value: string) {
  const number = Number(value.replace(",", "."));
  return value.trim() && Number.isFinite(number) && number > 0 ? number : null;
}

/** Size finder: the shopper types one or two measurements and gets a size from the seller's own chart. */
export function SizeFinder({ ctx }: { ctx: BlockContext }) {
  const { copy, items, look, headingId } = ctx;
  const t = look.tokens;
  const id = useId();
  const chart = readSizeChart(items);
  const [values, setValues] = useState(["", ""]);
  const [result, setResult] = useState<ReturnType<typeof recommendSize> | "none" | null>(null);
  const [showChart, setShowChart] = useState(false);
  if (!chart.length) return ctx.editorHint("Add your sizes and measurements in the panel on the right.");
  const unit = str(copy.unit) || "cm";
  const labels = [str(copy.label1) || "Bust", str(copy.label2)].filter(Boolean);
  const find = () => {
    const found = recommendSize(chart, labels.map((_, index) => measure(values[index] ?? "")));
    setResult(found ?? "none");
  };
  const range = (min: number | null, max: number | null) => (min === null && max === null ? "–" : `${min ?? "…"}–${max ?? "…"}`);
  return (
    <section aria-labelledby={headingId} className="bq-wrap py-12">
      <div className="mx-auto max-w-[620px] rounded-[16px] p-6 @3xl:p-8" style={{ background: look.raised, borderRadius: Math.max(look.cardRadius, 10) }}>
        <h2 id={headingId} className="bq-h text-[26px]" style={look.headingStyle}>{words(ctx, "title", "Find your size")}</h2>
        {str(copy.body) ? <p className="m-0 mt-2 text-[15px] leading-6" style={{ color: t.muted }}>{words(ctx, "body")}</p> : null}
        <form className="mt-5 grid gap-3 @xl:grid-cols-[1fr_1fr_auto] @xl:items-end" onSubmit={(event) => { event.preventDefault(); find(); }}>
          {labels.map((label, index) => (
            <label key={index} htmlFor={`${id}-${index}`} className="grid gap-1 text-[13.5px] font-semibold" style={{ color: t.ink }}>
              {label} ({unit})
              <input
                id={`${id}-${index}`}
                inputMode="decimal"
                value={values[index]}
                onChange={(event) => { const next = [...values]; next[index] = event.target.value; setValues(next); setResult(null); }}
                className="h-11 rounded-[var(--bq-button-radius)] border bg-white px-3 text-[15px] font-normal"
                style={{ borderColor: t.border, color: "#111" }}
                placeholder={unit === "cm" ? "e.g. 88" : ""}
              />
            </label>
          ))}
          <button type="submit" className="bq-btn" style={look.solidButton}>{words(ctx, "buttonLabel", "Find my size")}</button>
        </form>
        <div role="status" aria-live="polite" className="mt-4 min-h-6">
          {result === "none" ? <p className="m-0 text-[14.5px]" style={{ color: t.muted }}>Type your measurement{labels.length > 1 ? "s" : ""} in {unit} to see your size.</p> : null}
          {result && result !== "none" ? (
            <div>
              <p className="m-0 text-[15px]">
                {result.exact ? "Your size: " : "Closest size: "}
                <strong className="text-[20px]" style={{ fontFamily: look.headingFont }}>{result.size}</strong>
              </p>
              {!result.exact ? <p className="m-0 mt-1 text-[13px]" style={{ color: t.muted }}>Your measurements fall between sizes, so check the chart below.</p> : null}
              {str(copy.footnote) ? <p className="m-0 mt-1 text-[13px]" style={{ color: t.muted }}>{words(ctx, "footnote")}</p> : null}
            </div>
          ) : null}
        </div>
        <button type="button" className="mt-3 border-0 bg-transparent p-0 text-[13.5px] font-semibold underline underline-offset-4" style={{ color: t.ink, cursor: "pointer" }} aria-expanded={showChart} onClick={() => setShowChart(!showChart)}>
          {showChart ? "Hide size chart" : "See the size chart"}
        </button>
        {showChart ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-left text-[13.5px]" style={{ color: t.ink }}>
              <thead>
                <tr>
                  <th scope="col" className="py-2 pr-3">Size</th>
                  {labels.map((label) => <th key={label} scope="col" className="py-2 pr-3">{label} ({unit})</th>)}
                </tr>
              </thead>
              <tbody>
                {chart.map((row) => (
                  <tr key={row.size} style={{ borderTop: `1px solid ${t.border}` }}>
                    <th scope="row" className="py-2 pr-3 font-semibold">{row.size}</th>
                    {labels.map((label, index) => <td key={label} className="py-2 pr-3">{range(row.ranges[index]?.min ?? null, row.ranges[index]?.max ?? null)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
