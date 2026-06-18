import Image from "next/image";
import { cn } from "@/lib/utils";
import { mascotPaths } from "@/lib/brand";

interface ChipAvatarProps {
  mascot?: "rex" | "peggy";
  size?: number;
  className?: string;
}

export function ChipAvatar({ mascot = "rex", size = 36, className }: ChipAvatarProps) {
  const src = mascot === "peggy" ? mascotPaths.peggy[1] : mascotPaths.rex[1];

  return (
    <div
      className={cn("shrink-0 overflow-hidden rounded-[10px]", className)}
      style={{ width: size, height: size, minWidth: size }}
    >
      <Image
        src={src}
        alt={mascot === "peggy" ? "Peggy" : "Rex"}
        width={size * 2}
        height={size * 2}
        className="h-full w-full object-cover object-top"
      />
    </div>
  );
}
