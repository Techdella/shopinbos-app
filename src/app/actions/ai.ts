"use server";

import { aiConfigured } from "@/lib/ai/client";
import { aiText, type ChatTurn } from "@/lib/ai/text";
import { meterAi } from "@/lib/ai/usage";
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
import { answerPeggy, buildSellerSnapshot, greetingFor, orderItemCount, sellerSystemPrompt, fmtMoney } from "@/lib/ai/seller-context";

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
  const user = await requireRole(["seller"], "/login");
  return answerPeggy(user.id, message);
}

/** Prior turns from the drawer, oldest first. Only plain text is kept, and only the most recent turns. */
function cleanHistory(history: unknown): ChatTurn[] {
  if (!Array.isArray(history)) return [];
  const turns: ChatTurn[] = [];
  for (const raw of history.slice(-16)) {
    if (!raw || typeof raw !== "object") continue;
    const turn = raw as { role?: unknown; content?: unknown };
    const role = turn.role === "assistant" ? "assistant" : turn.role === "user" ? "user" : null;
    const content = typeof turn.content === "string" ? turn.content.trim().slice(0, 4000) : "";
    if (!role || !content) continue;
    const previous = turns[turns.length - 1];
    if (previous?.role === role) previous.content = `${previous.content}\n\n${content}`;
    else turns.push({ role, content });
  }
  while (turns.length && turns[0].role === "assistant") turns.shift();
  return turns;
}

export async function askRex(
  message: string,
  pageContext?: { path?: string; label?: string },
  history?: Array<{ role: "user" | "assistant"; content: string }>,
) {
  try {
    if (!message?.trim()) return { error: "Type a message for Rex first." };
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

    if (!aiConfigured()) {
      return { error: "Rex's AI isn't switched on yet. Ask your admin to add OPENAI_API_KEY or ANTHROPIC_API_KEY." };
    }
    const limited = await meterAi(user.id, "text");
    if (limited) {
      const body = (await limited.json().catch(() => null)) as { error?: { message?: string } } | null;
      return { error: body?.error?.message ?? "You've reached today's limit for Rex. Try again later." };
    }

    const turns = cleanHistory(history);
    // A trailing unanswered user turn (e.g. one that failed) is folded into this message.
    const unanswered = turns[turns.length - 1]?.role === "user" ? turns.pop()!.content : "";
    turns.push({ role: "user", content: [unanswered, message.trim().slice(0, 4000)].filter(Boolean).join("\n\n") });
    // OpenAI or Claude, whichever answers first (with fallback to the other).
    const reply = await aiText({ system, messages: turns, maxTokens: 8000 });
    if (!reply) {
      return { error: "Rex couldn't reach the AI right now. Please try again in a moment." };
    }
    const raw = reply.text;

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
      const extras = [
        draft.sampleProducts ? `I added ${draft.sampleProducts} sample product${draft.sampleProducts === 1 ? "" : "s"} as drafts, marked "(sample)"; check their prices and photos.` : "",
        draft.live ? "Your store is live, so this is saved as a draft: shoppers see it only after you publish." : "Nothing is published yet: publish from the builder when you're happy with it.",
      ].filter(Boolean).join(" ");
      return {
        text: `${guided.reply}\n\nDraft created for ${draft.storeName}. ${extras}`,
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
