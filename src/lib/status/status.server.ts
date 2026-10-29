import "server-only";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db/client";
import { removeFileByPublicUrl } from "@/lib/supabase/storage.server";
import {
  CTA_LABELS,
  audienceRoles,
  audienceTier,
  canSee,
  isLive,
  isStatusRole,
  rankFeed,
  sharesState,
  statesOf,
  type StatusCtaKind,
  type StatusRole,
  type StatusTone,
} from "@shared/status";
import type { ShopinbosCta } from "@shared/shopinbos-status";

// Status (24-hour stories) for the phone app: who's in a viewer's feed, and each post in the shape of the API
// contract (StatusPost). Rules are in shared/status.ts; routes in src/app/api/mobile/status.

export interface StatusViewer {
  id: string;
  role: Role;
}

export interface StatusPostView {
  id: string;
  headline: string;
  caption: string | null;
  imageUrl: string | null;
  tone: StatusTone;
  product: { id: string; name: string; price: number; image: string | null } | null;
  /**
   * `target` is an addition to the contract: the ids the phone needs to act on the button. userId is the author;
   * slug is their shop / supplier / partner page slug; partnerId the LogisticsPartner id (connect, see_rates);
   * productId the product (add_product: a SupplierProduct, for the dropship agreement).
   */
  cta: {
    /** "open" (an app path, target.path) and "share" (the seller's shop link) only on Shopinbos's own posts. */
    kind: StatusCtaKind | ShopinbosCta["kind"];
    label: string;
    target: { userId: string; slug: string | null; partnerId: string | null; productId: string | null; path?: string | null };
  } | null;
  /**
   * Additive: a video post plays `url` (an MP4) in the viewer, muted until tapped, for as long as it runs. A person's
   * own video status (shared/status-video.ts) has url, posterUrl and durationSeconds; Shopinbos's own posts
   * (src/lib/status/shopinbos.server.ts) may instead have the 60-second feature intro `intro`, or `watchUrl`.
   */
  video?: { intro: string | null; url: string | null; watchUrl: string | null; posterUrl: string | null; durationSeconds: number | null } | null;
  /** Additive, Shopinbos's own posts only: this viewer has seen it. */
  seen?: boolean;
  createdAt: string;
  expiresAt: string;
  views: number;
  likes: number;
  liked: boolean;
}

export interface StatusAuthorView {
  userId: string;
  name: string;
  role: StatusRole;
  logoUrl: string | null;
  seen: boolean;
  posts: StatusPostView[];
}

const POST_SELECT = {
  id: true, authorId: true, role: true, headline: true, caption: true, imageUrl: true, videoUrl: true, posterUrl: true, durationMs: true,
  tone: true, productId: true, ctaKind: true, expiresAt: true, createdAt: true,
} as const;

export type PostRow = {
  id: string; authorId: string; role: Role; headline: string; caption: string | null; imageUrl: string | null;
  videoUrl: string | null; posterUrl: string | null; durationMs: number | null;
  tone: string; productId: string | null; ctaKind: string | null; expiresAt: Date; createdAt: Date;
};

export { POST_SELECT };

/** A person's video status in the contract's `video` shape (null for a photo or text post). */
export function rowVideo(row: Pick<PostRow, "videoUrl" | "posterUrl" | "durationMs">): StatusPostView["video"] {
  if (!row.videoUrl) return null;
  return { intro: null, url: row.videoUrl, watchUrl: null, posterUrl: row.posterUrl, durationSeconds: row.durationMs ? Math.round(row.durationMs / 100) / 10 : null };
}

/** Live posts an author shows at most (oldest first, the story order). */
const POSTS_PER_AUTHOR = 10;
/** Live posts read when building a feed (newest first). */
const FEED_SCAN = 600;

export interface AuthorProfile {
  userId: string;
  role: Role;
  name: string;
  logoUrl: string | null;
  slug: string | null;
  partnerId: string | null;
  supplierId: string | null;
  storeId: string | null;
  states: Set<string>;
}

