import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { publishedHelpVideos } from "@/lib/help-videos.server";
import { isLocale, negotiateLocale, type Locale } from "@shared/i18n";
import { tFor } from "@shared/i18n/catalog";
import { pickHelpVideo, type HelpVideoRole } from "@shared/help-videos";
import { parsePreferences, withShopinbos, type AppPreferences } from "@shared/preferences";
import { SHOPINBOS_AUTHOR_ID, SHOPINBOS_NAME, shopinbosMessageKeys, shopinbosPostId, shopinbosPosts } from "@shared/shopinbos-status";
import { isStatusRole, STATUS_TTL_MS, type StatusRole } from "@shared/status";
import type { StatusAuthorView, StatusPostView } from "./status.server";

// Shopinbos's own Status posts for new users (shared/shopinbos-status.ts): built per request in the viewer's
// language, never stored as posts. Seen, "Don't show again" and the Home card's X live in User.preferences.

export interface ShopinbosAuthorView extends StatusAuthorView {
  /** Additive: Shopinbos's own author (the brand logo, "Shopinbos" instead of a role, no likes). */
  official: true;
  roleLabel: string;
}

export interface ShopinbosState {
  author: ShopinbosAuthorView | null;
  /** "Don't show again" was chosen: no Shopinbos ring in the Status row. */
  statusOff: boolean;
  /** The Getting started card on Home was closed for good. */
  startOff: boolean;
}

/** The viewer's language: ?lang=, else the language saved on the account, else Accept-Language, else English. */
export function viewerLocale(lang: string | null | undefined, prefs: AppPreferences, acceptLanguage: string | null | undefined): Locale {
  if (isLocale(lang)) return lang;
  if (prefs.language) return prefs.language;
  return negotiateLocale(acceptLanguage);
}

export async function readPreferences(userId: string) {
  const row = await db.user.findUnique({ where: { id: userId }, select: { preferences: true, createdAt: true } });
  return { prefs: parsePreferences(row?.preferences), joinedAt: row?.createdAt ?? new Date() };
}

/** All of the role's Shopinbos posts with each one's seen flag (the Status row, the Home card and Help use them). */
export async function shopinbosAuthor(role: StatusRole, prefs: AppPreferences, locale: Locale, joinedAt: Date, now = new Date()): Promise<ShopinbosAuthorView | null> {
  const defs = shopinbosPosts(role);
  if (!defs.length) return null;
  const t = tFor(locale, "m_familiar");
  // A recorded help video plays instead of the animated intro when one is published for the topic.
  const videos = defs.some((def) => def.helpTopic) ? await publishedHelpVideos(role as HelpVideoRole) : [];
  const seen = new Set(prefs.shopinbosSeen ?? []);
  // "Posted" when they joined (at most a day ago, so the time reads sensibly), live for the next day.
  const createdAt = new Date(Math.max(joinedAt.getTime(), now.getTime() - STATUS_TTL_MS + 60_000)).toISOString();
  const expiresAt = new Date(now.getTime() + STATUS_TTL_MS).toISOString();

  const posts = defs.map((def): StatusPostView => {
    const id = shopinbosPostId(role, def.key);
    const keys = shopinbosMessageKeys(role, def.key);
    const help = def.helpTopic ? pickHelpVideo(videos, def.helpTopic, locale, role as HelpVideoRole) : null;
    const video = def.intro || help
      ? {
          intro: def.intro ?? null,
          url: help?.source.kind === "file" ? help.source.url : null,
          watchUrl: help && help.source.kind !== "file" ? help.source.watchUrl : null,
          posterUrl: help?.posterUrl ?? null,
          durationSeconds: help?.durationSeconds ?? (def.intro ? 60 : null),
        }
      : null;
    const cta = def.cta
      ? {
          kind: def.cta.kind,
          label: t.dynamic(keys.cta, ""),
          target: { userId: SHOPINBOS_AUTHOR_ID, slug: null, partnerId: null, productId: null, path: def.cta.kind === "open" ? def.cta.path : null },
        }
      : null;
    return {
      id,
      headline: t.dynamic(keys.title, ""),
      caption: t.dynamic(keys.body, "") || null,
      imageUrl: null,
      tone: def.tone,
      product: null,
      cta,
      video,
      seen: seen.has(id),
      createdAt,
      expiresAt,
      views: 0,
      likes: 0,
      liked: false,
    };
  });

  return {
    userId: SHOPINBOS_AUTHOR_ID,
    name: SHOPINBOS_NAME,
    role,
    logoUrl: null,
    official: true,
    roleLabel: t("role.shopinbos"),
    seen: posts.every((post) => post.seen),
    posts,
  };
}

/** GET /api/mobile/status/shopinbos: every post (also after "Don't show again", for Help), and what's switched off. */
export async function shopinbosState(viewer: { id: string; role: string }, options: { lang?: string | null; acceptLanguage?: string | null } = {}): Promise<ShopinbosState> {
  const { prefs, joinedAt } = await readPreferences(viewer.id);
  const author = isStatusRole(viewer.role) ? await shopinbosAuthor(viewer.role, prefs, viewerLocale(options.lang, prefs, options.acceptLanguage), joinedAt) : null;
  return { author, statusOff: Boolean(prefs.shopinbosStatusOff), startOff: Boolean(prefs.gettingStartedOff) };
}

/** Shopinbos's ring for the Status row, or null once they chose "Don't show again". Never fails the feed. */
export async function shopinbosFeedAuthor(viewer: { id: string; role: string }, options: { lang?: string | null; acceptLanguage?: string | null } = {}) {
  try {
    const state = await shopinbosState(viewer, options);
    return state.statusOff ? null : state.author;
  } catch (error) {
    console.error("[status] Shopinbos posts failed", error);
    return null;
  }
}

/** Marks posts seen and/or switches something off for good, in User.preferences. */
export async function updateShopinbos(userId: string, change: { seen?: string[]; off?: "status" | "start" }) {
  const { prefs } = await readPreferences(userId);
  const next = withShopinbos(prefs, change);
  await db.user.update({ where: { id: userId }, data: { preferences: next as unknown as Prisma.InputJsonValue } });
  return { statusOff: Boolean(next.shopinbosStatusOff), startOff: Boolean(next.gettingStartedOff) };
}
