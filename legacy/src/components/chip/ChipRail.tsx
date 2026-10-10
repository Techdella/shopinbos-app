"use client";

import { useState } from "react";
import { Chip } from "./Chip";
import { ChipAvatar } from "@/components/brand/ChipAvatar";
import { DotGrid } from "@/components/ui/DotGrid";
import { Icon } from "@/components/ui/Icon";
import { MascotFigure } from "@/components/brand/MascotFigure";
import type { AuthRole } from "@/lib/brand";

export interface ChipTask {
  text: string;
  status: "auto" | "review" | "idle";
  time: string;
}

interface ChipRailProps {
  tone?: string;
  tasks?: ChipTask[];
  role?: AuthRole;
  message?: string;
}

const defaultTasks: ChipTask[] = [
  { text: "Preparing your first store checklist", status: "auto", time: "now" },
  { text: "Watching marketplace trends", status: "review", time: "soon" },
  { text: "Waiting for your next prompt", status: "idle", time: "ready" },
];

const statusColor = {
  auto: "var(--color-mint)",
  review: "var(--color-amber)",
  idle: "rgb(115 216 200 / 0.3)",
};

const statusTextColor = {
  auto: "var(--color-mint-soft)",
  review: "var(--color-amber)",
  idle: "var(--color-mint-soft)",
};

export function ChipRail({
  tone = "assistant",
  tasks = defaultTasks,
  role = "seller",
  message = "I am here if you need me.",
}: ChipRailProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);

  return (
    <aside
      className="group relative shrink-0 overflow-hidden transition-all duration-300"
      style={{
        width: collapsed ? 92 : 340,
        background: "var(--color-navy)",
        borderLeft: "1px solid rgb(115 216 200 / 0.08)",
        color: "var(--color-cream)",
      }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <DotGrid />

      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-[rgb(115_216_200_/_0.18)] bg-[rgb(115_216_200_/_0.08)]"
        aria-label={collapsed ? "Expand Rex panel" : "Collapse Rex panel"}
      >
        <Icon name="chevron" size={14} color="var(--color-mint)" className={collapsed ? "rotate-180" : ""} />
      </button>

      {collapsed && hovering && (
        <div
          className="absolute left-[-190px] top-8 z-30 rounded-full px-4 py-2 text-[12px] font-medium animate-slide-up"
          style={{
            background: "white",
            color: "var(--color-navy)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          {message}
        </div>
      )}

      <div className="relative flex h-full flex-col gap-4 p-4">
        <div className="flex items-center gap-3">
          <ChipAvatar mascot="rex" size={44} className="rounded-[13px]" />

          {!collapsed && (
            <div className="flex-1 animate-fade-in">
              <div className="font-display text-[17px] font-semibold tracking-[-0.01em]">Rex</div>
              <div className="flex items-center gap-1.5 font-mono text-[11px] tracking-[0.08em]" style={{ color: "var(--color-mint-soft)" }}>
                <span className="h-1.5 w-1.5 rounded-full bg-mint animate-pulse-dot" />
                ON · {tone.toUpperCase()}
              </div>
            </div>
          )}
        </div>

        <div
          className="relative overflow-hidden rounded-[20px] border border-[rgb(115_216_200_/_0.18)] bg-[rgb(115_216_200_/_0.06)]"
          style={{ minHeight: collapsed ? 120 : 180 }}
        >
          <MascotFigure role={role} variant={role === "logistics_partner" ? 0 : 1} className={collapsed ? "mx-auto max-w-[86px] pt-4" : "mx-auto max-w-[180px] pt-4"} />
        </div>

        {!collapsed && (
          <>
            <div
              className="rounded-xl border p-3.5 animate-fade-in"
              style={{ background: "rgb(115 216 200 / 0.06)", borderColor: "rgb(115 216 200 / 0.18)" }}
            >
              <div className="mb-1.5 font-mono text-[11px] tracking-[0.08em]" style={{ color: "var(--color-mint-soft)" }}>
                NOW
              </div>
              <p className="m-0 text-[14px] leading-[1.5] text-[var(--color-cream)]">{message}</p>
              <div className="mt-3 flex gap-2">
                <button className="flex-1 rounded-[10px] py-2 text-[12px] font-semibold transition-colors" style={{ background: "var(--color-mint)", color: "var(--color-navy)" }}>
                  Open setup
                </button>
                <button className="flex-1 rounded-[10px] border py-2 text-[12px] transition-colors" style={{ borderColor: "rgb(115 216 200 / 0.25)", color: "var(--color-cream)" }}>
                  Later
                </button>
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto animate-fade-in">
              <div className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: "rgb(181 235 226 / 0.55)" }}>
                Working on
              </div>
              {tasks.map((task, index) => (
                <div
                  key={`${task.text}-${index}`}
                  className="pl-3 text-[13px] transition-transform duration-150 hover:translate-x-1"
                  style={{ borderLeft: `2px solid ${statusColor[task.status]}`, color: "var(--color-cream)" }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="leading-[1.35]">{task.text}</span>
                    <span className="shrink-0 font-mono text-[10px] opacity-70" style={{ color: "var(--color-mint-soft)" }}>
                      {task.time}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: statusTextColor[task.status], opacity: 0.8 }}>
                    {task.status}
                  </div>
                </div>
              ))}
            </div>

            <div
              className="flex items-center gap-2 rounded-xl border px-3 py-2.5"
              style={{ background: "rgb(244 241 234 / 0.05)", borderColor: "rgb(115 216 200 / 0.14)" }}
            >
              <Icon name="sparkle" size={14} color="var(--color-mint)" />
              <input
                placeholder="Ask Rex anything"
                className="flex-1 border-none bg-transparent text-[13px] outline-none"
                style={{ color: "var(--color-cream)", fontFamily: "inherit" }}
              />
              <kbd className="font-mono text-[10px] opacity-70" style={{ color: "var(--color-mint-soft)" }}>
                Ctrl+K
              </kbd>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
