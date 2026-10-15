"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { getCurrentAppUser } from "@/lib/server-auth";
import { mergeBrandSettings, parseBrandSettings, slugify } from "@/lib/workspace";
import { gaMeasurementId } from "@/lib/security/html";
import { saveSellerBusinessAddress, saveStoreDetails } from "@/lib/seller-settings.server";
import { changeStoreSlug, clearStaleShopNames, clearStaleShopNamesInStorePages } from "@/lib/store-address.server";

async function getSellerUserOrThrow() {
  const user = await getCurrentAppUser({ redirectTo: "/login" });
  if (!user || user.role !== "seller") {
    redirect("/login");
  }
  return user;
}

export async function buildStoreWithChip(formData: FormData) {
  const user = await getSellerUserOrThrow();
  const storeName = String(formData.get("storeName") || `${user.name}'s Store`).trim();
  const city = String(formData.get("city") || "Lagos").trim();
  const country = String(formData.get("country") || "Nigeria").trim();
  const slug = slugify(String(formData.get("slug") || storeName));
  const description = String(formData.get("description") || "Built with Rex on Shopinbos.").trim();

  const existing = await db.store.findUnique({ where: { userId: user.id } });
  const settings = mergeBrandSettings(existing?.brandSettings, {
    mascot: "rex",
    setup: {
      storeBuilt: true,
    },
  });

  await db.store.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      name: storeName,
      slug: slug || `${slugify(user.name)}-${user.id.slice(0, 6)}`,
      city,
      country,
      description,
      brandSettings: settings,
    },
    update: {
      name: storeName,
      slug: slug || existing?.slug || `${slugify(user.name)}-${user.id.slice(0, 6)}`,
      city,
      country,
      description,
      brandSettings: settings,
    },
  });

  redirect("/home");
}

export async function skipInitialSetup() {
  const user = await getSellerUserOrThrow();
  const existing = await db.store.findUnique({ where: { userId: user.id } });
  const fallbackName = `${user.name}'s Store`;

  await db.store.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      name: fallbackName,
      slug: `${slugify(fallbackName)}-${user.id.slice(0, 6)}`,
      city: user.city || "Lagos",
      country: user.country || "Nigeria",
      description: "Starter store created from setup skip.",
      brandSettings: mergeBrandSettings(existing?.brandSettings, {
        setup: {
          skipped: true,
          storeBuilt: true,
        },
      }),
    },
    update: {
      brandSettings: mergeBrandSettings(existing?.brandSettings, {
        setup: {
          skipped: true,
          storeBuilt: true,
        },
      }),
    },
  });

  redirect("/home");
}

export async function addMarketplaceProduct(formData: FormData) {
  const user = await getSellerUserOrThrow();
  const supplierProductId = String(formData.get("supplierProductId") || "");
  if (!supplierProductId) {
    return;
  }

  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) {
    redirect("/builder?firstRun=1");
  }

  const supplierProduct = await db.supplierProduct.findUnique({
    where: { id: supplierProductId },
    include: {
      supplier: {
        select: {
          status: true,
          verificationStatus: true,
        },
      },
    },
  });

  if (
    !supplierProduct ||
    supplierProduct.status !== "published" ||
    supplierProduct.supplier.status !== "active" ||
    supplierProduct.supplier.verificationStatus !== "verified"
  ) {
    return;
  }

  await db.storeProduct.create({
    data: {
      storeId: store.id,
      userId: user.id,
      supplierProductId: supplierProduct.id,
      name: supplierProduct.name,
      description: supplierProduct.description,
      images: supplierProduct.images,
      retailPrice: supplierProduct.suggestedRetailPrice,
      costPrice: supplierProduct.wholesalePrice,
      currency: supplierProduct.currency,
      margin: supplierProduct.suggestedRetailPrice - supplierProduct.wholesalePrice,
      fulfillmentType: supplierProduct.dropshipAvailable ? "dropship" : "merchant_fulfilled",
      status: "draft",
    },
  });

  await db.store.update({
    where: { id: store.id },
    data: {
      brandSettings: mergeBrandSettings(store.brandSettings, {
        setup: {
          productAdded: true,
        },
      }),
    },
  });

  redirect("/products");
}

export async function toggleChannelConnection(formData: FormData) {
  const user = await getSellerUserOrThrow();
  const channel = String(formData.get("channel") || "");
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) {
    redirect("/builder?firstRun=1");
  }

  const settings = parseBrandSettings(store.brandSettings);
  const connectedChannels = new Set(settings.connectedChannels ?? []);

  if (connectedChannels.has(channel as never)) {
    connectedChannels.delete(channel as never);
  } else {
    connectedChannels.add(channel as never);
  }

  await db.store.update({
    where: { id: store.id },
    data: {
      brandSettings: mergeBrandSettings(store.brandSettings, {
        connectedChannels: [...connectedChannels] as never,
        setup: {
          channelsConnected: connectedChannels.size > 0,
        },
      }),
    },
  });

  redirect("/channels");
}

