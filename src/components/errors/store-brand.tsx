import type { ShopperTheme } from "@/components/storefront/shopper/theme";
import type { ScenePalette } from "./ErrorScene";

// Store-themed pieces shared by the storefront error pages (client) and the "not open yet" page (server).

export function shopperPalette(theme: ShopperTheme): ScenePalette {
  return {
    page: theme.paper,
    ink: theme.ink,
    muted: theme.muted,
    accent: theme.cta,
    accentText: theme.ctaText,
    warm: theme.cta,
    paper: theme.surface,
    line: theme.border,
    heading: theme.heading,
    body: theme.body,
  };
}

export function StoreMark({ name, logoUrl, href, theme }: { name: string; logoUrl: string | null; href: string; theme: ShopperTheme }) {
  return (
    <a href={href} className="inline-flex min-h-11 items-center gap-2.5 rounded-full px-2 no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ color: theme.ink, outlineColor: theme.ink }}>
      {logoUrl ? <img src={logoUrl} alt="" width={36} height={36} className="h-9 w-9 rounded-[10px] object-cover" /> : null}
      <span className="text-[18px] font-semibold" style={{ fontFamily: theme.heading }}>{name}</span>
    </a>
  );
}
