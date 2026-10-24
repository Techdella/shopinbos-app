import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isBoutiqueTheme } from "@/lib/store-templates/boutique-themes";
import { themeLibraryEntry } from "@/lib/store-templates/theme-library";
import { ThemeDemo } from "./ThemeDemo";

// /theme-demo/<id>: a theme's live demo with its sample store, for the phone app's Shop looks preview ("See it live"
// opens it in the in-app browser). Public and sample data only; nothing about any real store.

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const theme = themeLibraryEntry(id);
  return { title: theme ? { absolute: theme.name } : "Theme", robots: "noindex, nofollow" as const };
}

export default async function ThemeDemoPage({ params }: Props) {
  const { id } = await params;
  if (!isBoutiqueTheme(id) || !themeLibraryEntry(id)) notFound();
  return <ThemeDemo themeId={id} />;
}