export async function updateSellerProfile(formData: FormData) {
  const user = await getSellerUserOrThrow();
  const name = String(formData.get("name") || user.name).trim();
  const city = String(formData.get("city") || user.city || "Lagos").trim();
  const country = String(formData.get("country") || user.country || "Nigeria").trim();
  const phone = String(formData.get("phone") || "").trim();
  const description = String(formData.get("description") || "").trim();

  await db.user.update({
    where: { id: user.id },
    data: {
      name,
      city,
      country,
      phone,
    },
  });

  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (store) {
    await db.store.update({
      where: { id: store.id },
      data: {
        description,
        city,
        country,
        brandSettings: mergeBrandSettings(store.brandSettings, {
          setup: {
            profileCompleted: true,
          },
        }),
      },
    });
  }

  redirect("/home/settings?saved=true");
}

export async function markMarketplaceReviewed() {
  const user = await getSellerUserOrThrow();
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) {
    redirect("/builder?firstRun=1");
  }

  await db.store.update({
    where: { id: store.id },
    data: {
      brandSettings: mergeBrandSettings(store.brandSettings, {
        setup: {
          marketplaceReviewed: true,
        },
      }),
    },
  });

  redirect("/marketplace");
}

const SERVER_OWNED_BRAND_KEYS = ["launchBilling", "payoutBank", "pendingInvites", "rexVersions", "domainOrders"] as const;

export async function saveBrandSettingsJson(formData: FormData) {
  const user = await getSellerUserOrThrow();
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return { success: false, error: "Store not found" };

  const raw = formData.get("settings");
  if (!raw || typeof raw !== "string") return { success: false, error: "No settings data" };

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { success: false, error: "Invalid settings JSON" };
    // Keys only the server writes (launch payment state, verified payout bank, invites) can't come from here:
    // otherwise {"launchBilling":{"status":"paid"}} would publish a store without paying.
    for (const key of SERVER_OWNED_BRAND_KEYS) delete (parsed as Record<string, unknown>)[key];
    const current = parseBrandSettings(store.brandSettings);
    const merged = mergeBrandSettings(current, parsed);

    await db.store.update({
      where: { id: store.id },
      data: { brandSettings: merged },
    });

    return { success: true };
  } catch {
    return { success: false, error: "Invalid settings JSON" };
  }
}

export async function saveNotificationPreferences(formData: FormData) {
  const user = await getSellerUserOrThrow();
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) redirect("/home/settings?tab=Notifications&error=Store+not+found");

  const orderPlaced = formData.get("orderPlaced") === "on";
  const orderShipped = formData.get("orderShipped") === "on";
  const orderDelivered = formData.get("orderDelivered") === "on";
  const paymentConfirmed = formData.get("paymentConfirmed") === "on";
  const smsChannel = formData.get("smsChannel") === "on";
  const emailChannel = formData.get("emailChannel") === "on";
  const whatsappChannel = formData.get("whatsappChannel") === "on";

  const current = parseBrandSettings(store.brandSettings);
  const merged = mergeBrandSettings(current, {
    notifications: {
      enabledChannels: [
        ...(smsChannel ? ["sms" as const] : []),
        ...(emailChannel ? ["email" as const] : []),
        ...(whatsappChannel ? ["whatsapp" as const] : []),
      ],
      events: { orderPlaced, orderShipped, orderDelivered, paymentConfirmed },
    },
  });

  await db.store.update({
    where: { id: store.id },
    data: { brandSettings: merged },
  });

  redirect("/home/settings?tab=Notifications&saved=true");
}

export async function savePeggyMemory(formData: FormData) {
  const user = await getSellerUserOrThrow();
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) redirect("/home/settings?tab=Peggy+%26+AI&error=Store+not+found");

  const memory = formData.get("memory");
  if (!memory || typeof memory !== "string") redirect("/home/settings?tab=Peggy+%26+AI&error=No+memory+text");

  const current = parseBrandSettings(store.brandSettings);
  const merged = mergeBrandSettings(current, {
    onboardingMemory: {
      ...current.onboardingMemory,
      notes: memory,
    },
  });

  await db.store.update({
    where: { id: store.id },
    data: { brandSettings: merged },
  });

  redirect("/home/settings?tab=Peggy+%26+AI&saved=true");
}

