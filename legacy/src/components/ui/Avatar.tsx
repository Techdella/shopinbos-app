import { cn } from "@/lib/utils";

interface AvatarProps {
  name: string;
  color?: string;
  size?: number;
  className?: string;
}

export function Avatar({ name, color = "var(--color-amber)", size = 32, className }: AvatarProps) {
  const initials = name.slice(0, 2).toUpperCase();
  const fontSize = Math.round(size * 0.42);
  const radius   = Math.round(size / 3);

  return (
    <div
      className={cn("inline-flex items-center justify-center font-display font-semibold shrink-0", className)}
      style={{ width: size, height: size, borderRadius: radius, background: color, color: "var(--color-navy)", fontSize }}
      aria-label={name}
    >
      {initials}
    </div>
  );
}
