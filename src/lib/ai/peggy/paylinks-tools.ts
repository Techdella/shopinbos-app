import "server-only";

import { db } from "@/lib/db/client";
import { sellerWhatsapp } from "@/lib/ads";
import { checkConfirmationCode, confirmationCode } from "@/lib/marketing/brand";
import { cancelPaymentLink, createPaymentLink, listPaymentLinks, LINK_STORE_SELECT, paymentReadiness, snapshotItems } from "@/lib/payment-links/service.server";
import { saveBioPage, topProductIds } from "@/lib/bio/service.server";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { naira } from "@shared/onboarding";
import { normalizeVariants } from "@shared/product-variants";
import { CreatePaymentLinkSchema, linkTitle, shareMessage, whatsappShareUrl } from "../../payment-links/pure.ts";
import { starterBlocks, type SocialKey } from "../../bio/pure.ts";
import type { PeggyToolInput } from "./pure";
import { findProduct, recordActivity, ToolError, type PeggyToolContext, type ToolOutput } from "./tools";

// Peggy's payment links and link in bio in the seller's chat. Making, cancelling and building show a preview and a
// confirmation code first (tied to exactly what will be made); only the seller's yes in a new message does it.

const EXPIRY_WORDS: Record<string, string> = { "1h": "1 hour", "24h": "24 hours", "3d": "3 days", "7d": "7 days", "30d": "30 days", never: "no expiry" };

async function linkStore(ctx: PeggyToolContext) {
  const store = await db.store.findUnique({ where: { id: ctx.store.id }, select: LINK_STORE_SELECT });
  if (!store) throw new ToolError("This seller has no shop yet.");
  return store;
}

/** The product and option the seller means, from the store's own products. */
async function resolveLine(ctx: PeggyToolContext, line: { product: string; option: string | null; quantity: number }) {
  const product = await findProduct(ctx, line.product);
  if (product.status !== "published") throw new ToolError(`${product.name} isn't published, so customers can't pay for it. Publish it first (update_product with status published).`);
  const row = await db.storeProduct.findFirst({ where: { id: product.id, storeId: ctx.store.id }, select: { variants: true } });
  const options = normalizeVariants(row?.variants).filter((variant) => variant.enabled);
  let variantId: string | null = null;
  let optionName: string | null = null;
  if (line.option) {
    const wanted = line.option.trim().toLowerCase();
    const match = options.find((variant) => variant.id === line.option || variant.name.toLowerCase() === wanted) ?? options.find((variant) => variant.name.toLowerCase().includes(wanted));
    if (!match) throw new ToolError(options.length ? `${product.name} has no option "${line.option}". Its options: ${options.map((variant) => variant.name).join(", ")}.` : `${product.name} has no options; leave option null.`);
    variantId = match.id;
    optionName = match.name;
  }
  return { productId: product.id, name: product.name, variantId, optionName, quantity: line.quantity, openChoice: !variantId && options.length > 1 };
}