export async function saveStoreSettings(formData: FormData) {
  const user = await getSellerUserOrThrow();
  // Rules shared with the phone app (/api/app/settings/profile): src/lib/seller-settings.server.ts.
  // A new web address needs the seller to tick "I understand" (the form shows what happens to the old one).
  const slugInput = String(formData.get("slug") || "");
  const confirmed = formData.get("confirmSlugChange") === "yes";
  const saved = await saveStoreDetails(user.id, {
    name: String(formData.get("storeName") || ""),
    slug: confirmed ? slugInput : "",
    description: String(formData.get("description") || ""),
    city: String(formData.get("city") || ""),
  });
  if (!saved) redirect("/builder?firstRun=1");
  if (saved.error) redirect(`/home/settings?tab=Store&error=${encodeURIComponent(saved.error)}`);

  redirect("/home/settings?saved=true&tab=Store");
}

/** The store's business name and postal address: the footer of every email it sends (required for marketing email). */
export async function saveBusinessAddress(formData: FormData) {
  const user = await getSellerUserOrThrow();
  const field = (name: string) => String(formData.get(name) ?? "");
  const saved = await saveSellerBusinessAddress(user.id, {
    legalName: field("legalName"),
    line1: field("line1"),
    line2: field("line2"),
    city: field("addressCity"),
    state: field("addressState"),
    postalCode: field("postalCode"),
    country: field("addressCountry"),
    email: field("addressEmail"),
    phone: field("addressPhone"),
  });
  if (!saved) redirect("/builder?firstRun=1");
  redirect("/home/settings?saved=true&tab=Store#business-address");
}

export async function saveStoreDomainSettings(formData: FormData) {
  const user = await getSellerUserOrThrow();
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) redirect("/builder?firstRun=1");

  // A custom domain is never set here: it goes live only after ownership is verified (/api/domains/connect
  // then /api/domains/verify), so a "customDomain" field in this form is ignored. The web address change is
  // the same checked, rate-limited move as in Settings (the old address keeps redirecting).
  if (formData.get("confirmSlugChange") === "yes") {
    const moved = await changeStoreSlug(store.id, String(formData.get("slug") || ""));
    if (!moved.ok) redirect(`/home/domain?error=${encodeURIComponent(moved.message)}`);
  }

  redirect("/home/domain?saved=true");
}

export async function saveStoreBrandKitSettings(formData: FormData) {
  const user = await getSellerUserOrThrow();
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) redirect("/builder?firstRun=1");

  const name = String(formData.get("storeName") || store.name).trim();
  const description = String(formData.get("description") || store.description || "").trim();
  const city = String(formData.get("city") || store.city || "").trim();
  const country = String(formData.get("country") || store.country || "Nigeria").trim();
  const tagline = String(formData.get("tagline") || "").trim();
  const primary = String(formData.get("primaryColor") || "").trim();
  const accent = String(formData.get("accentColor") || "").trim();

  await db.store.update({
    where: { id: store.id },
    data: {
      name,
      description,
      city,
      country,
      brandSettings: mergeBrandSettings((name !== store.name ? clearStaleShopNames(store.brandSettings, store.name) : null) ?? store.brandSettings, {
        tagline,
        brandKit: {
          primaryColor: primary,
          accentColor: accent,
        },
      }),
    },
  });
  if (name !== store.name) await clearStaleShopNamesInStorePages(store.id, store.name);

  redirect("/home/brand-kit?saved=true");
}

/** An https image link from a form field, or "" (anything else is dropped: it ends up in the store's <head>). */
function httpsImageUrl(value: FormDataEntryValue | null) {
  const text = String(value || "").trim().slice(0, 2000);
  return /^https:\/\/\S+$/i.test(text) ? text : "";
}

export async function saveStoreSeoSettings(formData: FormData) {
  const user = await getSellerUserOrThrow();
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) redirect("/builder?firstRun=1");

  await db.store.update({
    where: { id: store.id },
    data: {
      brandSettings: mergeBrandSettings(store.brandSettings, {
        seo: {
          title: String(formData.get("seoTitle") || "").trim(),
          description: String(formData.get("seoDescription") || "").trim(),
          keywords: String(formData.get("seoKeywords") || "").trim(),
          socialImage: httpsImageUrl(formData.get("socialImage")),
          // The browser-tab icon of every store page (src/lib/seo/store-head.ts); empty falls back to the logo.
          favicon: httpsImageUrl(formData.get("favicon")),
        },
      }),
    },
  });

  redirect("/home/seo?saved=1");
}

export async function saveStoreIntegrationSettings(formData: FormData) {
  const user = await getSellerUserOrThrow();
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) redirect("/builder?firstRun=1");

  // Only a real GA4 ID is kept: the storefront writes it into an inline script.
  const googleAnalyticsId = gaMeasurementId(formData.get("googleAnalyticsId"));
  const gaSiteVerification = String(formData.get("gaSiteVerification") || "").trim();

  await db.store.update({
    where: { id: store.id },
    data: {
      brandSettings: mergeBrandSettings(store.brandSettings, {
        integrations: { googleAnalyticsId, gaSiteVerification },
      }),
    },
  });

  redirect("/home/seo?saved=1&tab=integrations");
}