/** Name, logo, page slug and states of each user, from their shop, supplier or partner profile. */
export async function authorProfiles(userIds: string[]): Promise<Map<string, AuthorProfile>> {
  if (!userIds.length) return new Map();
  const users = await db.user.findMany({
    where: { id: { in: [...new Set(userIds)] } },
    select: {
      id: true, name: true, role: true, avatarUrl: true, city: true,
      store: { select: { id: true, name: true, logoUrl: true, slug: true, city: true } },
      supplier: { select: { id: true, displayName: true, logoUrl: true, slug: true, city: true } },
      logisticsPartner: { select: { id: true, displayName: true, logoUrl: true, slug: true, city: true, pickupAreas: true, deliveryAreas: true } },
    },
  });
  return new Map(
    users.map((user): [string, AuthorProfile] => {
      const base = { userId: user.id, role: user.role, partnerId: null, supplierId: null, storeId: null };
      if (user.role === "supplier" && user.supplier) {
        const s = user.supplier;
        return [user.id, { ...base, supplierId: s.id, name: s.displayName, logoUrl: s.logoUrl ?? user.avatarUrl, slug: s.slug, states: statesOf([s.city, user.city]) }];
      }
      if (user.role === "logistics_partner" && user.logisticsPartner) {
        const p = user.logisticsPartner;
        return [user.id, { ...base, partnerId: p.id, name: p.displayName, logoUrl: p.logoUrl ?? user.avatarUrl, slug: p.slug, states: statesOf([p.city, ...p.pickupAreas, ...p.deliveryAreas]) }];
      }
      const store = user.store;
      return [user.id, { ...base, storeId: store?.id ?? null, name: store?.name ?? user.name, logoUrl: store?.logoUrl ?? user.avatarUrl ?? null, slug: store?.slug ?? null, states: statesOf([store?.city, user.city]) }];
    }),
  );
}

/**
 * The users this viewer has a real tie with: a seller with the suppliers whose products their shop sells (dropship
 * products linked to a supplier) and their delivery partners; a supplier with the sellers selling its products and
 * its delivery partners; a partner with the shops and suppliers connected to it.
 */
export async function relatedUserIds(viewer: StatusViewer): Promise<Set<string>> {
  const ids = new Set<string>();
  if (viewer.role === "seller") {
    const [products, dropships, connections] = await Promise.all([
      db.storeProduct.findMany({ where: { userId: viewer.id, supplierProductId: { not: null } }, select: { supplierProduct: { select: { supplier: { select: { userId: true } } } } }, distinct: ["supplierProductId"], take: 500 }),
      db.dropshipRelationship.findMany({ where: { sellerId: viewer.id, status: "active" }, select: { supplier: { select: { userId: true } } }, take: 500 }),
      db.deliveryConnection.findMany({ where: { ownerUserId: viewer.id, status: "active" }, select: { logisticsPartner: { select: { userId: true } } } }),
    ]);
    for (const row of products) if (row.supplierProduct) ids.add(row.supplierProduct.supplier.userId);
    for (const row of dropships) ids.add(row.supplier.userId);
    for (const row of connections) ids.add(row.logisticsPartner.userId);
  } else if (viewer.role === "supplier") {
    const supplier = await db.supplier.findUnique({ where: { userId: viewer.id }, select: { id: true } });
    const [products, dropships, connections] = await Promise.all([
      supplier ? db.storeProduct.findMany({ where: { supplierProduct: { supplierId: supplier.id } }, select: { userId: true }, distinct: ["userId"], take: 1000 }) : [],
      supplier ? db.dropshipRelationship.findMany({ where: { supplierId: supplier.id, status: "active" }, select: { sellerId: true }, distinct: ["sellerId"], take: 1000 }) : [],
      db.deliveryConnection.findMany({ where: { ownerUserId: viewer.id, status: "active" }, select: { logisticsPartner: { select: { userId: true } } } }),
    ]);
    for (const row of products) ids.add(row.userId);
    for (const row of dropships) ids.add(row.sellerId);
    for (const row of connections) ids.add(row.logisticsPartner.userId);
  } else if (viewer.role === "logistics_partner") {
    const partner = await db.logisticsPartner.findUnique({ where: { userId: viewer.id }, select: { id: true } });
    if (partner) {
      const connections = await db.deliveryConnection.findMany({ where: { logisticsPartnerId: partner.id, status: "active" }, select: { ownerUserId: true }, take: 2000 });
      for (const row of connections) ids.add(row.ownerUserId);
    }
  }
  ids.delete(viewer.id);
  return ids;
}

/** Whether this viewer may see (view, like) this author's posts. */
export async function viewerCanSee(viewer: StatusViewer, author: { id: string; role: Role }) {
  if (!audienceRoles(viewer.role).includes(author.role as StatusRole)) return false;
  const needsTie = viewer.role === "supplier" && author.role === "seller";
  return canSee({ userId: viewer.id, role: viewer.role }, { userId: author.id, role: author.role }, needsTie ? (await relatedUserIds(viewer)).has(author.id) : false);
}

