export type OnboardingRoleMemory = "seller" | "supplier" | "logistics_partner";
export type OnboardingDestination = "builder" | "marketplace";
export type OnboardingBuildPath = "rex" | "template";

export interface OnboardingPaletteMemory {
  id?: string;
  name?: string;
  personality?: string;
  vibe?: string;
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    surface?: string;
    text?: string;
  };
  bestFor?: string;
}

export interface OnboardingLogoMemory {
  style?: string;
  label?: string;
  url?: string | null;
  palette?: {
    primary?: string;
    secondary?: string;
    accent?: string;
  };
}

export interface StoreOnboardingMemory {
  version: 1;
  role?: OnboardingRoleMemory;
  step?: number;
  preferredName?: string;
  city?: string;
  category?: string;
  businessDescription?: string;
  storeName?: string;
  templateId?: string;
  destination?: OnboardingDestination;
  buildPath?: OnboardingBuildPath;
  completed?: boolean;
  customerProfile?: {
    who?: string;
    vibe?: string;
  };
  documentNotes?: string;
  notes?: string;
  documentNames?: string[];
  palette?: OnboardingPaletteMemory | null;
  logo?: OnboardingLogoMemory | null;
  uploadedLogoUrl?: string | null;
  aiCredits?: number;
  updatedAt?: string;
}

export interface StorePaletteMemory {
  heroBg: string;
  heroText: string;
  accent: string;
  ctaBg: string;
  ctaText: string;
  paperBg: string;
}

export function isDurableLogoUrl(url: unknown): url is string {
  return typeof url === "string" && (url.startsWith("https://") || url.startsWith("http://"));
}

export function paletteMemoryToStorePalette(palette?: OnboardingPaletteMemory | null): StorePaletteMemory | undefined {
  const colors = palette?.colors;
  if (!colors) return undefined;

  return {
    heroBg: colors.primary ?? "#0E2A38",
    heroText: colors.text ?? "#FAF7F1",
    accent: colors.accent ?? "#73D8C8",
    ctaBg: colors.accent ?? "#73D8C8",
    ctaText: "#0E2A38",
    paperBg: colors.background ?? "#FAF7F1",
  };
}

export function parseOnboardingMemory(value: unknown): StoreOnboardingMemory | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Partial<StoreOnboardingMemory>;

  return {
    ...record,
    version: 1,
    customerProfile:
      record.customerProfile && typeof record.customerProfile === "object"
        ? record.customerProfile
        : undefined,
    palette:
      record.palette && typeof record.palette === "object"
        ? record.palette
        : record.palette === null
          ? null
          : undefined,
    logo:
      record.logo && typeof record.logo === "object"
        ? record.logo
        : record.logo === null
          ? null
          : undefined,
  };
}

export function mergeOnboardingMemory(
  current: StoreOnboardingMemory | undefined,
  patch: Partial<StoreOnboardingMemory>,
): StoreOnboardingMemory {
  return {
    ...current,
    ...patch,
    version: 1,
    customerProfile: {
      ...(current?.customerProfile ?? {}),
      ...(patch.customerProfile ?? {}),
    },
    palette: patch.palette !== undefined ? patch.palette : current?.palette,
    logo: patch.logo !== undefined ? patch.logo : current?.logo,
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
  };
}