export async function saveStoreNavigationSettings(formData: FormData) {
  const user = await getSellerUserOrThrow();
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) redirect("/builder?firstRun=1");

  await db.store.update({
    where: { id: store.id },
    data: {
      brandSettings: mergeBrandSettings(store.brandSettings, {
        navigation: {
          mainMenu: String(formData.get("mainMenu") || "").split(",").map((item) => item.trim()).filter(Boolean),
          footerMenu: String(formData.get("footerMenu") || "").split(",").map((item) => item.trim()).filter(Boolean),
        },
      }),
    },
  });

  redirect("/home/navigation?saved=1");
}

export async function saveStoreCartSettings(formData: FormData) {
  const user = await getSellerUserOrThrow();
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) redirect("/builder?firstRun=1");

  const addToCartLabel = String(formData.get("addToCartLabel") || "add_to_cart");
  const addToCartBehavior = String(formData.get("addToCartBehavior") || "drawer");
  const cartStyle = String(formData.get("cartStyle") || "right-drawer");
  const enableWishlist = formData.get("enableWishlist") === "on";

  await db.store.update({
    where: { id: store.id },
    data: {
      brandSettings: mergeBrandSettings(store.brandSettings, {
        cartConfig: {
          addToCartLabel,
          addToCartBehavior,
          cartStyle,
          enableWishlist,
        },
      }),
    },
  });

  redirect("/home/commerce/cart?saved=true");
}

export async function savePeggyPreferences(formData: FormData) {
  const user = await getSellerUserOrThrow();
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) redirect("/home/settings?tab=Peggy+%26+AI&error=Store+not+found");

  const memory = String(formData.get("memory") || "").trim();
  const communicationStyle = String(formData.get("communicationStyle") || "Friendly");
  const dailyBrief = String(formData.get("dailyBrief") || "Morning only");

  const current = parseBrandSettings(store.brandSettings);
  const merged = mergeBrandSettings(current, {
    onboardingMemory: {
      ...current.onboardingMemory,
      notes: memory,
    },
    peggyPreferences: {
      communicationStyle,
      dailyBrief,
    },
  });

  await db.store.update({
    where: { id: store.id },
    data: { brandSettings: merged },
  });

  redirect("/home/settings?tab=Peggy+%26+AI&saved=true");
}

export async function closeStore(formData: FormData) {
  const user = await getSellerUserOrThrow();
  const confirm = String(formData.get("confirm") || "");
  if (confirm !== "CLOSE") {
    redirect("/home/settings?tab=Store&error=Type+CLOSE+to+confirm");
  }

  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) redirect("/home/settings?tab=Store");

  await db.store.update({
    where: { id: store.id },
    data: {
      brandSettings: mergeBrandSettings(store.brandSettings, {
        status: "closed",
        closedAt: new Date().toISOString(),
      }),
    },
  });

  redirect("/home?storeClosed=1");
}

export async function inviteTeamMember(formData: FormData) {
  const user = await getSellerUserOrThrow();
  const email = String(formData.get("email") || "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    redirect("/home/settings?tab=Team&error=Invalid+email+address");
  }

  // Team invite sends an email — store the pending invite in brandSettings
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) redirect("/builder?firstRun=1");

  const current = parseBrandSettings(store.brandSettings);
  const pendingInvites: string[] = (current as any).pendingInvites ?? [];
  if (!pendingInvites.includes(email)) {
    pendingInvites.push(email);
  }

  await db.store.update({
    where: { id: store.id },
    data: {
      brandSettings: mergeBrandSettings(store.brandSettings, {
        pendingInvites,
      } as any),
    },
  });

  redirect("/home/settings?tab=Team&invited=1");
}

export async function saveStoreTaxSettings(formData: FormData) {
  const user = await getSellerUserOrThrow();
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) redirect("/onboarding?role=seller");

  const vatEnabled = formData.get("vatEnabled") === "on";
  const vatRate = Math.min(100, Math.max(0, Number(formData.get("vatRate") || 7.5)));
  const vatInclusive = formData.get("vatInclusive") === "inclusive";
  const vatNumber = String(formData.get("vatNumber") || "").trim();
  const tinNumber = String(formData.get("tinNumber") || "").trim();
  const showTaxOnReceipts = formData.get("showTaxOnReceipts") === "on";

  await db.store.update({
    where: { id: store.id },
    data: {
      brandSettings: mergeBrandSettings(store.brandSettings, {
        taxConfig: {
          vatEnabled,
          vatRate,
          vatInclusive,
          vatNumber,
          tinNumber,
          showTaxOnReceipts,
        },
      }),
    },
  });

  redirect("/home/taxes?saved=1");
}
