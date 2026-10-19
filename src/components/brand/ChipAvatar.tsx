import { cn } from "@/lib/utils";
import { Mascot, type MascotMood } from "@/components/brand/Mascot";

interface ChipAvatarProps {
  mascot?: "rex" | "peggy";
  size?: number;
  className?: string;
  mood?: MascotMood;
}

export function ChipAvatar({ mascot = "rex", size = 36, className, mood = "idle" }: ChipAvatarProps) {
  return (
    <div className={cn("shrink-0 overflow-hidden rounded-[10px]", className)} style={{ width: size, height: size, minWidth: size }}>
      <Mascot who={mascot} mood={mood} className="h-full w-full" />
    </div>
  );
}
