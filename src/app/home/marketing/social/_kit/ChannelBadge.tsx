import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/app-ui/cx";
import type { PostChannel } from "@/lib/social-posts/pure";

// The small round brand mark for a channel (calendar chips, the composer, results). Server-safe.

const STYLE: Record<PostChannel, string> = {
  instagram: "bg-[#E1306C] text-white",
  facebook: "bg-[#1877F2] text-white",
  whatsapp: "bg-[#25D366] text-white",
  tiktok: "bg-black text-white",
  x: "bg-black text-white",
};

export function ChannelBadge({ channel, size = 22, className }: { channel: PostChannel; size?: number; className?: string }) {
  return (
    <span aria-hidden className={cx("inline-grid shrink-0 place-items-center rounded-full", STYLE[channel], className)} style={{ width: size, height: size }}>
      {channel === "x" ? <span className="font-extrabold leading-none" style={{ fontSize: size * 0.55 }}>𝕏</span> : <Icon name={channel} size={Math.round(size * 0.6)} />}
    </span>
  );
}
