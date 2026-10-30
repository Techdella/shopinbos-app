"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import type { ShopperVideo } from "../../../../../shared/product-videos.ts";
import { SectionTitle } from "../BoutiqueChrome";
import type { BoutiqueLook } from "../look";

// Product videos on a shop's product page (Post to Plug pilot, shared/product-videos.ts): tall cards in a row, each
// showing its poster first. Nothing plays or downloads until the shopper taps it (no autoplay, preload none), then it
// plays with sound and the controls. Never shows who posted it: a supplier's video looks like the shop's own.

function VideoCard({ video, number, name, look }: { video: ShopperVideo; number: number; name: string; look: BoutiqueLook }) {
  const words = useT("productVideos");
  const [playing, setPlaying] = useState(false);
  const t = look.tokens;
  const radius = Math.min(look.cardRadius, 18);
  return (
    <figure className="m-0 w-[180px] shrink-0 @3xl:w-[220px]">
      <div className="relative overflow-hidden" style={{ aspectRatio: "9 / 16", borderRadius: radius, background: "#0E0E0E" }}>
        {playing ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={video.videoUrl}
            poster={video.posterUrl ?? undefined}
            controls
            autoPlay
            playsInline
            preload="none"
            className="h-full w-full object-cover"
            aria-label={words("shop.video", { number, name })}
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={words("shop.play", { number })}
            className="group absolute inset-0 flex h-full w-full items-center justify-center border-0 p-0"
            style={{ background: "transparent", cursor: "pointer" }}
          >
            {video.posterUrl ? <img src={video.posterUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" /> : null}
            <span className="relative flex h-14 w-14 items-center justify-center rounded-full transition-transform group-hover:scale-105" style={{ background: "rgba(255,255,255,0.92)", color: "#0E0E0E" }}>
              <Icon name="play" size={24} />
            </span>
          </button>
        )}
      </div>
      {video.caption ? (
        <figcaption className="mt-2 line-clamp-2 text-[13px] leading-[1.4]" style={{ color: t.muted }}>
          {video.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

export function PdpVideos({ videos, name, look, id }: { videos: readonly ShopperVideo[] | null | undefined; name: string; look: BoutiqueLook; id: string }) {
  const words = useT("productVideos");
  if (!videos?.length) return null;
  return (
    <section aria-labelledby={id} className="mt-10" data-testid="pdp-videos">
      <SectionTitle look={look} id={id}>{words("shop.title")}</SectionTitle>
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollSnapType: "x mandatory" }}>
        {videos.map((video, index) => (
          <div key={video.id} style={{ scrollSnapAlign: "start" }}>
            <VideoCard video={video} number={index + 1} name={name} look={look} />
          </div>
        ))}
      </div>
    </section>
  );
}
