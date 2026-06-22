"use server";

import {
  getAnthropicClient,
  getOpenAIClient,
  PEGGY_CLAUDE_MODEL,
  PEGGY_OPENAI_MODEL,
} from "@/lib/ai/client";
import {
  applyGuidedQuestionFallback,
  buildRexCommerceSystemPrompt,
  createRexDraftFromPlan,
  getSavedRexAnswers,
  parseRexStructuredResult,
  saveRexAnswers,
} from "@/lib/ai/rex-onboarding";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace, mergeBrandSettings } from "@/lib/workspace";

function fmtMoney(amount: number, currency = "NGN") {
  return `${currency} ${amount.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function orderItemCount(items: unknown) {
  return Array.isArray(items) ? items.length : 0;
}

async function buildSellerSnapshot(userId: string) {
  const workspace = await getSellerWorkspace(userId);
  const store = workspace?.store ?? null;

  const retailOrders = store
    ? await db.retailOrder.findMany({
        where: { storeId: store.id },
        orderBy: { createdAt: "desc" },
        take: 12,
      })
    : [];

  const unreadMessages = await db.message.count({
    where: {
      read: false,
      senderId: { not: userId },
      conversation: {
        OR: [{ participant1Id: userId }, { participant2Id: userId }],
      },
    },
  });

  const paidStatuses = ["paid", "processing", "shipped", "delivered"];
  const revenue = retailOrders
    .filter((order) => paidStatuses.includes(order.status))
    .reduce((sum, order) => sum + Number(order.total), 0);

  const products = workspace?.storeProducts ?? [];
  const publishedProducts = products.filter((product) => ["published", "active"].includes(product.status));
  const lowStockProducts = products.filter((product) => {
    const stock = product.supplierProduct?.stockQuantity;
    return typeof stock === "number" && stock > 0 && stock <= 5;
  });

  return {
    store: store
      ? {
          id: store.id,
          name: store.name,
          slug: store.slug,
          status: store.status,
          currency: store.currency,
          customDomain: store.customDomain,
        }
      : null,
    products: {
      total: products.length,
      published: publishedProducts.length,
      drafts: products.filter((product) => product.status === "draft").length,
      lowStock: lowStockProducts.length,
      recent: products.slice(0, 8).map((product) => ({
        name: product.name,
        status: product.status,
        price: fmtMoney(Number(product.retailPrice), product.currency),
        fulfillmentType: product.fulfillmentType,
        supplier: product.supplierProduct?.supplier?.displayName ?? null,
        stock: product.supplierProduct?.stockQuantity ?? null,
      })),
    },
    orders: {
      total: retailOrders.length,
      revenue: fmtMoney(revenue, store?.currency ?? "NGN"),
      pending: retailOrders.filter((order) => order.status === "pending").length,
      processing: retailOrders.filter((order) => order.status === "processing").length,
      shipped: retailOrders.filter((order) => order.status === "shipped").length,
      recent: retailOrders.slice(0, 8).map((order) => ({
        orderNumber: order.orderNumber,
        buyerName: order.buyerName,
        total: fmtMoney(Number(order.total), order.currency),
        status: order.status,
        itemCount: orderItemCount(order.items),
        createdAt: order.createdAt.toISOString(),
      })),
    },
    sourcing: {
      wholesaleOrders: (workspace?.wholesaleOrders ?? []).map((order) => ({
        product: order.supplierProduct.name,
        supplier: order.supplier.displayName,
        quantity: order.quantity,
        status: order.status,
        total: fmtMoney(Number(order.totalPrice), order.currency),
      })),
      recommendedProducts: (workspace?.trendingProducts ?? []).map((product) => ({
        name: product.name,
        supplier: product.supplier.displayName,
        category: product.category.name,
        wholesalePrice: fmtMoney(Number(product.wholesalePrice), product.currency),
        suggestedRetailPrice: fmtMoney(Number(product.suggestedRetailPrice), product.currency),
        stock: product.stockQuantity,
        dropshipAvailable: product.dropshipAvailable,
      })),
      suppliers: (workspace?.suppliers ?? []).map((supplier) => ({
        name: supplier.displayName,
        city: supplier.city,
        country: supplier.country,
        rating: supplier.rating,
        trustScore: supplier.trustScore,
      })),
    },
    logistics: {
      bookings: (workspace?.deliveryBookings ?? []).map((booking) => ({
        partner: booking.logisticsPartner.displayName,
        destination: booking.destination,
        status: booking.status,
        trackingCode: booking.trackingCode,
        fee: fmtMoney(Number(booking.deliveryFee), booking.currency),
      })),
      quoteRequests: (workspace?.deliveryQuotes ?? []).map((quote) => ({
        partner: quote.logisticsPartner.displayName,
        destination: quote.destination,
        status: quote.status,
        quotedPrice: quote.quotedPrice ? fmtMoney(Number(quote.quotedPrice)) : null,
      })),
      partners: (workspace?.logisticsPartners ?? []).map((partner) => ({
        name: partner.displayName,
        city: partner.city,
        zones: partner.coverageZones,
        reliabilityScore: partner.reliabilityScore,
        rating: partner.rating,
      })),
    },
    messages: {
      unread: unreadMessages,
    },
  };
}

function greetingFor(name: string, snapshot: Awaited<ReturnType<typeof buildSellerSnapshot>>) {
  const firstName = name.split(" ")[0] || "there";
  const storeName = snapshot.store?.name ?? "your store";
  const urgent: string[] = [];

  if (snapshot.orders.pending > 0) {
    urgent.push(`${snapshot.orders.pending} pending order${snapshot.orders.pending === 1 ? "" : "s"} waiting to be fulfilled`);
  }
  if (snapshot.products.lowStock > 0) {
    urgent.push(`${snapshot.products.lowStock} product${snapshot.products.lowStock === 1 ? "" : "s"} running low on stock`);
  }
  if (snapshot.messages.unread > 0) {
    urgent.push(`${snapshot.messages.unread} unread message${snapshot.messages.unread === 1 ? "" : "s"} from suppliers or logistics`);
  }
  if (snapshot.products.drafts > 0) {
    urgent.push(`${snapshot.products.drafts} draft product${snapshot.products.drafts === 1 ? "" : "s"} not yet published`);
  }

  if (urgent.length > 0) {
    return `Hi ${firstName}. Here is what needs your attention in ${storeName} today:\n\n${urgent.map((item, i) => `${i + 1}. ${item}`).join("\n")}\n\nAsk me about any of these, or anything else about orders, products, sourcing, or logistics.`;
  }

  if (snapshot.products.total === 0) {
    return `Hi ${firstName}. ${storeName} is set up but you have not added any products yet. I can help you import a product list, source from verified suppliers, or write product descriptions. Where would you like to start?`;
  }

  return `Hi ${firstName}. ${storeName} looks good today — ${snapshot.products.published} active product${snapshot.products.published === 1 ? "" : "s"}, ${snapshot.orders.total} recent order${snapshot.orders.total === 1 ? "" : "s"}, and ${snapshot.sourcing.recommendedProducts.length} sourcing suggestion${snapshot.sourcing.recommendedProducts.length === 1 ? "" : "s"} waiting. What would you like to work on?`;
}

function sellerSystemPrompt(snapshot: Awaited<ReturnType<typeof buildSellerSnapshot>>, assistantName: "Peggy" | "Rex") {
  return `You are ${assistantName}, a practical AI commerce assistant for Shopinbos.
Use only the live workspace data below when discussing store status, product pages, orders, import/export, sourcing, supplier chats, and logistics.
If a user asks for data that is not present, say what is missing and point them to the relevant app area instead of inventing it.
Keep replies concise, operational, and specific. Use plain app paths when useful: /products, /products/import, /home/orders, /marketplace, /home/logistics, /home/peggy.

Live workspace snapshot:
${JSON.stringify(snapshot, null, 2)}`;
}

export async function getSuggestions(pathname?: string) {
  const user = await requireRole(["seller", "supplier", "logistics_partner"], "/login");
  const name = user.name.split(" ")[0] || "there";
  const rexSuggestions: string[] = [];
  const peggySuggestions: string[] = [];

  // Supplier role
  if (user.role === "supplier") {
    const greeting = `Hi ${name}, I'm Rex. I can help you set up your supplier profile, upload your product catalog, configure dropshipping or wholesale pricing, and get you ready for your first seller connections.`;
    if (pathname?.includes("/products") || pathname?.includes("/catalog")) {
      rexSuggestions.push("Write product descriptions for my catalog", "Help me bulk import products", "Suggest product categories", "Review my product images");
    } else if (pathname?.includes("/settings") || pathname?.includes("/profile")) {
      rexSuggestions.push("Update my supplier profile", "Configure wholesale pricing", "Set up dropshipping", "Connect logistics partners");
    } else if (pathname?.includes("/verification")) {
      rexSuggestions.push("What documents do I need to upload?", "Check my verification status", "Explain the verification process", "Help me prepare CAC documents");
    } else {
      rexSuggestions.push("Set up my product catalog", "Configure dropshipping options", "Connect with logistics partners", "Explain how wholesale pricing works");
    }
    return { name, greeting, rexSuggestions: rexSuggestions.slice(0, 4), peggySuggestions: [] };
  }

  // Logistics partner role
  if (user.role === "logistics_partner") {
    const greeting = `Hi ${name}, I'm Rex. I can help you set up your logistics profile, configure delivery zones and pricing, manage your fleet, and connect with suppliers and sellers.`;
    const { getLogisticsWorkspace } = await import("@/lib/workspace");
    const workspace = await getLogisticsWorkspace(user.id);

    if (workspace) {
      if (workspace.metrics.pendingQuoteCount > 0) rexSuggestions.push("Review pending quote requests");
      if (workspace.metrics.activeBookingCount > 0) rexSuggestions.push("Track active deliveries");
      rexSuggestions.push("Update my coverage zones");
      rexSuggestions.push("Review my pricing");
    } else {
      rexSuggestions.push("Complete my onboarding");
      rexSuggestions.push("Set up coverage zones");
      rexSuggestions.push("Add vehicle types");
      rexSuggestions.push("Set delivery pricing");
    }

    if (rexSuggestions.length < 2) rexSuggestions.push("View my dashboard", "Check my earnings");
    return { name, greeting, rexSuggestions: rexSuggestions.slice(0, 4), peggySuggestions: [] };
  }

  // Seller role — page-specific suggestions take priority
  const greeting = `Hi ${name}, I'm Rex. I can help you build your store, create landing pages, write product descriptions, upload products, connect logistics, and grow your business on Shopinbos.`;

  if (pathname) {
    const onEditor = pathname.includes("/editor") || pathname.includes("/builder");
    const onProducts = pathname.includes("/products") || pathname.includes("/inventory");
    const onOrders = pathname.includes("/orders");
    const onSettings = pathname.includes("/settings");
    const onMarketing = pathname.includes("/marketing");
    const onVerification = pathname.includes("/verification");
    const onShipping = pathname.includes("/shipping");

    if (onEditor) {
      rexSuggestions.push("Make my hero section more premium", "Improve my color palette", "Add a testimonials section", "Rewrite my homepage copy");
    } else if (onProducts) {
      rexSuggestions.push("Write product descriptions", "Suggest product categories", "Help me bulk import products", "Review my product images");
    } else if (onOrders) {
      rexSuggestions.push("Summarize my pending orders", "Draft a shipping update email", "Check my refund rate", "Which orders need attention?");
    } else if (onSettings) {
      rexSuggestions.push("Update my store settings", "Help me configure payments", "Set up my shipping zones", "Review my store profile");
    } else if (onMarketing) {
      rexSuggestions.push("Write a promotional email", "Create an Instagram caption", "Draft a WhatsApp broadcast", "Suggest a discount strategy");
    } else if (onVerification) {
      rexSuggestions.push("What documents do I need?", "Check my verification status", "Explain the CAC process", "Help me prepare my documents");
    } else if (onShipping) {
      rexSuggestions.push("Review my shipping zones", "Suggest courier partners", "Set competitive delivery prices", "Configure free shipping thresholds");
    }
  }

  if (rexSuggestions.length === 0) {
    const snapshot = await buildSellerSnapshot(user.id);
    if (snapshot.products.total === 0) {
      rexSuggestions.push("Add my first products", "Set up my store pages");
    } else {
      if (snapshot.products.drafts > 0) rexSuggestions.push("Publish my draft products");
      if (snapshot.products.lowStock > 0) rexSuggestions.push("Review low stock items");
      rexSuggestions.push("Update my hero section", "Edit product descriptions");
    }
    if (snapshot.orders.pending > 0) peggySuggestions.push("Check my pending orders");
    if (snapshot.orders.processing > 0 || snapshot.orders.shipped > 0) peggySuggestions.push("Track my active orders");
    if (snapshot.products.lowStock > 0) peggySuggestions.push("Which products need restocking?");
    if (snapshot.sourcing.recommendedProducts.length > 0) peggySuggestions.push("What should I source next?");
    if (snapshot.messages.unread > 0) peggySuggestions.push("Check my unread messages");
    if (snapshot.logistics.bookings.length > 0 || snapshot.logistics.quoteRequests.length > 0) peggySuggestions.push("What is my logistics status?");
  }

  if (rexSuggestions.length < 2) rexSuggestions.push("Draft a product description", "Write marketing copy", "Add a new page", "Edit my hero section");
  if (peggySuggestions.length < 2) peggySuggestions.push("How are my orders doing?", "Which products need attention?", "What should I source next?", "What is my logistics status?", "Help me prepare a product CSV import");

  return { name, greeting, rexSuggestions: rexSuggestions.slice(0, 4), peggySuggestions: peggySuggestions.slice(0, 5) };
}

