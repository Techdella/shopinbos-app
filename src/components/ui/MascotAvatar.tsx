import { Mascot, type MascotMood } from "@/components/brand/Mascot";
import type { AuthRole } from "@/lib/brand";

export function mascotForRole(role: AuthRole): { name: "peggy" | "rex"; label: string } {
  if (role === "seller") return { name: "peggy", label: "Peggy" };
  return { name: "rex", label: "Rex" };
}

interface MascotAvatarProps {
  role: AuthRole;
  size?: number;
  /** Kept for older call sites; the mood now picks the pose. */
  variant?: number;
  mood?: MascotMood;
}

export function MascotAvatar({ role, size = 36, mood = "idle" }: MascotAvatarProps) {
  const { name, label } = mascotForRole(role);
  return (
    <div style={{ width: size, height: size, minWidth: size }} className="shrink-0 overflow-hidden rounded-[10px]">
      <Mascot who={name} mood={mood} alt={label} className="h-full w-full" />
    </div>
  );
}
