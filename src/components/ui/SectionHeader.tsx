import type { ReactNode } from "react";

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function SectionHeader({ eyebrow, title, description, action }: SectionHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <div>
        {eyebrow && (
          <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-teal-deep mb-1.5">
            {eyebrow}
          </div>
        )}
        <h2 className="font-display text-xl font-medium tracking-[-0.02em] text-navy m-0">
          {title}
        </h2>
        {description && (
          <p className="text-[13px] text-muted mt-1">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
