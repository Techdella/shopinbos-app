"use client";

import { useState } from "react";
import { Segmented } from "@/components/app-ui";
import { useT } from "@/components/i18n/I18nProvider";
import { CompareChart } from "../TrendChart";

// Visits or page views over time against the period before (the same accessible chart as Sales over time).
export interface TrafficPoint {
  label: string;
  sessions: number | null;
  pageViews: number | null;
  previousSessions: number;
  previousPageViews: number;
}

const count = (value: number) => Math.round(value).toLocaleString("en-NG");

export function TrafficChart({ points, rangeLabel }: { points: TrafficPoint[]; rangeLabel: string }) {
  const t = useT("traffic");
  const [metric, setMetric] = useState<"sessions" | "pageViews">("sessions");
  const visits = metric === "sessions";
  return (
    <CompareChart
      points={points.map((point) => ({ label: point.label, current: visits ? point.sessions : point.pageViews, previous: visits ? point.previousSessions : point.previousPageViews }))}
      metricLabel={visits ? t("chart.visits") : t("chart.pageViews")}
      rangeLabel={rangeLabel}
      format={count}
      tickFormat={count}
      controls={<Segmented options={[{ value: "sessions", label: t("chart.visits") }, { value: "pageViews", label: t("chart.pageViews") }]} value={metric} onChange={setMetric} />}
    />
  );
}
