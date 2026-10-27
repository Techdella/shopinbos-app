import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { AppFrame } from "@/components/shell/AppFrame";
import { cx } from "@/components/app-ui/cx";
import { Icon, type IconName } from "@/components/ui/Icon";
import { HelpButton } from "@/components/simple/HelpButton";
import { Mascot, type MascotMood } from "@/components/brand/Mascot";
import { LearnPill } from "@/components/learn/FeatureIntroHost";
import { TitleTerm } from "@/components/learn/Term";

// The 2026 app look ("Seller app · web", "Products, web", "Partners · web dispatch console" prototypes)
// as server-safe building blocks. Pages are full-bleed: they use the whole width at every size.
// Interactive pieces (inputs, toggles, segmented controls) live in "@/components/app-ui".

export type Tone = "accent" | "success" | "warning" | "muted" | "danger" | "info" | "ink";

const TONE_PILL: Record<Tone, string> = {
  accent: "bg-app-peach text-app-accent-ink",
  success: "bg-app-success-tint text-app-success",
  warning: "bg-[#FDF0D5] text-[#8A5A00]",
  muted: "bg-app-canvas text-app-ink-soft",
  danger: "bg-app-danger-tint text-app-danger",
  info: "bg-[#E8EAFB] text-[#3D4FB8]",
  ink: "bg-app-ink text-white",
};

const TONE_DOT: Record<Tone, string> = {
  accent: "bg-app-accent",
  success: "bg-app-success",
  warning: "bg-[#F2A93B]",
  muted: "bg-app-ink-faint",
  danger: "bg-app-danger",
  info: "bg-[#3D4FB8]",
  ink: "bg-app-ink",
};

/** Page inside the app shell: title, optional subtitle and actions, then content. */
export function AppPage({
  frame,
  title,
  sub,
  actions,
  toolbar,
  children,
  className,
}: {
  frame: Omit<ComponentProps<typeof AppFrame>, "children">;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  /** Row under the title: filter chips on the left, search/select on the right. */
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AppFrame {...frame}>
      <div className={cx("w-full px-4 py-6 font-app text-app-ink sm:px-6 xl:px-8 2xl:px-10", className)}>
        <PageHead
          title={typeof title === "string" ? <TitleTerm title={title} /> : title}
          sub={sub}
          learn={!frame.role || frame.role === "admin" ? undefined : <LearnPill role={frame.role} variant="inline" className="mt-3.5" />}
          actions={frame.role && frame.role !== "admin" ? <>{actions}<HelpButton /></> : actions}
        />
        {toolbar && <div className="mb-4 flex flex-wrap items-center justify-between gap-3">{toolbar}</div>}
        {children}
      </div>
    </AppFrame>
  );
}

export function PageHead({ title, sub, actions, learn }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; learn?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="m-0 break-words text-[28px] font-extrabold leading-[1.1] tracking-[-0.8px] sm:text-[30px]">{title}</h1>
        {sub && <p className="mb-0 mt-1.5 max-w-[720px] text-[14.5px] leading-[1.5] text-app-ink-soft">{sub}</p>}
        {learn}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ className, children, as: Tag = "section" }: { className?: string; children: ReactNode; as?: "section" | "div" | "article" | "aside" }) {
  return <Tag className={cx("rounded-[22px] border border-app-line bg-white", className)}>{children}</Tag>;
}

/** Card title row: heading on the left, a link or action on the right. */
export function CardHead({ title, sub, action, className }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-wrap items-baseline justify-between gap-2", className)}>
      <div className="min-w-0">
        <h2 className="m-0 text-[17px] font-extrabold">{title}</h2>
        {sub && <div className="mt-0.5 text-[13px] text-app-ink-soft">{sub}</div>}
      </div>
      {action}
    </div>
  );
}

/** Orange text link used for "All orders", "See all". */
export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="text-[14px] font-extrabold text-app-accent-ink no-underline hover:underline">{children}</Link>;
}

const PILL_LINK = {
  ink: "bg-app-ink text-white hover:bg-black",
  accent: "bg-app-accent text-white hover:brightness-95",
  white: "border border-app-line bg-white text-app-ink hover:border-app-line-strong",
} as const;

/** A link that looks like a pill button (top-right page actions, card actions). */
export function PillLink({ href, tone = "white", size = "md", icon, children, className }: { href: string; tone?: keyof typeof PILL_LINK; size?: "sm" | "md"; icon?: IconName; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-extrabold no-underline transition",
        size === "sm" ? "min-h-[34px] px-3.5 text-[13px]" : "min-h-[44px] px-5 text-[14px]",
        PILL_LINK[tone],
        className,
      )}
    >
      {icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />}
      {children}
    </Link>
  );
}

/** Status pill: "Live", "3 left", "Paid". */
export function Pill({ tone = "muted", children, dot = false }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold", TONE_PILL[tone])}>
      {dot && <span className={cx("h-1.5 w-1.5 rounded-full", TONE_DOT[tone])} />}
      {children}
    </span>
  );
}

