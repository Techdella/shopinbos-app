"use client";

import { useState } from "react";
import { Segmented } from "@/components/app-ui";
import { useT } from "@/components/i18n/I18nProvider";
import { CompareChart } from "../TrendChart";

// Visits, unique visitors or page views over time against the period before (the same accessible chart as Sales
// over time). A point's unique visitors count each browser once in that day (or week).
export interface TrafficPoint {
  label: string;
  sessions: number | null;
  pageViews: number | null;
  visitors: number | null;
  previousSessions: number;
  previousPageViews: number;
  previousVisitors: number;
}

type Metric = "sessions" | "visitors" | "pageViews";
const PREVIOUS = { sessions: "previousSessions", visitors: "previousVisitors", pageViews: "previousPageViews" } as const;

const count = (value: number) => Math.round(value).toLocaleString("en-NG");

export function TrafficChart({ points, rangeLabel }: { points: TrafficPoint[]; rangeLabel: string }) {
  const t = useT("traffic");
  const [metric, setMetric] = useState<Metric>("sessions");
  const label: Record<Metric, string> = { sessions: t("chart.visits"), visitors: t("chart.visitors"), pageViews: t("chart.pageViews") };
  return (
    <CompareChart
      points={points.map((point) => ({ label: point.label, current: point[metric], previous: point[PREVIOUS[metric]] }))}
      metricLabel={label[metric]}
      rangeLabel={rangeLabel}
      format={count}
      tickFormat={count}
      controls={<Segmented options={(["sessions", "visitors", "pageViews"] as const).map((value) => ({ value, label: label[value] }))} value={metric} onChange={setMetric} />}
    />
  );
}
