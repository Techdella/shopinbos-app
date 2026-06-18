"use client";

import { useEffect } from "react";
import { AppFrame } from "@/components/shell/AppFrame";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { Role } from "@/lib/nav";

type PortalRole = Extract<Role, "seller" | "supplier" | "logistics_partner">;

interface RoleStateCopy {
  label: string;
  assistant: string;
  loadingTitle: string;
  loadingBody: string;
  errorTitle: string;
  errorBody: string;
  icon: IconName;
  tone: string;
  soft: string;
  search: string;
}

const copyByRole: Record<PortalRole, RoleStateCopy> = {
  seller: {
    label: "Seller",
    assistant: "Peggy",
    loadingTitle: "Opening your shop workspace",
    loadingBody: "Peggy is bringing together orders, products, payments, and store updates.",
    errorTitle: "This shop view needs a refresh",
    errorBody: "Peggy could not load this part of your workspace. Try again and we will bring it back into view.",
    icon: "sparkle",
    tone: "var(--teal-700)",
    soft: "var(--teal-100)",
    search: "Search products, orders, suppliers...",
  },
  supplier: {
    label: "Supplier",
    assistant: "Rex",
    loadingTitle: "Preparing your supplier desk",
    loadingBody: "Rex is lining up products, quotes, orders, and payout signals.",
    errorTitle: "This supplier view needs a refresh",
    errorBody: "Rex could not load this workspace section. Try again and we will pick it back up.",
    icon: "bolt",
    tone: "var(--amber-500)",
    soft: "var(--amber-100)",
    search: "Search products, orders, buyers...",
  },
  logistics_partner: {
    label: "Logistics",
    assistant: "Rex",
    loadingTitle: "Preparing your route desk",
    loadingBody: "Rex is checking bookings, quotes, coverage, and pricing before the page opens.",
    errorTitle: "This logistics view needs a refresh",
    errorBody: "Rex could not load this route workspace. Try again and we will bring the board back.",
    icon: "truck",
    tone: "var(--indigo-500)",
    soft: "var(--indigo-100)",
    search: "Search bookings, sellers, couriers...",
  },
};

function SkeletonBar({ width = "100%" }: { width?: string }) {
  return (
    <div
      className="h-3 animate-pulse rounded-full"
      style={{
        width,
        background: "linear-gradient(90deg, var(--ink-100), var(--paper), var(--ink-100))",
        backgroundSize: "180% 100%",
      }}
    />
  );
}

export function PortalLoadingState({ role }: { role: PortalRole }) {
  const copy = copyByRole[role];

  return (
    <AppFrame role={role} chipMode="rail" searchPlaceholder={copy.search}>
      <div className="px-7 py-6 pb-10">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--ink-500)]">
          <span className="font-semibold" style={{ color: copy.tone }}>{copy.label}</span>
          <Icon name="chevron" size={12} color="var(--ink-300)" />
          <span className="font-semibold text-[var(--ink-800)]">Loading</span>
        </div>

        <div className="card tight mb-4 overflow-hidden">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px]" style={{ background: copy.soft, color: copy.tone }}>
                <Icon name={copy.icon} size={22} />
              </div>
              <div>
                <h1 className="m-0 font-display text-[28px] font-medium leading-tight text-[var(--ink-900)]">{copy.loadingTitle}</h1>
                <p className="m-0 mt-1 max-w-[660px] text-[14px] leading-6 text-[var(--ink-500)]">{copy.loadingBody}</p>
              </div>
            </div>
            <div className="rounded-[12px] border border-[var(--ink-100)] bg-[var(--paper)] px-4 py-3 text-[12px] leading-5 text-[var(--ink-600)] lg:w-[280px]">
              <div className="mb-1 flex items-center gap-2 font-semibold text-[var(--ink-900)]">
                <Icon name="sparkle" size={13} color={copy.tone} />
                {copy.assistant}
              </div>
              Keeping the workspace warm while the latest data arrives.
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[72, 58, 64, 50].map((width, index) => (
            <div key={width} className="stat">
              <div className="mb-4 flex items-start justify-between gap-3">
                <SkeletonBar width={`${width}%`} />
                <div className="h-9 w-9 shrink-0 rounded-[10px]" style={{ background: copy.soft }} />
              </div>
              <div className="mb-3 h-8 w-24 rounded-[10px]" style={{ background: "var(--ink-100)" }} />
              <SkeletonBar width={index % 2 === 0 ? "70%" : "52%"} />
            </div>
          ))}
        </div>

        <div className="card mt-4 overflow-hidden p-0">
          <div className="border-b border-[var(--ink-100)] px-4 py-3.5">
            <SkeletonBar width="180px" />
            <div className="mt-2">
              <SkeletonBar width="260px" />
            </div>
          </div>
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="grid gap-3 rounded-[12px] border border-[var(--ink-100)] p-3 md:grid-cols-[1fr_140px_120px]">
                <SkeletonBar />
                <SkeletonBar width="120px" />
                <SkeletonBar width="90px" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppFrame>
  );
}

export function PortalErrorState({
  role,
  error,
  unstable_retry,
}: {
  role: PortalRole;
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const copy = copyByRole[role];

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <AppFrame role={role} chipMode="rail" searchPlaceholder={copy.search}>
      <div className="flex min-h-full items-center justify-center px-6 py-10">
        <div className="card max-w-[620px] text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-[16px]" style={{ background: copy.soft, color: copy.tone }}>
            <Icon name="warn" size={24} />
          </div>
          <div className="mt-5 font-mono text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: copy.tone }}>
            {copy.label} workspace
          </div>
          <h1 className="m-0 mt-2 font-display text-[30px] font-medium leading-tight text-[var(--ink-900)]">{copy.errorTitle}</h1>
          <p className="mx-auto mt-3 max-w-[460px] text-[14px] leading-6 text-[var(--ink-500)]">{copy.errorBody}</p>
          {error.digest && (
            <div className="mx-auto mt-4 inline-flex rounded-full border border-[var(--ink-100)] bg-[var(--ink-50)] px-3 py-1.5 font-mono text-[11px] text-[var(--ink-500)]">
              Ref {error.digest}
            </div>
          )}
          <div className="mt-6 flex justify-center">
            <button type="button" onClick={() => unstable_retry()} className="dbtn dBtn-mint dBtn-sm">
              <Icon name="refresh" size={13} />
              Try again
            </button>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
