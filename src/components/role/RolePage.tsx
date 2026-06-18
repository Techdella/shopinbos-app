import type { ReactNode } from "react";
import Link from "next/link";
import { AppFrame } from "@/components/shell/AppFrame";
import { Icon, type IconName } from "@/components/ui/Icon";
import { MascotAvatar } from "@/components/ui";
import type { Role } from "@/lib/nav";

export interface MetricItem {
  label: string;
  value: string;
  delta?: string;
  sub?: string;
  icon?: IconName;
  tone?: "teal" | "amber" | "berry" | "indigo" | "lime" | "rose" | "ink";
}

export interface TableColumn<T> {
  label: string;
  value: (row: T) => ReactNode;
}

interface ActionLink {
  label: string;
  href: string;
  icon?: IconName;
  variant?: "primary" | "secondary";
}

interface RolePageProps {
  role: Role;
  title: string;
  eyebrow: string;
  description?: string;
  metrics?: MetricItem[];
  actions?: ActionLink[];
  assistantNote?: string;
  children: ReactNode;
}

interface DataTableProps<T> {
  title: string;
  empty: string;
  rows: T[];
  columns: TableColumn<T>[];
  search?: string;
  filters?: string[];
  action?: ReactNode;
}

const roleTone: Record<
  Role,
  {
    label: string;
    assistant: string;
    chip: string;
    accent: string;
    accentSoft: string;
    iconBg: string;
    icon: IconName;
    search: string;
    note: string;
  }
> = {
  seller: {
    label: "Seller",
    assistant: "Peggy",
    chip: "Shop focus",
    accent: "var(--teal-700)",
    accentSoft: "var(--teal-50)",
    iconBg: "var(--teal-100)",
    icon: "sparkle",
    search: "Search products, orders, suppliers...",
    note: "Your shop is ready. Peggy is watching orders, customers, stock, and payments so you can move faster.",
  },
  supplier: {
    label: "Supplier",
    assistant: "Rex",
    chip: "Factory focus",
    accent: "var(--amber-500)",
    accentSoft: "var(--amber-100)",
    iconBg: "var(--amber-100)",
    icon: "bolt",
    search: "Search products, orders, buyers...",
    note: "Rex is looking for the products and order actions that can win more sellers today.",
  },
  logistics_partner: {
    label: "Logistics",
    assistant: "Rex",
    chip: "Ops focus",
    accent: "var(--indigo-500)",
    accentSoft: "var(--info-bg)",
    iconBg: "var(--indigo-100)",
    icon: "truck",
    search: "Search bookings, sellers, couriers...",
    note: "Rex is keeping the route board tidy so pickups, quotes, and couriers stay easy to scan.",
  },
  admin: {
    label: "Admin",
    assistant: "Rex",
    chip: "Platform focus",
    accent: "var(--teal-700)",
    accentSoft: "var(--ink-50)",
    iconBg: "var(--ink-100)",
    icon: "settings",
    search: "Search users, partners, products...",
    note: "Rex is surfacing marketplace health signals so the platform team can act quickly.",
  },
};

const metricTones: Record<NonNullable<MetricItem["tone"]>, { bg: string; color: string }> = {
  teal: { bg: "var(--teal-100)", color: "var(--teal-800)" },
  amber: { bg: "var(--amber-100)", color: "var(--amber-500)" },
  berry: { bg: "var(--berry-100)", color: "var(--berry-500)" },
  indigo: { bg: "var(--indigo-100)", color: "var(--indigo-500)" },
  lime: { bg: "var(--lime-100)", color: "var(--lime-500)" },
  rose: { bg: "var(--rose-100)", color: "var(--rose-500)" },
  ink: { bg: "var(--ink-100)", color: "var(--ink-700)" },
};

const fallbackMetricIcons: IconName[] = ["coin", "cart", "users", "box", "truck", "star"];

function inferActionIcon(label: string): IconName {
  const normalized = label.toLowerCase();
  if (normalized.includes("export") || normalized.includes("statement")) return "download";
  if (normalized.includes("review") || normalized.includes("quote")) return "chat";
  if (normalized.includes("coverage") || normalized.includes("zone")) return "pin";
  if (normalized.includes("product") || normalized.includes("add")) return "plus";
  if (normalized.includes("supplier")) return "shop";
  if (normalized.includes("logistics") || normalized.includes("delivery")) return "truck";
  if (normalized.includes("store")) return "eye";
  return "arrow";
}

function MetricTile({ metric, index }: { metric: MetricItem; index: number }) {
  const fallbackTone = ["teal", "amber", "berry", "indigo", "lime"][index % 5] as NonNullable<MetricItem["tone"]>;
  const tone = metricTones[metric.tone ?? fallbackTone];
  const deltaDir = metric.delta?.startsWith("-") ? "down" : metric.delta?.startsWith("+") ? "up" : "flat";
  const icon = metric.icon ?? fallbackMetricIcons[index % fallbackMetricIcons.length];

  return (
    <div className="stat">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="stat-lbl">{metric.label}</div>
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
          style={{ background: tone.bg, color: tone.color }}
        >
          <Icon name={icon} size={18} color="currentColor" />
        </div>
      </div>
      <div className="stat-val">{metric.value}</div>
      {(metric.delta || metric.sub) && (
        <div className={`stat-delta delta-${deltaDir}`}>
          {metric.delta && (
            <>
              <Icon name={deltaDir === "up" ? "arrowUp" : deltaDir === "down" ? "arrowDown" : "minus"} size={12} />
              <span>{metric.delta}</span>
            </>
          )}
          {metric.sub && <span className={metric.delta ? "text-[var(--ink-500)]" : ""}>{metric.sub}</span>}
        </div>
      )}
    </div>
  );
}

