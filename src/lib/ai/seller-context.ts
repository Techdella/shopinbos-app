import "server-only";

import { getAnthropicClient, getOpenAIClient, PEGGY_CLAUDE_MODEL, PEGGY_OPENAI_MODEL } from "@/lib/ai/client";
import { db } from "@/lib/db/client";
import { getSellerWorkspace } from "@/lib/workspace";

// What Peggy and Rex know about a seller's shop, plus Peggy's answer. Shared by the server actions (web)
// and /api/app/peggy (mobile app).

export function fmtMoney(amount: number, currency = "NGN") {
  return `${currency} ${amount.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export function orderItemCount(items: unknown) {
  return Array.isArray(items) ? items.length : 0;
}

export async function buildSellerSnapshot(userId: string) {
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

export function greetingFor(name: string, snapshot: Awaited<ReturnType<typeof buildSellerSnapshot>>) {
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

export function sellerSystemPrompt(snapshot: Awaited<ReturnType<typeof buildSellerSnapshot>>, assistantName: "Peggy" | "Rex") {
  return `You are ${assistantName}, a practical AI commerce assistant for Shopinbos.
Use only the live workspace data below when discussing store status, product pages, orders, import/export, sourcing, supplier chats, and logistics.
If a user asks for data that is not present, say what is missing and point them to the relevant app area instead of inventing it.
Keep replies concise, operational, and specific. Use plain app paths when useful: /products, /products/import, /home/orders, /marketplace, /home/logistics, /home/peggy.

Live workspace snapshot:
${JSON.stringify(snapshot, null, 2)}`;
}

/** Peggy's reply to a seller question, grounded in a snapshot of their shop. */
export async function answerPeggy(userId: string, message: string): Promise<{ text?: string; error?: string }> {
  try {
    const snapshot = await buildSellerSnapshot(userId);
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
