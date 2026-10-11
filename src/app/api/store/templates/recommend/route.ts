import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { aiConfigured } from "@/lib/ai/client";
import { aiText } from "@/lib/ai/text";
import { parseBrandSettings } from "@/lib/workspace";
import { THEME_LIBRARY, isLibraryTheme, pickThemeByRules, themeLibraryEntry } from "@/lib/store-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Let Rex pick one": Rex reads what the store sells and picks one of the library's themes. Without an AI key (or
// when the model answers with something unusable) the pick comes from simple category rules, and says so.

function readJson(text: string): { themeId?: unknown; reason?: unknown } | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as { themeId?: unknown; reason?: unknown };
  } catch {
    return null;
  }
}

export const POST = withSeller(async (_req: NextRequest, { user }) => {
  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: {
      name: true,
      description: true,
      brandSettings: true,
      storeProducts: {
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { name: true, category: { select: { name: true } } },
      },
    },
  });
  if (!store) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Store not found" } }, { status: 404 });
  }

  const settings = parseBrandSettings(store.brandSettings);
  const memory = settings.onboardingMemory;
  const storeCategory = [memory?.category, memory?.businessDescription, store.description].filter(Boolean).join(". ");
  const productNames = store.storeProducts.map((product) => product.name);
  const productCategories = store.storeProducts.map((product) => product.category?.name).filter((name): name is string => Boolean(name));
  const currentThemeId = settings.template?.templateId ?? null;
  const rules = pickThemeByRules({ storeCategory, productNames, productCategories, currentThemeId });

  if (aiConfigured()) {
    const themes = THEME_LIBRARY.map((theme) => `- ${theme.id}: ${theme.name}, ${theme.meaning} (${theme.categoryLabel}; for ${theme.industries.join(", ")}). ${theme.blurb}`).join("\n");
    const result = await aiText({
      fast: true,
      maxTokens: 2000,
      system: "You are Rex, the store designer at Shopinbos. Pick the one storefront theme that best suits the seller's shop. Reply with JSON only: {\"themeId\": string, \"reason\": string}. themeId is the id before the colon. The reason is one short, plain sentence to the seller (no emojis, under 25 words); call the theme by its name exactly as written.",
      prompt: [
        `Store: ${store.name}`,
        storeCategory ? `What they sell: ${storeCategory}` : "What they sell: not stated",
        productNames.length ? `Products: ${productNames.slice(0, 20).join("; ")}` : "Products: none added yet",
        productCategories.length ? `Product categories: ${[...new Set(productCategories)].join(", ")}` : "",
        currentThemeId ? `Current theme: ${currentThemeId}` : "",
        `Themes:\n${themes}`,
      ].filter(Boolean).join("\n"),
    }).catch(() => null);
    const parsed = result ? readJson(result.text) : null;
    if (parsed && typeof parsed.themeId === "string" && isLibraryTheme(parsed.themeId)) {
      const reason = typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason.trim().slice(0, 240) : `${themeLibraryEntry(parsed.themeId)!.name} suits what you sell.`;
      return NextResponse.json({ data: { themeId: parsed.themeId, reason, source: "rex" } });
    }
  }

  return NextResponse.json({
    data: {
      themeId: rules.themeId,
      reason: rules.reason,
      source: "rules",
      note: aiConfigured() ? "Rex couldn't answer just now, so this pick comes from your store's category." : "Rex isn't connected yet, so this pick comes from your store's category.",
    },
  });
});