/** Dot + label for stages ("Needs a rider"). */
export function StageDot({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-[13.5px] font-semibold">
      <span className={cx("h-2 w-2 shrink-0 rounded-full", TONE_DOT[tone])} />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Link-based filter chips: "All · 6", "Live", "Drafts". The active one is ink. One row that scrolls sideways on phones. */
export function FilterChips({ items, className }: { items: Array<{ label: string; href: string; count?: number; active?: boolean }>; className?: string }) {
  return (
    <nav aria-label="Filter" className={cx("flex max-w-full gap-2 overflow-x-auto [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden", className)}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cx(
            "inline-flex min-h-[40px] shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-[14px] font-bold no-underline",
            item.active ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
          )}
        >
          {item.label}
          {item.count !== undefined && <span className={cx("ml-1", item.active ? "text-white" : "text-app-ink-soft")}>· {item.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** GET search box (works without JavaScript). Keeps other query params via hidden inputs. */
export function SearchForm({ action, name = "q", defaultValue, placeholder, keep }: { action: string; name?: string; defaultValue?: string; placeholder: string; keep?: Record<string, string | undefined> }) {
  return (
    <form action={action} method="get" role="search" className="flex min-h-[44px] w-full items-center gap-2 rounded-full border border-app-line bg-white px-4 sm:w-[300px]">
      <Icon name="search" size={16} className="shrink-0 text-app-ink-soft" />
      {keep && Object.entries(keep).map(([key, value]) => (value ? <input key={key} type="hidden" name={key} value={value} /> : null))}
      <input name={name} defaultValue={defaultValue} placeholder={placeholder} aria-label={placeholder} className="min-w-0 flex-1 border-0 bg-transparent text-[14.5px] outline-none placeholder:text-app-ink-faint" />
    </form>
  );
}

/** Number tile: "Delivered today 38". */
export function StatTile({ label, value, hint, tone, className }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "plain" | "card"; className?: string }) {
  return (
    <div className={cx("min-w-0 rounded-[18px] px-4 py-3.5", tone === "card" ? "border border-app-line bg-white" : "", className)}>
      <div className="text-[13px] text-app-ink-soft">{label}</div>
      <div className="mt-1 truncate text-[26px] font-extrabold leading-none tracking-[-0.5px]">{value}</div>
      {hint && <div className="mt-1.5 text-[12.5px] text-app-ink-soft">{hint}</div>}
    </div>
  );
}

/** Responsive grid of stat tiles. */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("grid grid-cols-2 gap-3 md:grid-cols-4", className)}>{children}</div>;
}

/** Square thumbnail with a letter fallback. */
export function Thumb({ src, label, size = 48 }: { src?: string | null; label: string; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-[12px] border border-app-line object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-[12px] border border-app-line bg-app-canvas text-[14px] font-extrabold" style={{ width: size, height: size }}>
      {label.trim().charAt(0).toUpperCase() || "·"}
    </span>
  );
}

/**
 * List card in the "Products, web" style: rows inside one white card, divided by hairlines.
 * Each row is a grid; on phones the extra columns stack under the main one.
 */
export function ListCard({ children, className }: { children: ReactNode; className?: string }) {
  return <Card className={cx("overflow-hidden", className)}><ul className="m-0 list-none divide-y divide-app-line p-0">{children}</ul></Card>;
}

/** A list row; `aside` sits beside the row's link (for a button that mustn't be inside the link). */
export function ListRow({ href, children, className, aside }: { href?: string; children: ReactNode; className?: string; aside?: ReactNode }) {
  const inner = cx("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 text-app-ink no-underline sm:flex-nowrap sm:px-5", href && "hover:bg-app-canvas", aside ? "min-w-0 flex-1 pr-2 sm:pr-2" : null, className);
  const row = href ? <Link href={href} className={inner}>{children}</Link> : <div className={inner}>{children}</div>;
  return <li className={aside ? "flex items-center pr-3 sm:pr-4" : undefined}>{row}{aside}</li>;
}

export function EmptyState({ icon = "sparkle", title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-app-peach text-app-accent-ink"><Icon name={icon} size={22} /></span>
      <h2 className="mb-0 mt-4 text-[18px] font-extrabold">{title}</h2>
      {children && <p className="mb-0 mt-1.5 max-w-[460px] text-[14.5px] leading-[1.55] text-app-ink-soft">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

/** Peggy/Rex tip strip (mint for Peggy, peach for Rex). */
export function AssistantNote({ who = "peggy", mood = "idle", children, action }: { who?: "peggy" | "rex"; mood?: MascotMood; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={cx("flex flex-wrap items-center gap-3 rounded-[18px] px-4 py-3", who === "peggy" ? "bg-app-mint" : "bg-app-peach")}>
      <Mascot who={who} mood={mood} size={36} />
      <p className="m-0 min-w-0 flex-1 text-[14px] leading-[1.5]">{children}</p>
      {action}
    </div>
  );
}

/** Two-column page body that stacks below xl: main content and a side column. */
export function SplitLayout({ main, side, sideWidth = "420px" }: { main: ReactNode; side: ReactNode; sideWidth?: string }) {
  return (
    <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_var(--side)]" style={{ ["--side" as string]: sideWidth }}>
      <div className="grid min-w-0 content-start gap-5">{main}</div>
      <div className="grid min-w-0 content-start gap-5">{side}</div>
    </div>
  );
}

export { cx };
