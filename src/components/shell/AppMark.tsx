import { BrandLogo } from "@/components/brand/BrandLogo";
import { cn } from "@/lib/utils";

interface AppMarkProps {
  dark?: boolean;
  className?: string;
}

export function AppMark({ dark = true, className }: AppMarkProps) {
  return (
    <div className={cn("flex items-center", className)}>
      <BrandLogo theme={dark ? "light" : "dark"} className="w-[150px]" />
    </div>
  );
}