async function createLink(ctx: PeggyToolContext, input: PeggyToolInput<"create_payment_link">): Promise<ToolOutput> {
  const store = await linkStore(ctx);
  const lines = [];
  for (const line of input.products) lines.push(await resolveLine(ctx, line));
  const parsed = CreatePaymentLinkSchema.safeParse({
    items: lines.map((line) => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity })),
    title: null,
    note: input.note,
    customAmount: input.customAmount,
    oneTime: input.oneTime,
    expiry: input.expiry ?? "7d",
    buyerName: input.buyerName,
    buyerPhone: input.buyerPhone,
    buyerEmail: input.buyerEmail,
  });
  if (!parsed.success) throw new ToolError(parsed.error.issues[0]?.message ?? "Check the details.");
  const snapshot = await snapshotItems(store.id, parsed.data.items);
  if (!snapshot.ok) throw new ToolError(snapshot.message);

  const amount = parsed.data.customAmount ?? snapshot.total;
  const what = lines.map((line) => `${line.quantity} × ${line.name}${line.optionName ? ` (${line.optionName})` : line.openChoice ? " (customer picks the option)" : ""}`).join(", ");
  const parts = [store.id, "payment-link", JSON.stringify([parsed.data.items, parsed.data.customAmount ?? null, parsed.data.oneTime, parsed.data.expiry, parsed.data.note, parsed.data.buyerName, parsed.data.buyerPhone, parsed.data.buyerEmail])];
  if (!checkConfirmationCode(input.confirmCode, parts)) {
    const readiness = await paymentReadiness(store.id);
    const ways = [readiness.card && "card", readiness.transfer && "bank transfer", readiness.payOnDelivery && "pay on delivery"].filter(Boolean).join(", ");
    return {
      content: [
        `NOT MADE YET. Preview: a ${parsed.data.oneTime ? "one-time" : "reusable"} payment link for ${what}. Items: ${naira(amount)}${parsed.data.customAmount ? " (agreed price)" : ""} plus delivery worked out on the page. Expires: ${EXPIRY_WORDS[parsed.data.expiry]}.${parsed.data.buyerName ? ` For ${parsed.data.buyerName}.` : ""}`,
        readiness.ready ? `Customers can pay by: ${ways}.` : "Warning: the shop can't take payment yet. Set up payments at /home/payments first, or the customer won't be able to pay.",
        `Confirmation code: ${confirmationCode(parts)}. Show the seller this preview; only call create_payment_link again, with the same details and this code, after they clearly say yes.${input.confirmCode ? " (The code given was wrong, expired, or for different details.)" : ""}`,
      ].join("\n"),
    };
  }

  const created = await createPaymentLink(store, parsed.data, { createdBy: "peggy_seller" });
  if (!created.ok) throw new ToolError(created.message);
  const title = linkTitle({ title: null, items: created.items });
  const message = shareMessage({ storeName: store.name, title, amount: naira(amount), url: created.url });
  const summary = `Made a ${parsed.data.oneTime ? "one-time" : "reusable"} payment link for ${what} (${naira(amount)} plus delivery).`;
  await recordActivity(ctx, { type: "order", title: `Peggy made a payment link: ${title}`, description: summary, tool: "create_payment_link", link: "/home/payment-links", data: { code: created.link.code } });
  return {
    content: [
      summary,
      `Link (give it in full): ${created.url}`,
      `Message to send:\n${message}`,
      `Send on WhatsApp${parsed.data.buyerPhone ? ` to ${parsed.data.buyerPhone}` : ""}: ${whatsappShareUrl(message, parsed.data.buyerPhone)}`,
      "When the customer pays, the order shows in /home/orders and the link shows as paid in /home/payment-links.",
    ].join("\n"),
    action: { summary, href: "/home/payment-links" },
  };
}

const CREATOR_WORDS: Record<string, string> = { seller: "the seller", peggy_seller: "Peggy (seller chat)", peggy_customer: "Peggy (customer chat)", bio: "link in bio" };

async function listLinks(ctx: PeggyToolContext, input: PeggyToolInput<"list_payment_links">): Promise<ToolOutput> {
  const store = await linkStore(ctx);
  const links = (await listPaymentLinks(store, { status: input.status })).slice(0, input.limit ?? 10);
  return {
    content: JSON.stringify({
      count: links.length,
      links: links.map((link) => ({
        code: link.code,
        title: link.title,
        amount: naira(link.amount),
        status: link.status,
        oneTime: link.oneTime,
        madeBy: CREATOR_WORDS[link.createdBy] ?? link.createdBy,
        created: link.createdAt.slice(0, 10),
        views: link.views,
        timesPaid: link.paidCount,
        paidOrder: link.order?.orderNumber ?? null,
        url: link.url,
      })),
      seeAlso: "/home/payment-links",
    }),
  };
}

function codeFrom(ref: string) {
  const match = ref.trim().match(/\/pay\/([a-z0-9]+)/i);
  return match ? match[1] : ref.trim();
}

async function cancelLink(ctx: PeggyToolContext, input: PeggyToolInput<"cancel_payment_link">): Promise<ToolOutput> {
  const ref = codeFrom(input.link);
  const link = await db.paymentLink.findFirst({ where: { storeId: ctx.store.id, OR: [{ id: ref }, { code: ref.toLowerCase() }] } });
  if (!link) throw new ToolError(`No payment link "${input.link}" in this shop. Use list_payment_links to find it.`);
  const parts = [ctx.store.id, "cancel-payment-link", link.id];
  if (!checkConfirmationCode(input.confirmCode, parts)) {
    return { content: `NOT CANCELLED YET. The link ${link.code} will stop working for customers. Confirmation code: ${confirmationCode(parts)}. Only call cancel_payment_link again with this code after the seller clearly says yes.` };
  }
  const result = await cancelPaymentLink(ctx.store.id, link.id);
  if (!result.ok) throw new ToolError(result.message);
  const summary = `Cancelled the payment link for ${result.title}. Customers can't pay with it any more.`;
  await recordActivity(ctx, { type: "order", title: "Peggy cancelled a payment link", description: summary, tool: "cancel_payment_link", link: "/home/payment-links" });
  return { content: summary, action: { summary, href: "/home/payment-links" } };
}

