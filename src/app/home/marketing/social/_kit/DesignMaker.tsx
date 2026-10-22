"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { buttonClass } from "@/components/growth/kit";
import { useT } from "@/components/i18n/I18nProvider";
import { POST_FORMATS, POST_FORMAT_KEYS, formatSize, type PostFormat } from "@/lib/social-posts/pure";
import type { RexMakeKind } from "./RexMakeModal";
import type { MadeDesign, RexMakerData } from "./types";

const RexMakeModal = dynamic(() => import("./RexMakeModal").then((mod) => mod.RexMakeModal), { ssr: false });

/**
 * Rex designs → "Make one with Rex": a tile per post size and one for a reel, each opening Rex in a pop-up. What
 * Rex makes goes straight into a new post (and shows in Rex designs from then on).
 */
export function DesignMaker({ data, variant = "tiles" }: { data: RexMakerData; variant?: "tiles" | "button" }) {
  const t = useT("socialPosts");
  const router = useRouter();
  const [open, setOpen] = useState<{ kind: RexMakeKind; format: PostFormat } | null>(null);
  const close = useCallback(() => {
    setOpen(null);
    router.refresh();
  }, [router]);

  function use(design: MadeDesign) {
    setOpen(null);
    router.push(design.kind === "image" ? `/home/marketing/social/new?image=${encodeURIComponent(design.url)}` : `/home/marketing/social/new?video=${encodeURIComponent(design.id ?? design.url)}`);
  }

  const modal = open && <RexMakeModal kind={open.kind} format={open.format} data={data} onUse={use} onClose={close} />;

  if (variant === "button") {
    return (
      <>
        <button type="button" onClick={() => setOpen({ kind: "image", format: "portrait" })} className={buttonClass("ink", "md")}>
          <Icon name="sparkle" size={16} />
          {t("designs.emptyAction")}
        </button>
        {modal}
      </>
    );
  }

  return (
    <>
      <ul className="m-0 mt-4 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-5">
        {POST_FORMAT_KEYS.map((key) => (
          <li key={key}>
            <button type="button" onClick={() => setOpen({ kind: "image", format: key })} className="grid h-full w-full cursor-pointer gap-2 rounded-[16px] border border-app-line bg-app-canvas p-3 text-left text-app-ink hover:border-app-ink">
              <span className="grid h-[72px] place-items-center">
                <span className="block rounded-[6px] border-2 border-app-ink bg-white" style={{ height: 64, aspectRatio: `${POST_FORMATS[key].width} / ${POST_FORMATS[key].height}`, maxWidth: 100 }} />
              </span>
              <span className="text-[14px] font-extrabold">{t(`fmt.${key}`)}</span>
              <span className="text-[12px] text-app-ink-soft">{t(`fmt.${key}.for`)}</span>
              <span className="font-mono text-[11px] text-app-ink-soft">{POST_FORMATS[key].ratio} · {formatSize(key)}</span>
            </button>
          </li>
        ))}
        <li>
          <button type="button" onClick={() => setOpen({ kind: "reel", format: "story" })} className="grid h-full w-full cursor-pointer gap-2 rounded-[16px] border border-app-line bg-app-ink p-3 text-left text-white hover:brightness-110">
            <span className="grid h-[72px] place-items-center"><Icon name="play" size={30} /></span>
            <span className="text-[14px] font-extrabold">{t("designs.reel")}</span>
            <span className="text-[12px] opacity-75">{t("designs.reelFor")}</span>
            <span className="font-mono text-[11px] opacity-75">9:16 · 1080 × 1920</span>
          </button>
        </li>
      </ul>
      {modal}
    </>
  );
}
