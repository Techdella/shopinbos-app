import type { ReactNode } from "react";
import type { AuthUser } from "@/lib/auth/types";
import { Pill, cx, type Tone } from "@/components/app-kit";

// Server-safe pieces shared by the admin pages (2026 app look, ink + orange, plum only as a hint).

export const VERIFICATION_STATUSES = ["unverified", "pending", "verified", "rejected", "suspended"] as const;
export const PRODUCT_STATUSES = ["draft", "pending_review", "published", "unpublished", "rejected"] as const;

const VERIFICATION: Record<string, { label: string; tone: Tone }> = {
  unverified: { label: "Not verified", tone: "muted" },
  pending: { label: "Waiting for review", tone: "warning" },
  verified: { label: "Verified", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  suspended: { label: "Suspended", tone: "danger" },
};

const PRODUCT: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "muted" },
  pending_review: { label: "In review", tone: "warning" },
  published: { label: "Published", tone: "success" },
  unpublished: { label: "Unpublished", tone: "muted" },
  rejected: { label: "Rejected", tone: "danger" },
};

export function verificationLabel(status: string) {
  return VERIFICATION[status]?.label ?? status.replace(/_/g, " ");
}

export function productStatusLabel(status: string) {
  return PRODUCT[status]?.label ?? status.replace(/_/g, " ");
}

export function VerificationPill({ status }: { status: string }) {
  return <Pill tone={VERIFICATION[status]?.tone ?? "muted"} dot>{verificationLabel(status)}</Pill>;
}

export function ProductStatusPill({ status }: { status: string }) {
  return <Pill tone={PRODUCT[status]?.tone ?? "muted"} dot>{productStatusLabel(status)}</Pill>;
}

export function onboardingSubmitted(state: unknown) {
  return Boolean(state && typeof state === "object" && !Array.isArray(state) && (state as { completed?: boolean }).completed === true);
}

export function OnboardingPill({ status }: { status: "submitted" | "draft" }) {
  return status === "submitted" ? <Pill tone="info">Onboarding sent</Pill> : <Pill tone="muted">Onboarding not sent</Pill>;
}

/** The shell props every admin page passes to AppPage. */
export function adminFrame(user: Pick<AuthUser, "name" | "email" | "avatarUrl">, searchPlaceholder = "Search suppliers, products, partners") {
  return { role: "admin" as const, userName: user.name, userEmail: user.email, avatarUrl: user.avatarUrl ?? null, searchPlaceholder };
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

export function formatMoney(value: number | null | undefined, currency = "NGN") {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

/** Query-string builder for filter chips and search, dropping empty values. */
export function withParams(path: string, params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

export const fieldClass =
  "min-h-[44px] w-full rounded-[14px] border border-app-line bg-white px-3.5 text-[14.5px] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink";

const BUTTON = {
  ink: "bg-app-ink text-white hover:bg-black",
  accent: "bg-app-accent text-white hover:brightness-95",
  white: "border border-app-line bg-white text-app-ink hover:border-app-line-strong",
  danger: "border border-app-line bg-white text-app-danger hover:border-app-danger",
} as const;

/** Class for a pill-shaped submit button inside a server form. */
export function buttonClass(tone: keyof typeof BUTTON = "ink", size: "sm" | "md" = "md") {
  return cx(
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-ink",
    size === "sm" ? "min-h-[40px] px-4 text-[13px]" : "min-h-[44px] px-5 text-[14px]",
    BUTTON[tone],
  );
}

export function Field({ label, htmlFor, hint, children, className }: { label: string; htmlFor: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13.5px] font-bold">{label}</label>
      {children}
      {hint && <p className="mb-0 mt-1 text-[12.5px] text-app-ink-soft">{hint}</p>}
    </div>
  );
}

/**
 * Approve / Reject pair posting to an existing server action. `fields` carries the ids and any
 * values the action would otherwise reset (trust and reliability scores).
 */
export function DecisionButtons({
  action,
  fields,
  approve,
  reject,
  subject,
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  approve: string;
  reject: string;
  subject: string;
}) {
  const hidden = Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />);
  return (
    <div className="flex shrink-0 items-center gap-2">
      <form action={action}>
        {hidden}
        <input type="hidden" name="status" value={reject} />
        <button type="submit" className={buttonClass("danger", "sm")} aria-label={`Reject ${subject}`}>Reject</button>
      </form>
      <form action={action}>
        {hidden}
        <input type="hidden" name="status" value={approve} />
        <button type="submit" className={buttonClass("ink", "sm")} aria-label={`Approve ${subject}`}>Approve</button>
      </form>
    </div>
  );
}

/** Small count tile row used on the admin list pages; wraps 2 → 3 → 5 columns. */
export function CountRow({ items }: { items: Array<{ label: string; value: number | string; hint?: string }> }) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} className="min-w-0 rounded-[18px] border border-app-line bg-white px-4 py-3.5">
          <div className="truncate text-[13px] text-app-ink-soft">{item.label}</div>
          <div className="mt-1 truncate text-[26px] font-extrabold leading-none tracking-[-0.5px]">{item.value}</div>
          {item.hint && <div className="mt-1.5 truncate text-[12.5px] text-app-ink-soft">{item.hint}</div>}
        </div>
      ))}
    </div>
  );
}
