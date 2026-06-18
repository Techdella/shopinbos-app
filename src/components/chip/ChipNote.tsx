import type { ReactNode } from "react";
import { Chip } from "./Chip";
import { ChipAvatar } from "@/components/brand/ChipAvatar";
import { DotGrid } from "@/components/ui/DotGrid";

interface ChipNoteProps {
  children: ReactNode;
  action?: ReactNode;
  muted?: boolean;
  status?: string;
}

export function ChipNote({ children, action, muted, status = "suggest" }: ChipNoteProps) {
  return (
    <div
      className="relative flex items-start gap-3 rounded-xl px-4 py-3.5 overflow-hidden"
      style={{
        background: muted ? "var(--color-cream)" : "var(--color-navy)",
        color:      muted ? "var(--color-navy)" : "var(--color-cream)",
        border:     muted ? "1px solid rgb(14 42 56 / 0.08)" : "1px solid rgb(115 216 200 / 0.18)",
      }}
    >
      {!muted && <DotGrid />}

      <div
        className="relative w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0"
        style={{ background: muted ? "var(--color-mint-pale)" : "var(--color-mint)" }}
      >
        <ChipAvatar mascot="rex" size={26} />
      </div>

      <div className="relative flex-1">
        <div
          className="font-mono text-[10px] tracking-[0.12em] uppercase mb-1"
          style={{ color: muted ? "var(--color-teal-deep)" : "var(--color-mint)" }}
        >
          Rex · {status}
        </div>
        <p className="text-[13px] leading-[1.5] m-0">{children}</p>
        {action && <div className="flex gap-2 mt-2.5">{action}</div>}
      </div>
    </div>
  );
}
