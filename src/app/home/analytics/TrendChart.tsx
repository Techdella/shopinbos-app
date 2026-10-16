"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Segmented } from "@/components/app-ui";
import { cx } from "@/components/app-ui/cx";
import { useT } from "@/components/i18n/I18nProvider";

// One number over time, this period against the one before, on one axis (CompareChart): sales or orders here,
// visits or page views on /home/analytics/traffic. Hover or arrow keys move a crosshair that reads out both
// values; "Show as table" lists every point for screen readers and print.

export interface TrendPoint {
  label: string;
  sales: number | null;
  orders: number | null;
  previousSales: number;
  previousOrders: number;
}

const CURRENT = "#16141F"; // app ink
const PREVIOUS = "#9C98A8"; // app ink-faint
const GRID = "#ECEAF2";
const HEIGHT = 240;
const PAD = { top: 12, right: 12, bottom: 28, left: 56 };

function compactNaira(value: number) {
  if (value >= 1_000_000) return `₦${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `₦${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return `₦${Math.round(value)}`;
}

const naira = (value: number) => `₦${Math.round(value).toLocaleString("en-NG")}`;

/** 0 and up to four round steps above the max. */
function ticks(max: number) {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let value = 0; value <= max + step * 0.001; value += step) out.push(value);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

export function TrendChart({ points, rangeLabel }: { points: TrendPoint[]; rangeLabel: string }) {
  const t = useT("analytics");
  const [metric, setMetric] = useState<"sales" | "orders">("sales");
  return (
    <CompareChart
      points={points.map((point) => ({ label: point.label, current: metric === "sales" ? point.sales : point.orders, previous: metric === "sales" ? point.previousSales : point.previousOrders }))}
      metricLabel={metric === "sales" ? t("kpi.sales") : t("kpi.orders")}
      rangeLabel={rangeLabel}
      format={metric === "sales" ? naira : (value: number) => t("customers.orders", { count: value })}
      tickFormat={metric === "sales" ? compactNaira : (value: number) => value.toLocaleString("en-NG")}
      controls={<Segmented options={[{ value: "sales", label: t("kpi.sales") }, { value: "orders", label: t("chart.orders") }]} value={metric} onChange={setMetric} />}
    />
  );
}

export interface ComparePoint {
  label: string;
  /** null for buckets that haven't happened yet. */
  current: number | null;
  previous: number;
}

export function CompareChart({
  points,
  metricLabel,
  rangeLabel,
  format,
  tickFormat,
  controls,
}: {
  points: ComparePoint[];
  metricLabel: string;
  rangeLabel: string;
  format: (value: number) => string;
  tickFormat: (value: number) => string;
  controls?: ReactNode;
}) {
  const t = useT("analytics");
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [width, setWidth] = useState(640);
  const box = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const current = points.map((point) => point.current);
  const previous = points.map((point) => point.previous);
  const yTicks = useMemo(() => ticks(Math.max(0, ...current.map((v) => v ?? 0), ...previous)), [current, previous]);
  const yMax = yTicks[yTicks.length - 1] || 1;
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (index: number) => PAD.left + (points.length <= 1 ? plotW / 2 : (index / (points.length - 1)) * plotW);
  const y = (value: number) => PAD.top + plotH - (value / yMax) * plotH;

  const path = (values: Array<number | null>) => {
    let d = "";
    let pen = false;
    values.forEach((value, index) => {
      if (value == null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const lastCurrent = current.reduce<number>((last, value, index) => (value != null ? index : last), -1);
  const area = lastCurrent >= 0 ? `${path(current.slice(0, lastCurrent + 1))}L${x(lastCurrent).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : "";

  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(plotW / 90))));
  const total = current.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const previousTotal = previous.reduce((sum, value) => sum + value, 0);
  const summary = t("chart.summary", { metric: metricLabel, range: rangeLabel, total: format(total), previous: format(previousTotal) });

  function pick(clientX: number) {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || !points.length) return;
    const ratio = (clientX - rect.left - PAD.left) / Math.max(1, plotW);
    setActive(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
  }

  function onKey(event: React.KeyboardEvent) {
    if (!points.length) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const step = event.key === "ArrowRight" ? 1 : -1;
      setActive((index) => Math.max(0, Math.min(points.length - 1, (index ?? (step > 0 ? -1 : points.length)) + step)));
    } else if (event.key === "Escape") {
      setActive(null);
    }
  }

  const tip = active != null ? points[active] : null;
  const tipLeft = active != null ? Math.min(Math.max(x(active) - 90, 0), width - 180) : 0;

  return (
    <figure className="m-0" aria-labelledby={titleId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-[13px] text-app-ink-soft" aria-hidden="true">
          <span className="inline-flex items-center gap-2"><span className="h-[3px] w-5 rounded-full" style={{ background: CURRENT }} />{t("chart.thisPeriod")}</span>
          <span className="inline-flex items-center gap-2"><span className="h-0 w-5 border-t-2 border-dashed" style={{ borderColor: PREVIOUS }} />{t("chart.before")}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {controls}
          <button
            type="button"
            onClick={() => setShowTable((value) => !value)}
            aria-expanded={showTable}
            className="inline-flex min-h-[40px] items-center rounded-full border border-app-line bg-white px-4 text-[13px] font-bold hover:border-app-line-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-ink"
          >
            {showTable ? t("chart.hideTable") : t("chart.showTable")}
          </button>
        </div>
      </div>
      <figcaption id={titleId} className="sr-only">{summary}</figcaption>

      <div
        ref={box}
        className="relative mt-4 select-none outline-none focus-visible:rounded-[12px] focus-visible:ring-2 focus-visible:ring-app-ink"
        tabIndex={0}
        role="img"
        aria-label={`${summary} ${t("chart.keys")}`}
        onPointerMove={(event) => pick(event.clientX)}
        onPointerLeave={() => setActive(null)}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
      >
        <svg width={width} height={HEIGHT} className="block max-w-full" aria-hidden="true">
          {yTicks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke={GRID} strokeWidth={1} />
              <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" fontSize={11.5} fill="#6B6779" style={{ fontVariantNumeric: "tabular-nums" }}>{tickFormat(tick)}</text>
            </g>
          ))}
          {points.map((point, index) =>
            index % labelEvery === 0 || index === points.length - 1 ? (
              <text key={index} x={x(index)} y={HEIGHT - 8} textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"} fontSize={11.5} fill="#6B6779">
                {index !== points.length - 1 && points.length - 1 - index < labelEvery / 2 ? "" : point.label}
              </text>
            ) : null,
          )}
          {area && <path d={area} fill={CURRENT} opacity={0.06} />}
          <path d={path(previous)} fill="none" stroke={PREVIOUS} strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />
          <path d={path(current)} fill="none" stroke={CURRENT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {points.length === 1 && current[0] != null && <circle cx={x(0)} cy={y(current[0])} r={4} fill={CURRENT} stroke="#fff" strokeWidth={2} />}
          {active != null && (
            <g>
              <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plotH} stroke="#C9C6D3" strokeWidth={1} />
              <circle cx={x(active)} cy={y(previous[active])} r={4} fill={PREVIOUS} stroke="#fff" strokeWidth={2} />
              {current[active] != null && <circle cx={x(active)} cy={y(current[active]!)} r={4.5} fill={CURRENT} stroke="#fff" strokeWidth={2} />}
            </g>
          )}
        </svg>
        {tip && (
          <div className="pointer-events-none absolute top-1 z-10 w-[180px] rounded-[12px] border border-app-line bg-white px-3 py-2 text-[12.5px] shadow-[0_8px_24px_rgba(22,20,31,0.10)]" style={{ left: tipLeft }} aria-hidden="true">
            <div className="text-app-ink-soft">{tip.label}</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="h-[3px] w-3 shrink-0 rounded-full" style={{ background: CURRENT }} />
              <strong className="text-[14px]">{current[active!] == null ? t("chart.notYet") : format(current[active!]!)}</strong>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-app-ink-soft">
              <span className="w-3 shrink-0 border-t-2 border-dashed" style={{ borderColor: PREVIOUS }} />
              <span>{t("chart.valueBefore", { value: format(previous[active!]) })}</span>
            </div>
          </div>
        )}
      </div>
      <div className="sr-only" aria-live="polite">{tip ? t("chart.live", { label: tip.label, current: current[active!] == null ? t("chart.notYetLower") : format(current[active!]!), previous: format(previous[active!]) }) : ""}</div>

      {showTable && (
        <div className="mt-4 max-h-[360px] overflow-auto rounded-[14px] border border-app-line">
          <table className="w-full border-collapse text-[13.5px]">
            <caption className="sr-only">{summary}</caption>
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-app-ink-soft">
                <th scope="col" className="px-3 py-2 font-semibold">{t("chart.when")}</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">{t("chart.thisPeriod")}</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">{t("chart.before")}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point, index) => (
                <tr key={index} className={cx("border-t border-app-line", index % 2 ? "bg-app-canvas/50" : "")}>
                  <th scope="row" className="px-3 py-2 text-left font-semibold">{point.label}</th>
                  <td className="px-3 py-2 text-right tabular-nums">{current[index] == null ? t("chart.notYet") : format(current[index]!)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-app-ink-soft">{format(previous[index])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}