/** The posts in the contract's shape, for this viewer (views, likes, liked, product, button). */
export async function postViews(rows: PostRow[], viewerId: string, profiles: Map<string, AuthorProfile>): Promise<StatusPostView[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const supplierProductIds = rows.filter((row) => row.productId && row.role === "supplier").map((row) => row.productId!);
  const storeProductIds = rows.filter((row) => row.productId && row.role === "seller").map((row) => row.productId!);
  const [views, likes, mine, supplierProducts, storeProducts] = await Promise.all([
    db.statusView.groupBy({ by: ["postId"], where: { postId: { in: ids } }, _count: { _all: true } }),
    db.statusLike.groupBy({ by: ["postId"], where: { postId: { in: ids } }, _count: { _all: true } }),
    db.statusLike.findMany({ where: { postId: { in: ids }, userId: viewerId }, select: { postId: true } }),
    supplierProductIds.length ? db.supplierProduct.findMany({ where: { id: { in: supplierProductIds } }, select: { id: true, supplierId: true, name: true, wholesalePrice: true, images: true } }) : [],
    storeProductIds.length ? db.storeProduct.findMany({ where: { id: { in: storeProductIds } }, select: { id: true, storeId: true, name: true, retailPrice: true, images: true } }) : [],
  ]);
  const viewCount = new Map(views.map((row) => [row.postId, row._count._all]));
  const likeCount = new Map(likes.map((row) => [row.postId, row._count._all]));
  const liked = new Set(mine.map((row) => row.postId));
  const supplierProduct = new Map(supplierProducts.map((row) => [row.id, row]));
  const storeProduct = new Map(storeProducts.map((row) => [row.id, row]));

  return rows.map((row) => {
    const profile = profiles.get(row.authorId);
    let product: StatusPostView["product"] = null;
    if (row.productId && row.role === "supplier") {
      const found = supplierProduct.get(row.productId);
      // Only the author's own product (checked when posting; kept here in case it changed hands).
      if (found && (!profile?.supplierId || found.supplierId === profile.supplierId)) product = { id: found.id, name: found.name, price: found.wholesalePrice, image: found.images[0] ?? null };
    } else if (row.productId && row.role === "seller") {
      const found = storeProduct.get(row.productId);
      if (found && (!profile?.storeId || found.storeId === profile.storeId)) product = { id: found.id, name: found.name, price: found.retailPrice, image: found.images[0] ?? null };
    }
    const kind = row.ctaKind as StatusCtaKind | null;
    // "Add to my shop" without its product has nothing to add: no button.
    const cta = kind && CTA_LABELS[kind] && !(kind === "add_product" && !product)
      ? { kind, label: CTA_LABELS[kind], target: { userId: row.authorId, slug: profile?.slug ?? null, partnerId: profile?.partnerId ?? null, productId: product?.id ?? null } }
      : null;
    return {
      id: row.id,
      headline: row.headline,
      caption: row.caption,
      imageUrl: row.imageUrl,
      tone: row.tone as StatusTone,
      product,
      cta,
      ...(row.videoUrl ? { video: rowVideo(row) } : {}),
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      views: viewCount.get(row.id) ?? 0,
      likes: likeCount.get(row.id) ?? 0,
      liked: liked.has(row.id),
    };
  });
}

/** One post as the API returns it (after it was made, for example). */
export async function postView(row: PostRow, viewerId: string) {
  const [view] = await postViews([row], viewerId, await authorProfiles([row.authorId]));
  return view;
}

