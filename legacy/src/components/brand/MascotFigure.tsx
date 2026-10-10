import Image from "next/image";
import { cn } from "@/lib/utils";
import { pickMascot, type AuthRole } from "@/lib/brand";

interface MascotFigureProps {
  role?: AuthRole;
  variant?: number;
  className?: string;
  priority?: boolean;
  src?: string;
  alt?: string;
}

export function MascotFigure({
  role = "seller",
  variant = 0,
  className,
  priority = false,
  src,
  alt,
}: MascotFigureProps) {
  const mascot = pickMascot(role, variant);
  const imageSrc = src ?? mascot.src;
  const imageAlt = alt ?? (mascot.name === "rex" ? "Rex mascot" : "Peggy mascot");

  return (
    <Image
      src={imageSrc}
      alt={imageAlt}
      width={1600}
      height={1600}
      priority={priority}
      className={cn("h-auto w-full", className)}
    />
  );
}
