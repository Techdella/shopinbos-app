"use client";

import { useEffect } from "react";
import { AppFrame } from "@/components/shell/AppFrame";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { Role } from "@/lib/nav";

type PortalRole = Extract<Role, "seller" | "supplier" | "logistics_partner">;

interface RoleStateCopy {
  label: string;
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
    errorTitle: "This shop view needs a refresh",
    errorBody: "Peggy could not load this part of your workspace. Try again and we will bring it back into view.",
    icon: "sparkle",
    tone: "var(--teal-700)",
    soft: "var(--teal-100)",
    search: "Search products, orders, suppliers...",
  },
  supplier: {
    label: "Supplier",
    errorTitle: "This supplier view needs a refresh",
    errorBody: "Rex could not load this workspace section. Try again and we will pick it back up.",
    icon: "bolt",
    tone: "var(--amber-500)",
    soft: "var(--amber-100)",
    search: "Search products, orders, buyers...",
  },
  logistics_partner: {
    label: "Logistics",
    errorTitle: "This logistics view needs a refresh",
    errorBody: "Rex could not load this route workspace. Try again and we will bring the board back.",
    icon: "truck",
    tone: "var(--indigo-500)",
    soft: "var(--indigo-100)",
    search: "Search bookings, sellers, couriers...",
  },
};

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