/** GET /api/mobile/status: my live posts, and the authors I can see with live posts (unseen first, about 30). */
export async function statusHome(viewer: StatusViewer, now = new Date()) {
  const roles = audienceRoles(viewer.role);
  const [mineRows, feedRows] = await Promise.all([
    db.statusPost.findMany({ where: { authorId: viewer.id, expiresAt: { gt: now } }, orderBy: { createdAt: "asc" }, select: POST_SELECT, take: 50 }),
    roles.length
      ? db.statusPost.findMany({ where: { expiresAt: { gt: now }, role: { in: [...roles] }, authorId: { not: viewer.id } }, orderBy: { createdAt: "desc" }, select: POST_SELECT, take: FEED_SCAN })
      : Promise.resolve([] as PostRow[]),
  ]);

  const byAuthor = new Map<string, PostRow[]>();
  for (const row of feedRows) {
    if (!isLive(row, now) || !isStatusRole(row.role)) continue;
    const list = byAuthor.get(row.authorId) ?? [];
    list.push(row);
    byAuthor.set(row.authorId, list);
  }
  const [profiles, related, seenRows] = await Promise.all([
    authorProfiles([viewer.id, ...byAuthor.keys()]),
    byAuthor.size ? relatedUserIds(viewer) : Promise.resolve(new Set<string>()),
    feedRows.length ? db.statusView.findMany({ where: { viewerId: viewer.id, postId: { in: feedRows.map((row) => row.id) } }, select: { postId: true } }) : Promise.resolve([]),
  ]);
  const seen = new Set(seenRows.map((row) => row.postId));
  const myStates = profiles.get(viewer.id)?.states ?? new Set<string>();

  const candidates = [...byAuthor.entries()].flatMap(([authorId, rows]) => {
    // Posted under the role the author has now (a changed role hides the old posts).
    const role = rows[0]!.role;
    const profile = profiles.get(authorId);
    if (!profile || profile.role !== role) return [];
    const isRelated = related.has(authorId);
    if (!canSee({ userId: viewer.id, role: viewer.role }, { userId: authorId, role }, isRelated)) return [];
    const posts = rows.slice(0, POSTS_PER_AUTHOR).reverse();
    return [{ userId: authorId, tier: audienceTier({ related: isRelated, sameState: sharesState(myStates, profile.states) }), seen: posts.every((post) => seen.has(post.id)), latestAt: rows[0]!.createdAt, posts, profile }];
  });
  const ranked = rankFeed(candidates, viewer.id);

  const allRows = [...mineRows, ...ranked.flatMap((author) => author.posts)];
  const views = new Map((await postViews(allRows, viewer.id, profiles)).map((post) => [post.id, post]));
  const minePosts = mineRows.map((row) => views.get(row.id)!).filter(Boolean);

  return {
    mine: {
      posts: minePosts,
      // How many people saw my latest live post.
      viewsLast: minePosts.length ? minePosts[minePosts.length - 1]!.views : 0,
    },
    feed: ranked.map((author): StatusAuthorView => ({
      userId: author.userId,
      name: author.profile.name,
      role: author.profile.role as StatusRole,
      logoUrl: author.profile.logoUrl,
      seen: author.seen,
      posts: author.posts.map((row) => views.get(row.id)!).filter(Boolean),
    })),
  };
}

/** A live post by id (with its author's current role), or null. */
export async function livePost(id: string, now = new Date()) {
  const post = await db.statusPost.findUnique({ where: { id }, select: { ...POST_SELECT, author: { select: { role: true } } } });
  if (!post || !isLive(post, now) || post.author.role !== post.role) return null;
  return post;
}

/** Deletes posts that expired before `before` (default now), with their views and likes, and their photos. */
export async function purgeExpiredStatus(options: { before?: Date; limit?: number } = {}) {
  const before = options.before ?? new Date();
  const rows = await db.statusPost.findMany({ where: { expiresAt: { lte: before } }, select: { id: true, imageUrl: true, videoUrl: true, posterUrl: true }, orderBy: { expiresAt: "asc" }, take: options.limit ?? 500 });
  if (!rows.length) return { deleted: 0, images: 0 };
  // Views and likes go with the post (ON DELETE CASCADE).
  const { count } = await db.statusPost.deleteMany({ where: { id: { in: rows.map((row) => row.id) }, expiresAt: { lte: before } } });
  const images = await removeUnusedImages(rows.map((row) => row.imageUrl));
  // A video and its poster belong to one post (a fresh name per upload).
  await Promise.allSettled(rows.flatMap((row) => [row.videoUrl, row.posterUrl]).filter((url): url is string => !!url).map((url) => removeFileByPublicUrl(url)));
  return { deleted: count, images };
}

/** Removes status photos no remaining post uses (the same photo can go on two posts). Best effort. */
export async function removeUnusedImages(urls: Array<string | null | undefined>) {
  const candidates = [...new Set(urls.filter((url): url is string => !!url))];
  if (!candidates.length) return 0;
  const used = new Set((await db.statusPost.findMany({ where: { imageUrl: { in: candidates } }, select: { imageUrl: true } })).map((row) => row.imageUrl));
  const unused = candidates.filter((url) => !used.has(url));
  await Promise.allSettled(unused.map((url) => removeFileByPublicUrl(url)));
  return unused.length;
}
