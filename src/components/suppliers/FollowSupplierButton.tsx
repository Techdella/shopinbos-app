"use client";

import { useState, useTransition } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { cx } from "@/components/app-ui/cx";
import { toggleFollowSupplier } from "@/app/actions/supplier-follow";

/** Follow a supplier to get their updates (Supplier Pro sends them; src/lib/suppliers/follow.server.ts). */
export function FollowSupplierButton({ supplierId, following: initial }: { supplierId: string; following: boolean }) {
  const t = useT("marketplace");
  const [following, setFollowing] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-pressed={following}
      disabled={pending}
      onClick={() => start(async () => {
        const result = await toggleFollowSupplier(supplierId, !following);
        if (result.ok) setFollowing(!following);
      })}
      className={cx(
        "inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full px-5 text-[14px] font-extrabold transition disabled:opacity-55 sm:flex-none",
        following ? "border border-app-line bg-white text-app-ink" : "bg-app-ink text-white hover:bg-black",
      )}
    >
      {following ? t("pub.following") : t("pub.follow")}
    </button>
  );
}