export async function getPeggyData() {
  const user = await requireRole(["seller"], "/login");
  const status = await buildSellerSnapshot(user.id);
  const storeName = status.store?.name ?? "Your Store";
  const storeSlug = status.store?.slug ?? "";
  return {
    userName: user.name,
    storeName,
    storeSlug,
    status,
    greeting: greetingFor(user.name, status),
  };
}

export async function askPeggy(message: string, _storeContext?: string) {
  try {
    const user = await requireRole(["seller"], "/login");
    const snapshot = await buildSellerSnapshot(user.id);
    const system = sellerSystemPrompt(snapshot, "Peggy");

    const anthropic = getAnthropicClient();
    if (anthropic) {
      const response = await anthropic.messages.create({
        model: PEGGY_CLAUDE_MODEL,
        max_tokens: 1600,
        system,
        messages: [{ role: "user", content: message }],
      });
      const text = response.content[0]?.type === "text" ? response.content[0].text : "";
      return { text };
    }

    const openai = getOpenAIClient();
    if (openai) {
      const response = await openai.responses.create({
        model: PEGGY_OPENAI_MODEL,
        input: [
          { role: "system", content: system },
          { role: "user", content: message },
        ],
      });
      return { text: response.output_text ?? "" };
    }

    return { error: "AI assistant is not available right now. Configure OPENAI_API_KEY or ANTHROPIC_API_KEY." };
  } catch (error) {
    console.error("Peggy AI error:", error);
    return { error: "Something went wrong. Please try again in a moment." };
  }
}

