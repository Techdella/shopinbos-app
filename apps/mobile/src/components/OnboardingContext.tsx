import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BRAND_LOOKS, BRAND_PALETTES, ONBOARDING_LANGUAGES, shopSlug, type BrandLook, type BrandPalette, type OnboardingLanguage } from "@shared/onboarding";
import { localeFromName } from "@shared/i18n";
import { useLocale } from "@/lib/i18n";
import { tNow } from "@/lib/app-locale";
import { buildStore, fetchStatus, type OnboardingStatus } from "@/lib/onboarding";

interface OnboardingState {
  status: OnboardingStatus | null;
  setStatus: (status: OnboardingStatus) => void;
  refresh: () => Promise<OnboardingStatus | null>;
  error: string | null;
  lang: OnboardingLanguage;
  setLang: (lang: OnboardingLanguage) => void;
  description: string;
  setDescription: (value: string) => void;
  palette: BrandPalette;
  setPalette: (palette: BrandPalette) => void;
  look: BrandLook;
  setLook: (look: BrandLook) => void;
  /** Starts (or restarts) Rex's store build; later steps wait for it before going live. */
  startBuild: (storeName: string, tweak?: string) => Promise<unknown>;
  waitForBuild: () => Promise<unknown>;
}

const Context = createContext<OnboardingState | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Rex chats in the app language to start with (the first step's chips change both).
  const appLocale = useLocale();
  const [lang, setLang] = useState<OnboardingLanguage>(() => ONBOARDING_LANGUAGES.find((item) => localeFromName(item) === appLocale) ?? "English");
  const [description, setDescription] = useState("");
  const [palette, setPalette] = useState<BrandPalette>(BRAND_PALETTES[0]);
  const [look, setLook] = useState<BrandLook>(BRAND_LOOKS[0]);
  const build = useRef<Promise<unknown> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchStatus();
      setStatus(next);
      setError(null);
      return next;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : tNow("m_onboarding")("loadFailed"));
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh().then((next) => {
      const memory = next?.memory;
      if (!memory) return;
      if (memory.businessDescription) setDescription(memory.businessDescription);
      const savedPalette = BRAND_PALETTES.find((item) => item.key === memory.palette?.id);
      if (savedPalette) setPalette(savedPalette);
      const savedLook = BRAND_LOOKS.find((item) => item.templateId === memory.templateId);
      if (savedLook) setLook(savedLook);
    });
  }, [refresh]);

  const value = useMemo<OnboardingState>(
    () => ({
      status,
      setStatus,
      refresh,
      error,
      lang,
      setLang,
      description,
      setDescription,
      palette,
      setPalette,
      look,
      setLook,
      startBuild: (storeName, tweak) => {
        build.current = buildStore({ storeName, slug: shopSlug(storeName), description, category: status?.memory?.category, palette, look, tweak }).catch(() => null);
        return build.current;
      },
      waitForBuild: () => build.current ?? Promise.resolve(null),
    }),
    [status, refresh, error, lang, description, palette, look],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useOnboarding() {
  const value = useContext(Context);
  if (!value) throw new Error("useOnboarding must be used inside OnboardingProvider");
  return value;
}
