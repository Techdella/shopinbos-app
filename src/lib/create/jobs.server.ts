import "server-only";

import type { CreateJob as CreateJobRow, Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { appBase } from "@/lib/email/compliance.server";
import { aiText } from "@/lib/ai/text";
import { loadBrandContext } from "@/lib/ai/brand-context.server";
import { parsePricingTiers } from "@/lib/marketplace/find";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { canonicalState, readRateRows } from "@shared/delivery-market";
import { naira } from "@shared/onboarding";
import {
  CREATE_FORMATS,
  captionsFor,
  createRoleOf,
  designId,
  designPalette,
  designSpecs,
  flyerPrompt,
  ideaFromPrompt,
  selectIdeas,
  type CreateFormat,
  type CreateIdea,
  type CreateRole,
  type IdeaFacts,
} from "@shared/create-with-rex";
import { loadPhoto, renderDesign, storeDesign } from "./render.server";
import { generateImage, loadReferences } from "@/lib/ai/images";

// Create with Rex for every role (src/app/api/mobile/create/**): the person's facts → ideas, and a job → 3 templated
// designs (src/lib/create/render.server.tsx) with a caption each, saved as a CreateJob. Runs synchronously (a few
// seconds); the job shape still has a status so the app can poll GET /api/mobile/create/[id].

export interface CreateDesign {
  id: string;
  imageUrl: string;
  caption: string;
}

export interface CreateJobView {
  id: string;
  status: "making" | "done" | "failed";
  format: CreateFormat;
  designs: CreateDesign[];
  error: string | null;
}

export function jobView(row: Pick<CreateJobRow, "id" | "status" | "format" | "designs" | "error">): CreateJobView {
  const designs = Array.isArray(row.designs)
    ? (row.designs as unknown[]).filter((item): item is CreateDesign => Boolean(item && typeof item === "object" && typeof (item as CreateDesign).imageUrl === "string"))
    : [];
  return {
    id: row.id,
    status: row.status === "done" || row.status === "failed" ? row.status : "making",
    format: (row.format in CREATE_FORMATS ? row.format : "status") as CreateFormat,
    designs: designs.map((design) => ({ id: design.id, imageUrl: design.imageUrl, caption: design.caption ?? "" })),
    error: row.error ?? null,
  };
}

interface Who {
  id: string;
  role: string;
  name: string;
}

export interface CreateContext {
  role: CreateRole;
  name: string;
  link: string | null;
  palette: ReturnType<typeof designPalette>;
  facts: IdeaFacts;
}

const firstImage = (images: string[] | null | undefined) => images?.find((image) => typeof image === "string" && image.trim()) ?? null;

/** What the ideas and designs are built from: name, link, colours and the newest product, deal or route. */
export async function loadCreateContext(user: Who): Promise<CreateContext> {
  const role = createRoleOf(user.role);

  if (role === "supplier") {
    const supplier = await db.supplier.findUnique({ where: { userId: user.id }, select: { id: true, slug: true, displayName: true, businessName: true, logoUrl: true, bannerUrl: true } });
    const products = supplier
      ? await db.supplierProduct.findMany({
          where: { supplierId: supplier.id, status: "published" },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: { id: true, name: true, wholesalePrice: true, pricingTiers: true, images: true },
        }).catch(() => [])
      : [];
    const newest = products[0];
    const bulkProduct = products.find((product) => parsePricingTiers(product.pricingTiers).length > 0);
    const tier = bulkProduct ? parsePricingTiers(bulkProduct.pricingTiers).at(-1)! : null;
    const name = supplier?.displayName || supplier?.businessName || user.name;
    return {
      role,
      name,
      link: supplier ? `${appBase()}/suppliers/${supplier.slug}` : null,
      palette: designPalette(null),
      facts: {
        name,
        link: "Shopinbos",
        logoUrl: supplier?.logoUrl ?? null,
        bannerUrl: supplier?.bannerUrl ?? null,
        newest: newest ? { id: newest.id, name: newest.name, price: naira(newest.wholesalePrice), image: firstImage(newest.images) } : null,
        bulk: bulkProduct && tier ? { id: bulkProduct.id, name: bulkProduct.name, unitPrice: naira(tier.price), minQty: tier.minQty, image: firstImage(bulkProduct.images) } : null,
      },
    };
  }

  if (role === "logistics_partner") {
    const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id }, select: { id: true, displayName: true, companyName: true, logoUrl: true, bannerUrl: true } });
    const [cards, point] = partner
      ? await Promise.all([
          db.logisticsRateCard.findMany({ where: { logisticsPartnerId: partner.id, ownerUserId: null, status: { in: ["active", "retired"] } }, orderBy: { createdAt: "desc" }, take: 2, select: { status: true, rows: true } }).catch(() => []),
          db.logisticsPickupPoint.findFirst({ where: { logisticsPartnerId: partner.id, active: true }, orderBy: { createdAt: "desc" }, select: { name: true, address: true, hours: true } }).catch(() => null),
        ])
      : [[], null];
    const active = cards.find((card) => card.status === "active");
    const before = cards.find((card) => card.status === "retired");
    const rows = active ? readRateRows(active.rows) : [];
    const known = new Set(before ? readRateRows(before.rows).map((row) => row.to) : []);
    // A destination that wasn't on the previous card is the new route; else the card's last row.
    const route = rows.find((row) => !known.has(row.to) && before) ?? rows.at(-1) ?? null;
    const name = partner?.displayName || partner?.companyName || user.name;
    return {
      role,
      name,
      link: null,
      palette: designPalette(null),
      facts: {
        name,
        logoUrl: partner?.logoUrl ?? null,
        bannerUrl: partner?.bannerUrl ?? null,
        newRoute: route ? { to: route.to.replace(/^[^:]+:\s*/, ""), price: naira(route.price) } : null,
        pickupPoint: point ? { name: point.name, address: point.address, hours: point.hours } : null,
      },
    };
  }

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, customDomain: true, logoUrl: true } });
  if (!store) return { role, name: user.name, link: null, palette: designPalette(null), facts: { name: user.name } };
  const [brand, newest, deal, best, delivered] = await Promise.all([
    loadBrandContext(store.id).catch(() => null),
    db.storeProduct.findFirst({ where: { storeId: store.id, status: "published" }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, retailPrice: true, images: true } }).catch(() => null),
    db.storeProduct.findFirst({ where: { storeId: store.id, status: "published", compareAtPrice: { not: null } }, orderBy: { updatedAt: "desc" }, select: { id: true, name: true, retailPrice: true, compareAtPrice: true, images: true } }).catch(() => null),
    db.storeProduct.findFirst({ where: { storeId: store.id, status: "published", soldStock: { gt: 0 } }, orderBy: { soldStock: "desc" }, select: { id: true, name: true, retailPrice: true, images: true } }).catch(() => null),
    db.retailOrder.findFirst({ where: { storeId: store.id, status: "delivered" }, orderBy: { updatedAt: "desc" }, select: { deliveryAddress: true } }).catch(() => null),
  ]);
  const link = buildStorefrontUrl(store, "/");
  const onSale = deal && deal.compareAtPrice && deal.compareAtPrice > deal.retailPrice ? deal : null;
  const pick = onSale ?? (best && best.id !== newest?.id ? best : null);
  const address = (delivered?.deliveryAddress ?? null) as { state?: string; city?: string } | null;
  return {
    role,
    name: store.name,
    link: link.replace(/^https?:\/\//, "").replace(/\/$/, ""),
    palette: designPalette(brand?.colours ?? null),
    facts: {
      name: store.name,
      link: link.replace(/^https?:\/\//, "").replace(/\/$/, ""),
      logoUrl: brand?.logoUrl ?? store.logoUrl ?? null,
      newest: newest ? { id: newest.id, name: newest.name, price: naira(newest.retailPrice), image: firstImage(newest.images) } : null,
      deal: pick ? { id: pick.id, name: pick.name, price: naira(pick.retailPrice), image: firstImage(pick.images), wasPrice: onSale?.compareAtPrice ? naira(onSale.compareAtPrice) : null } : null,
      deliveredTo: address ? canonicalState(address.state) ?? canonicalState(address.city) ?? null : null,
    },
  };
}

/** One of the person's own products as an idea (when the app sends productId). Null when it isn't theirs. */
async function productIdea(user: Who, context: CreateContext, productId: string, format: CreateFormat): Promise<CreateIdea | null> {
  let product: { id: string; name: string; price: number; images: string[] } | null = null;
  if (context.role === "seller") {
    const row = await db.storeProduct.findFirst({ where: { id: productId, userId: user.id }, select: { id: true, name: true, retailPrice: true, images: true } }).catch(() => null);
    product = row ? { id: row.id, name: row.name, price: row.retailPrice, images: row.images } : null;
  } else if (context.role === "supplier") {
    const row = await db.supplierProduct.findFirst({ where: { id: productId, supplier: { userId: user.id } }, select: { id: true, name: true, wholesalePrice: true, images: true } }).catch(() => null);
    product = row ? { id: row.id, name: row.name, price: row.wholesalePrice, images: row.images } : null;
  }
  if (!product) return null;
  const price = naira(product.price);
  return {
    id: `product:${product.id}`,
    title: product.name,
    line: `${CREATE_FORMATS[format].label} · ${product.name}`,
    format,
    headline: product.name.length > 34 ? `${product.name.slice(0, 32).replace(/\s+\S*$/, "")}…` : product.name,
    subline: context.role === "supplier" ? `${price} to shops` : price,
    caption: context.role === "supplier"
      ? `${product.name}, ${price} to shops. Sell it without stock: find ${context.name} on Shopinbos.`
      : `${product.name}, ${price}. Order: ${context.facts.link ?? context.name}`,
    imageUrl: firstImage(product.images),
    productId: product.id,
  };
}

export class CreateInputError extends Error {}

/** The idea a request asks for: its idea, or a product, or a free-text prompt (on top of the first idea's photo). */
export async function resolveIdea(user: Who, context: CreateContext, input: { format: CreateFormat; ideaId?: string; prompt?: string; productId?: string }): Promise<CreateIdea> {
  const ideas = selectIdeas(context.role, context.facts);
  let idea: CreateIdea | null = null;
  if (input.productId) {
    idea = await productIdea(user, context, input.productId, input.format);
    if (!idea) throw new CreateInputError("That product isn't one of yours.");
  } else if (input.ideaId) {
    idea = ideas.find((item) => item.id === input.ideaId) ?? null;
    if (!idea) throw new CreateInputError("That idea isn't available any more. Pick another one.");
  }
  const base = idea ?? ideas.find((item) => item.format === input.format) ?? ideas[0] ?? null;
  if (input.prompt?.trim()) return ideaFromPrompt(input.prompt, input.format, base);
  if (!base) throw new CreateInputError("Tell Rex what to make.");
  return { ...base, format: input.format };
}

const ROLE_WORDS: Record<CreateRole, string> = {
  seller: "a small online shop",
  supplier: "a supplier that sells wholesale to shops and ships for them (dropship)",
  logistics_partner: "a delivery company that delivers for online shops",
};

const FORMAT_WORDS: Record<CreateFormat, string> = {
  status: "a WhatsApp Status (1 to 3 short lines, at most one emoji)",
  reel: "an Instagram or TikTok reel (a short hook line, then 2 to 4 hashtags)",
  post: "an Instagram or Facebook post (2 to 3 short sentences)",
  flyer: "a flyer shared on WhatsApp (2 short sentences and how to order or connect)",
};

async function writeCaptions(context: CreateContext, idea: CreateIdea, prompt?: string) {
  const result = await aiText({
    fast: true,
    maxTokens: 1500,
    system: `You write social posts for ${context.name}, ${ROLE_WORDS[context.role]} in Nigeria. Warm, confident Nigerian English. Never invent prices, discounts, sizes, places or delivery times that aren't in the facts. Never say the post was or will be posted for them.`,
    prompt: [
      `Write 3 different captions for ${FORMAT_WORDS[idea.format]}, one per line, no numbering, each under 280 characters.`,
      `Idea: ${idea.title}`,
      `On the picture: ${idea.headline}${idea.subline ? ` / ${idea.subline}` : ""}`,
      `Starting caption: ${idea.caption}`,
      prompt ? `What they asked for: ${prompt.slice(0, 300)}` : null,
      context.facts.link ? `Where to order or find them: ${context.facts.link}` : null,
      "Return only the 3 lines.",
    ].filter(Boolean).join("\n"),
  }).catch(() => null);
  return captionsFor(result?.text, idea.caption);
}

/** Makes the 3 designs and captions for a job row and marks it done (or failed). Never throws. */
export async function runCreateJob(jobId: string, user: Who, context: CreateContext, idea: CreateIdea, prompt?: string): Promise<CreateJobView> {
  try {
    const photo = await loadPhoto(idea.imageUrl ?? context.facts.logoUrl ?? null);
    const specs = designSpecs(idea.format, Boolean(photo));
    const content = { headline: idea.headline, subline: idea.subline, brand: context.name, link: context.link ? context.link.replace(/^https?:\/\//, "") : null, palette: context.palette };
    // Flyers are drawn by OpenAI's image model for a premium finish (with the product photo and logo as
    // references); any one that can't be made falls back to the template, so the seller always gets three.
    const premium = idea.format === "flyer" && aiImagesConfigured() ? await flyerReferences(idea.imageUrl ?? null, context.facts.logoUrl ?? null) : null;
    const templated = async (spec: (typeof specs)[number]) => {
      const rendered = await renderDesign(spec, content, photo);
      return storeDesign({ userId: user.id, jobId, n: spec.n, bytes: rendered.bytes, type: rendered.type, width: spec.width, height: spec.height, name: `${idea.title} (${CREATE_FORMATS[idea.format].label} ${spec.n})` });
    };
    const [captions, urls] = await Promise.all([
      writeCaptions(context, idea, prompt),
      Promise.all(
        specs.map(async (spec, index) => {
          if (!premium) return templated(spec);
          try {
            return await generateImage({
              prompt: flyerPrompt({ ...content, hasPhoto: premium.hasPhoto, hasLogo: premium.hasLogo }, index),
              size: "1024x1536",
              quality: "high",
              references: premium.references,
              path: `generated/${user.id}/flyer-${jobId}-${spec.n}`,
            });
          } catch (error) {
            console.error("[create] premium flyer failed; using the template", jobId, spec.n, error);
            return templated(spec);
          }
        }),
      ),
    ]);
    const designs: CreateDesign[] = urls.map((imageUrl, index) => ({ id: designId(jobId, index + 1), imageUrl, caption: captions[index] }));
    const row = await db.createJob.update({ where: { id: jobId }, data: { status: "done", designs: designs as unknown as Prisma.InputJsonValue, error: null } });
    return jobView(row);
  } catch (error) {
    console.error("[create] job failed", jobId, error);
    const row = await db.createJob
      .update({ where: { id: jobId }, data: { status: "failed", error: "Rex couldn't make the designs just now. Try again in a moment." } })
      .catch(() => null);
    return row ? jobView(row) : { id: jobId, status: "failed", format: idea.format, designs: [], error: "Rex couldn't make the designs just now. Try again in a moment." };
  }
}

/** OpenAI pictures are switched on (an API key). */
function aiImagesConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/** The product photo (first) and the logo, as image-model references (only our own PNG/JPEG/WebP files count). */
async function flyerReferences(photoUrl: string | null, logoUrl: string | null) {
  const references = await loadReferences([photoUrl ?? "", logoUrl ?? ""].filter(Boolean)).catch(() => []);
  return {
    references,
    hasPhoto: Boolean(photoUrl && references.some((ref) => ref.url === photoUrl)),
    hasLogo: Boolean(logoUrl && references.some((ref) => ref.url === logoUrl)),
  };
}