export async function askRex(
  message: string,
  pageContext?: { path?: string; label?: string },
) {
  try {
    const user = await requireRole(["seller", "supplier", "logistics_partner"], "/login");
    const sellerSnapshot = user.role === "seller" ? await buildSellerSnapshot(user.id) : null;
    const savedAnswers = await getSavedRexAnswers(user.id);
    const system = buildRexCommerceSystemPrompt({
      user,
      savedAnswers,
      snapshot:
        user.role === "seller"
          ? sellerSnapshot
          : { role: user.role, note: "Role-specific onboarding is active. No seller store snapshot is available for this role." },
      pageContext,
    });

    let raw = "";
    const openai = getOpenAIClient();
    if (openai) {
      const response = await openai.responses.create({
        model: process.env.OPENAI_REX_ASSISTANT_MODEL ?? PEGGY_OPENAI_MODEL,
        input: [
          { role: "system", content: system },
          { role: "user", content: message },
        ],
      });
      raw = response.output_text ?? "";
    } else {
      const anthropic = getAnthropicClient();
      if (anthropic) {
        const response = await anthropic.messages.create({
          model: PEGGY_CLAUDE_MODEL,
          max_tokens: 1600,
          system,
          messages: [{ role: "user", content: message }],
        });
        raw = response.content[0]?.type === "text" ? response.content[0].text : "";
      }
    }

    if (!raw) {
      return { error: "Rex needs OPENAI_API_KEY or ANTHROPIC_API_KEY configured before he can answer with live AI." };
    }

    const parsed = parseRexStructuredResult(raw);
    if (!parsed) {
      return { error: "Rex could not read the AI response. Please try again." };
    }

    if (parsed.answerWrites?.length) {
      await saveRexAnswers({ user, writes: parsed.answerWrites });
    }
    if (user.role === "seller" && parsed.memoryPatch && Object.keys(parsed.memoryPatch).length > 0) {
      const store = await db.store.findUnique({
        where: { userId: user.id },
        select: { id: true, brandSettings: true },
      });
      if (store) {
        await db.store.update({
          where: { id: store.id },
          data: {
            brandSettings: mergeBrandSettings(store.brandSettings, {
              onboardingMemory: parsed.memoryPatch,
            }),
          },
        });
      }
    }
    const refreshedAnswers = parsed.answerWrites?.length ? await getSavedRexAnswers(user.id) : savedAnswers;
    const guided = applyGuidedQuestionFallback(parsed, refreshedAnswers);

    if (guided.intent === "generate_store_draft" || guided.intent === "generate_landing_page_draft") {
      if (user.role !== "seller") {
        return {
          text: "I can map that plan for your role, but full store drafts are only available from a seller workspace right now.",
          meta: { intent: guided.intent },
        };
      }
      const draft = await createRexDraftFromPlan({ user, result: guided, savedAnswers: refreshedAnswers });
      const previewUrl = draft.homePageId ? `/preview/store/${draft.slug}/${draft.homePageId}` : `/builder/rex`;
      return {
        text: `${guided.reply}\n\nDraft created for ${draft.storeName}. Preview it at ${previewUrl} or continue editing in /builder/rex.`,
        meta: {
          intent: guided.intent,
          draftCreated: true,
          storeSlug: draft.slug,
          previewUrl,
          builderUrl: "/builder/rex",
        },
      };
    }

    return {
      text: guided.reply,
      meta: {
        intent: guided.intent,
        nextQuestion: guided.nextQuestion ?? null,
        needsConfirmation: Boolean(guided.needsConfirmation),
        confirmationLabel: guided.confirmationLabel ?? null,
      },
    };
  } catch (error) {
    console.error("Rex AI error:", error);
    return { error: "Rex could not answer right now. Please try again." };
  }
}
