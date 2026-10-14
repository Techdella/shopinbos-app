import { cn } from "@/lib/utils";
import { pickMascot, type AuthRole, type MascotName } from "@/lib/brand";
import { Mascot, type MascotMood } from "@/components/brand/Mascot";

interface MascotFigureProps {
  role?: AuthRole;
  /** Kept for older call sites; the mood now picks the pose. */
  variant?: number;
  className?: string;
  /** Kept for older call sites (the still is eager anyway). */
  priority?: boolean;
  /** Show this mascot instead of the role's own (sellers get Peggy, everyone else Rex). */
  who?: MascotName;
  mood?: MascotMood;
  alt?: string;
}

/** A large, full-width Rex or Peggy. Sizes itself to its container's width (square). */
export function MascotFigure({ role = "seller", variant = 0, className, who, mood = "idle", alt }: MascotFigureProps) {
  const mascot = who ?? pickMascot(role, variant).name;
  return <Mascot who={mascot} mood={mood} alt={alt} className={cn("aspect-square h-auto w-full", className)} />;
}
