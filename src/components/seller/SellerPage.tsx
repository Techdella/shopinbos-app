import type { ReactNode } from "react";
import { AppFrame } from "@/components/shell/AppFrame";
import { cx } from "@/components/app-ui/cx";
import { HelpButton } from "@/components/simple/HelpButton";
import type { requireRole } from "@/lib/server-auth";

// Page chrome for the 2026-style seller pages (same look as /home): app shell, title, actions.

type AppUser = Awaited<ReturnType<typeof requireRole>>;

export interface SellerStoreSummary {
  name: string;
  slug: string;
  logoUrl: string | null;
}

export function SellerPage({
  user,
  store,
  title,
  sub,
  actions,
  width = "",
  children,
}: {
  user: AppUser;
  store: SellerStoreSummary | null;
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
  width?: string;
  children: ReactNode;
}) {
  return (
    <AppFrame
      role="seller"
      storeName={store?.name}
      storeSlug={store?.slug}
      storeInitial={store?.name.charAt(0).toUpperCase()}
      storeLogoUrl={store?.logoUrl}
      userName={user.name}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div className={cx("w-full px-4 py-6 font-app text-app-ink sm:px-6 xl:px-8 2xl:px-10", width)}>
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.8px]">{title}</h1>
            {sub && <p className="mb-0 mt-1.5 max-w-[640px] text-[14.5px] leading-[1.5] text-app-ink-soft">{sub}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {actions}
            <HelpButton />
          </div>
        </header>
        {children}
      </div>
    </AppFrame>
  );
}

export function SellerCard({ className = "", children }: { className?: string; children: ReactNode }) {
  return <section className={cx("rounded-[22px] border border-app-line bg-white", className)}>{children}</section>;
}

export const pillLink = {
  ink: "inline-flex min-h-[44px] items-center gap-2 rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white no-underline hover:bg-black",
  white: "inline-flex min-h-[44px] items-center gap-2 rounded-full border border-app-line bg-white px-5 text-[14px] font-extrabold text-app-ink no-underline hover:border-app-line-strong",
};

/** Store summary for SellerPage from a store row. */
export function storeSummary(store: { name: string; slug: string; logoUrl: string | null } | null): SellerStoreSummary | null {
  return store ? { name: store.name, slug: store.slug, logoUrl: store.logoUrl } : null;
}