async function buildBio(ctx: PeggyToolContext, input: PeggyToolInput<"build_link_in_bio">): Promise<ToolOutput> {
  const store = await db.store.findUnique({ where: { id: ctx.store.id }, select: { id: true, name: true, slug: true, customDomain: true, description: true, bioPage: { select: { title: true, bio: true, avatarUrl: true, theme: true, published: true } } } });
  if (!store) throw new ToolError("This seller has no shop yet.");
  let products: Array<{ id: string; name: string }>;
  if (input.products?.length) {
    products = [];
    for (const name of input.products) {
      const product = await findProduct(ctx, name);
      if (product.status !== "published") throw new ToolError(`${product.name} isn't published, so it can't go on the page. Publish it first or pick another.`);
      if (!products.some((p) => p.id === product.id)) products.push({ id: product.id, name: product.name });
    }
  } else {
    products = await topProductIds(ctx.store.id, input.productCount ?? 5);
    if (!products.length) throw new ToolError("The shop has no published products yet. Add or publish some first.");
  }
  const whatsapp = input.whatsapp ? await sellerWhatsapp(ctx.store.id, ctx.userPhone) : null;
  if (input.whatsapp && !whatsapp) throw new ToolError("The shop has no WhatsApp number saved. Ask the seller for it (or add it in Live chat settings), or set whatsapp to false.");
  const socials = Object.fromEntries(Object.entries(input.socials).filter(([, value]) => value)) as Partial<Record<SocialKey, string>>;

  const url = buildStorefrontUrl(store, "/links");
  const parts = [ctx.store.id, "link-in-bio", JSON.stringify([products.map((p) => p.id), whatsapp, socials, input.buyNow, input.signup, input.bio])];
  const outline = [
    ...products.map((p, index) => `${index === 0 && input.buyNow ? "Big Buy now card" : "Product card"}: ${p.name}`),
    ...(whatsapp ? ["WhatsApp chat button"] : []),
    ...(Object.keys(socials).length ? [`Social links: ${Object.keys(socials).join(", ")}`] : []),
    ...(input.signup ? ["Email sign-up box"] : []),
  ];
  if (!checkConfirmationCode(input.confirmCode, parts)) {
    return {
      content: `NOT SAVED YET. Preview of the link in bio page (${url}), replacing what's on it now:\n- ${outline.join("\n- ")}${input.bio ? `\nLine under the name: ${input.bio}` : ""}\nConfirmation code: ${confirmationCode(parts)}. Show the seller this; only call build_link_in_bio again with the same details and this code after they clearly say yes.`,
    };
  }

  // A fixed id source, so the blocks (and the confirmation) don't depend on chance.
  let seed = 7;
  const blocks = starterBlocks({ productIds: products.map((p) => p.id), whatsapp, socials, buyNow: input.buyNow, signup: input.signup }, () => ((seed = (seed * 9301 + 49297) % 233280) / 233280));
  const page = store.bioPage;
  const saved = await saveBioPage(ctx.store.id, {
    published: true,
    title: page?.title ?? store.name,
    bio: input.bio ?? page?.bio ?? (store.description ?? "").slice(0, 300),
    avatarUrl: page?.avatarUrl ?? "",
    theme: page?.theme && typeof page.theme === "object" ? page.theme : { preset: "store" },
    blocks,
  });
  if (!saved.ok) throw new ToolError(saved.message);
  const summary = `Built your link in bio page with ${outline.length} block${outline.length === 1 ? "" : "s"}. Put ${url} in your Instagram and TikTok bio.`;
  await recordActivity(ctx, { type: "marketing", title: "Peggy built the link in bio page", description: summary, tool: "build_link_in_bio", link: "/home/social/link-in-bio" });
  return { content: `${summary}\nLink (give it in full): ${url}\nThe seller can change it at /home/social/link-in-bio.`, action: { summary, href: "/home/social/link-in-bio" } };
}

export const PAYLINKS_TOOL_RUNNERS = {
  create_payment_link: createLink,
  list_payment_links: listLinks,
  cancel_payment_link: cancelLink,
  build_link_in_bio: buildBio,
};