export function RolePage({
  role,
  title,
  eyebrow,
  description,
  metrics = [],
  actions = [],
  assistantNote,
  children,
}: RolePageProps) {
  const tone = roleTone[role];
  const focusMetrics = metrics.slice(0, 4);

  return (
    <AppFrame role={role} chipMode="rail" searchPlaceholder={tone.search}>
      <div className="flex flex-col gap-[18px] px-7 py-6 pb-10">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--ink-500)]">
            <span className="font-semibold text-[var(--teal-700)]">{tone.label}</span>
            <Icon name="chevron" size={12} color="var(--ink-300)" />
            <span className="font-semibold text-[var(--ink-800)]">{eyebrow}</span>
          </div>
          <div className="pg-hero">
            <div className="min-w-0">
              <h1>{title}</h1>
              {description && <div className="pg-sub max-w-[760px] leading-6">{description}</div>}
            </div>
            {actions.length > 0 && (
              <div className="pg-acts flex-wrap justify-end">
                {actions.map((action, index) => {
                  const primary = action.variant === "primary" || (action.variant !== "secondary" && index === actions.length - 1);
                  return (
                    <Link
                      key={action.href}
                      href={action.href}
                      className={`dbtn dBtn-sm no-underline ${primary ? "dBtn-mint" : "dBtn-ghost"}`}
                    >
                      <Icon name={action.icon ?? inferActionIcon(action.label)} size={14} />
                      {action.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {metrics.length > 0 && (
          <div
            className="card tight"
            style={{
              background: `linear-gradient(120deg, ${tone.accentSoft} 0%, var(--paper) 82%)`,
              borderColor: tone.accentSoft,
            }}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
              <div
                className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[12px]"
                style={{ background: tone.iconBg, color: tone.accent }}
              >
                <Icon name={tone.icon} size={22} color="currentColor" />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.06em]"
                  style={{ color: tone.accent }}
                >
                  {tone.chip}
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {focusMetrics.map((metric) => (
                    <div key={metric.label} className="rounded-[10px] border border-[var(--ink-100)] bg-[var(--paper)] px-3.5 py-3">
                      <div className="font-display text-[26px] font-medium leading-none text-[var(--ink-900)]">{metric.value}</div>
                      <div className="mt-1 text-[12px] font-semibold text-[var(--ink-800)]">{metric.label}</div>
                      {(metric.sub || metric.delta) && (
                        <div className="mt-0.5 text-[11px] leading-5 text-[var(--ink-500)]">{metric.sub ?? metric.delta}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="w-full rounded-[12px] border border-[var(--ink-100)] bg-[var(--paper)] p-3 text-[12.5px] leading-5 text-[var(--ink-700)] lg:w-[260px]">
                <div className="mb-1 flex items-center gap-1.5 font-semibold text-[var(--ink-900)]">
                  <MascotAvatar role={role} size={20} />
                  {tone.assistant}
                </div>
                {assistantNote ?? tone.note}
              </div>
            </div>
          </div>
        )}

        {metrics.length > 0 && (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(190px, 100%), 1fr))" }}
          >
            {metrics.map((metric, index) => (
              <MetricTile key={metric.label} metric={metric} index={index} />
            ))}
          </div>
        )}

        <div>{children}</div>
      </div>
    </AppFrame>
  );
}

export function DataTable<T extends { id: string }>({
  title,
  empty,
  rows,
  columns,
  search = "Search this list...",
  filters = ["Status: All", "Date: Any"],
  action,
}: DataTableProps<T>) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-[var(--ink-100)] px-4 py-3.5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="m-0 text-[14px] font-semibold text-[var(--ink-900)]">{title}</h2>
          <p className="m-0 mt-0.5 text-[12px] text-[var(--ink-500)]">
            {rows.length > 0 ? `${rows.length} item${rows.length === 1 ? "" : "s"} in view` : empty}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 min-w-[210px] items-center gap-2 rounded-[10px] border border-[var(--ink-150)] bg-[var(--paper)] px-3 text-[13px] text-[var(--ink-500)]">
            <Icon name="search" size={15} />
            <span>{search}</span>
          </div>
          {filters.map((filter) => (
            <button key={filter} type="button" className="dbtn dBtn-ghost dBtn-sm">
              {filter}
              <Icon name="chevDown" size={12} />
            </button>
          ))}
          <button type="button" className="dbtn dBtn-ghost dBtn-sm">
            <Icon name="filter" size={13} />
            Filters
          </button>
          {action}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-10">
          <div className="mx-auto flex max-w-[520px] flex-col items-center text-center">
            <div className="grid h-12 w-12 place-items-center rounded-[14px] bg-[var(--ink-50)] text-[var(--ink-500)]">
              <Icon name="list" size={20} />
            </div>
            <div className="mt-4 text-[15px] font-semibold text-[var(--ink-900)]">{title} is clear</div>
            <p className="m-0 mt-1 text-[13px] leading-6 text-[var(--ink-500)]">{empty}</p>
            <div className="mt-4 flex items-center gap-2 rounded-full border border-[var(--ink-100)] bg-[var(--paper)] px-3 py-1.5 text-[12px] text-[var(--ink-500)]">
              <Icon name="sparkle" size={13} color="var(--teal-700)" />
              We will surface the next item here when it arrives.
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl min-w-[720px]">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.label}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {columns.map((column) => (
                    <td key={column.label} className="text-[var(--ink-800)]">
                      {column.value(row) ?? "-"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function formatMoney(value: number | null | undefined, currency = "NGN") {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}
