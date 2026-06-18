import Image from "next/image";
import { cn } from "@/lib/utils";
import { logoPaths } from "@/lib/brand";

interface BrandLogoProps {
  theme?: "light" | "dark" | "mint" | "navy" | "gradient";
  className?: string;
  priority?: boolean;
}

export function BrandLogo({ theme = "dark", className, priority = false }: BrandLogoProps) {
  const src = logoPaths[theme];

  return (
    <Image
      src={src}
      alt="Shopinbos"
      width={732}
      height={89}
      priority={priority}
      className={cn("h-auto w-[168px]", className)}
    />
  );
}
