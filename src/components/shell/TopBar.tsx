import type { ReactNode } from "react";

interface TopBarProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

// Page header inside the app shell, in the 2026 look (big bold title, soft subtitle, actions that wrap).
export function TopBar({ eyebrow, title, subtitle, actions }: TopBarProps) {
  return (
    <header className="flex shrink-0 flex-wrap items-end justify-between gap-3 px-4 pb-2 pt-6 font-app text-app-ink sm:px-6 xl:px-8">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[13px] font-semibold text-app-ink-soft">{eyebrow.charAt(0) + eyebrow.slice(1).toLowerCase()}</div>}
        <h1 className="m-0 break-words text-[28px] font-extrabold leading-[1.1] tracking-[-0.8px] sm:text-[30px]">{title}</h1>
        {subtitle && <p className="m-0 mt-1.5 max-w-[720px] text-[14.5px] leading-[1.5] text-app-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
