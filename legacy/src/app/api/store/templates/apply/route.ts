import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import {
  applyTemplateToDraft,
  createSnapshotFromTemplate,
  getTemplateManifest,
  type StoreEditorSnapshot,
  type StoreBrandSettingsLike,
} from "@/lib/store-templates";
import { seedDefaultAbandonedCartAutomation } from "@/lib/automations/defaults";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefinedDeep(entry)]),
    ) as T;
  }
  return value;
}

function formatMoney(currency: string | null | undefined, amount: number | null | undefined) {
  const value = Number(amount ?? 0);
  const code = currency || "NGN";
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${code} ${value.toLocaleString()}`;
  }
}

function hydrateDraftWithStoreData(
  draft: StoreEditorSnapshot,
  store: {
    name: string;
    logoUrl?: string | null;
    currency?: string | null;
    storeProducts: Array<{
      id: string;
      name: string;
      description?: string | null;
      images: string[];
      retailPrice: number | null;
      currency: string | null;
    }>;
  },
) {
  const products = store.storeProducts.slice(0, 8);
  if (products.length === 0 && !store.logoUrl) return draft;

  return {
    ...draft,
    pages: draft.pages.map((page) => ({
      ...page,
      sections: page.sections.map((section) => {
        if (section.kind === "header") {
          return {
            ...section,
            settings: {
              ...section.settings,
              editableLogo: true,
              logoUrl: store.logoUrl ?? null,
              syncedStoreName: store.name,
            },
          };
        }

        if ((section.kind === "featured-products" || section.kind === "cart-summary" || section.kind === "wishlist-grid") && products.length > 0) {
          const styleItems = section.items && section.items.length > 0 ? section.items : [];
          return {
            ...section,
            settings: {
              ...section.settings,
              allowMapping: true,
              dataSource: "storeProducts",
            },
            items: products.slice(0, Math.max(styleItems.length, 3)).map((product, index) => {
              const style = styleItems[index % Math.max(styleItems.length, 1)] ?? {};
              return {
                ...style,
                id: product.id,
                title: product.name,
                subtitle: product.description?.slice(0, 90) || String(style.subtitle ?? "Store product"),
                priceLabel: formatMoney(product.currency ?? store.currency, product.retailPrice),
                imageUrl: product.images[0] ?? style.imageUrl,
                mappedStoreProductId: product.id,
              };
            }),
          };
        }

        return section;
      }),
    })),
    updatedAt: new Date().toISOString(),
  };
}

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => null)) as { templateId?: string } | null;
  const templateId = body?.templateId?.trim();

  if (!templateId) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "templateId is required" } }, { status: 400 });
  }

  const manifest = getTemplateManifest(templateId);
  if (!manifest) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Template not found" } }, { status: 404 });
  }

  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      currency: true,
      brandSettings: true,
      storeProducts: {
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          name: true,
          description: true,
          images: true,
          retailPrice: true,
          currency: true,
        },
      },
    },
  });

  if (!store) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Store not found" } }, { status: 404 });
  }

  const draft = hydrateDraftWithStoreData(createSnapshotFromTemplate(manifest), store);
  const currentSettings = ((store.brandSettings as Record<string, unknown>) ?? {}) as StoreBrandSettingsLike;

  const nextSettings = applyTemplateToDraft(currentSettings, manifest, draft);
  const cleanSettings = stripUndefinedDeep(nextSettings);

  const updated = await db.store.update({
    where: { id: store.id },
    data: {
      brandSettings: cleanSettings as unknown as Prisma.InputJsonValue,
    },
    select: {
      id: true,
      brandSettings: true,
    },
  });

  await seedDefaultAbandonedCartAutomation({ id: store.id, name: store.name });

  return NextResponse.json({
    data: {
      template: cleanSettings.template,
      draft,
      published: null,
      storeId: updated.id,
    },
  });
});
