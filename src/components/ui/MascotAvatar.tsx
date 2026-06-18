import Image from "next/image";
import { mascotPaths, type AuthRole } from "@/lib/brand";

export function mascotForRole(role: AuthRole): { name: "peggy" | "rex"; label: string } {
  if (role === "seller") return { name: "peggy", label: "Peggy" };
  return { name: "rex", label: "Rex" };
}

interface MascotAvatarProps {
  role: AuthRole;
  size?: number;
  variant?: number;
}

export function MascotAvatar({ role, size = 36, variant = 0 }: MascotAvatarProps) {
  const { name, label } = mascotForRole(role);
  const frames = mascotPaths[name];
  const src = frames[variant % frames.length];

  return (
    <div
      style={{ width: size, height: size, minWidth: size }}
      className="shrink-0 overflow-hidden rounded-[10px]"
    >
      <Image
        src={src}
        alt={label}
        width={size * 2}
        height={size * 2}
        className="h-full w-full object-cover object-top"
      />
    </div>
  );
}
