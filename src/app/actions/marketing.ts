"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { getCurrentAppUser } from "@/lib/server-auth";
import { sendEmail } from "@/lib/notifications/resend";

async function getSellerStore() {
  const user = await getCurrentAppUser({ redirectTo: "/login" });
  if (!user || user.role !== "seller") redirect("/login");
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) redirect("/onboarding");
  return { user, store };
}

// ─── Email Templates ───────────────────────────────────────────────────────────

export async function saveEmailTemplate(formData: FormData) {
  const { store } = await getSellerStore();
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const subject = formData.get("subject") as string;
  const bodyHtml = formData.get("bodyHtml") as string;
  const category = (formData.get("category") as string) || "general";

  if (!name || !subject) return { error: "Name and subject are required" };

  if (id) {
    await db.$executeRawUnsafe(
      `UPDATE "EmailTemplate" SET name = $1, subject = $2, "bodyHtml" = $3, category = $4, "updatedAt" = NOW() WHERE id = $5 AND "storeId" = $6`,
      name, subject, bodyHtml, category, id, store.id,
    );
  } else {
    await db.$executeRawUnsafe(
      `INSERT INTO "EmailTemplate" (id, "storeId", name, subject, "bodyHtml", category) VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5)`,
      store.id, name, subject, bodyHtml, category,
    );
  }
}

export async function deleteEmailTemplate(formData: FormData) {
  const { store } = await getSellerStore();
  const id = formData.get("id") as string;
  if (id) {
    await db.$executeRawUnsafe(
      `DELETE FROM "EmailTemplate" WHERE id = $1 AND "storeId" = $2`,
      id, store.id,
    );
  }
}

// ─── Automation Rules ──────────────────────────────────────────────────────────

export async function saveAutomationRule(formData: FormData) {
  const { store } = await getSellerStore();
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const description = (formData.get("description") as string) || "";
  const trigger = formData.get("trigger") as string;
  const actionType = formData.get("actionType") as string;
  const templateId = (formData.get("templateId") as string) || "";
  const customSubject = (formData.get("customSubject") as string) || "";
  const customBody = (formData.get("customBody") as string) || "";
  const channel = (formData.get("channel") as string) || "email";
  const active = formData.get("active") === "true";

  if (!name || !trigger || !actionType) return { error: "Missing required fields" };

  const actionConfig = JSON.stringify({ templateId, subject: customSubject, body: customBody, channel });

  if (id) {
    await db.$executeRawUnsafe(
      `UPDATE "AutomationRule" SET name = $1, description = $2, trigger = $3, "actionType" = $4, "actionConfig" = $5::json, active = $6, "updatedAt" = NOW() WHERE id = $7 AND "storeId" = $8`,
      name, description, trigger, actionType, actionConfig, active, id, store.id,
    );
  } else {
    await db.$executeRawUnsafe(
      `INSERT INTO "AutomationRule" (id, "storeId", name, description, trigger, "actionType", "actionConfig", active) VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6::json, $7)`,
      store.id, name, description, trigger, actionType, actionConfig, active,
    );
  }
}

export async function deleteAutomationRule(formData: FormData) {
  const { store } = await getSellerStore();
  const id = formData.get("id") as string;
  if (id) {
    await db.$executeRawUnsafe(
      `DELETE FROM "AutomationRule" WHERE id = $1 AND "storeId" = $2`,
      id, store.id,
    );
  }
}

export async function toggleAutomationRule(formData: FormData) {
  const { store } = await getSellerStore();
  const id = formData.get("id") as string;
  const active = formData.get("active") === "true";
  if (id) {
    await db.$executeRawUnsafe(
      `UPDATE "AutomationRule" SET active = $1, "updatedAt" = NOW() WHERE id = $2 AND "storeId" = $3`,
      active, id, store.id,
    );
  }
}

// ─── Broadcast Campaigns ───────────────────────────────────────────────────────

export async function saveBroadcastCampaign(formData: FormData) {
  const { store } = await getSellerStore();
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const subject = formData.get("subject") as string;
  const bodyHtml = (formData.get("bodyHtml") as string) || "";
  const templateId = (formData.get("templateId") as string) || null;
  const scheduledAt = (formData.get("scheduledAt") as string) || null;
  const status = (formData.get("status") as string) || "draft";
  const rawFilter = formData.get("recipientFilter") as string;
  const filterMode = formData.get("filterMode") as string;
  let recipientFilter: string;
  if (filterMode) {
    const filterValue = parseFloat(formData.get("filterValue") as string) || 0;
    const filterEmails = ((formData.get("filterEmails") as string) || "").split("\n").map((e) => e.trim()).filter(Boolean);
    switch (filterMode) {
      case "min_orders":
        recipientFilter = JSON.stringify({ mode: "min_orders", value: filterValue });
        break;
      case "min_spend":
        recipientFilter = JSON.stringify({ mode: "min_spend", value: filterValue });
        break;
      case "specific":
        recipientFilter = JSON.stringify({ mode: "specific", emails: filterEmails });
        break;
      default:
        recipientFilter = JSON.stringify({ mode: "all" });
    }
  } else {
    recipientFilter = rawFilter || JSON.stringify({ mode: "all" });
  }

  if (!name || !subject) return { error: "Name and subject are required" };

  if (id) {
    await db.$executeRawUnsafe(
      `UPDATE "BroadcastCampaign" SET name = $1, subject = $2, "bodyHtml" = $3, "templateId" = $4, status = $5, "recipientFilter" = $6::json, "scheduledAt" = $7, "updatedAt" = NOW() WHERE id = $8 AND "storeId" = $9`,
      name, subject, bodyHtml, templateId, status, recipientFilter, scheduledAt, id, store.id,
    );
  } else {
    await db.$executeRawUnsafe(
      `INSERT INTO "BroadcastCampaign" (id, "storeId", name, subject, "bodyHtml", "templateId", status, "recipientFilter", "scheduledAt") VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7::json, $8)`,
      store.id, name, subject, bodyHtml, templateId, status, recipientFilter, scheduledAt,
    );
  }
}

type RecipientFilter =
  | { mode: "all" }
  | { mode: "min_orders"; value: number }
  | { mode: "min_spend"; value: number }
  | { mode: "specific"; emails: string[] };

function parseFilter(raw: string | null): RecipientFilter {
  if (!raw) return { mode: "all" };
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) return parsed as RecipientFilter;
  } catch { /* fall through */ }
  return { mode: "all" };
}

export async function sendBroadcastCampaign(formData: FormData) {
  const { store } = await getSellerStore();
  const id = formData.get("id") as string;
  if (!id) return { error: "Campaign ID required" };

  const campaign = await db.$queryRawUnsafe<Array<{ name: string; subject: string; bodyHtml: string; recipientFilter: string }>>(
    `SELECT name, subject, "bodyHtml", "recipientFilter" FROM "BroadcastCampaign" WHERE id = $1 AND "storeId" = $2`,
    id, store.id,
  );

  if (!campaign || campaign.length === 0) return { error: "Campaign not found" };

  const c = campaign[0];
  const filter = parseFilter(c.recipientFilter);

  let buyers: Array<{ buyerEmail: string; buyerName: string }>;

  if (filter.mode === "specific" && "emails" in filter && filter.emails.length > 0) {
    const placeholders = filter.emails.map((_, i) => `$${i + 1}`).join(", ");
    buyers = await db.$queryRawUnsafe<Array<{ buyerEmail: string; buyerName: string }>>(
      `SELECT DISTINCT "buyerEmail", "buyerName" FROM "RetailOrder" WHERE "storeId" = $${filter.emails.length + 1} AND "buyerEmail" = ANY(ARRAY[${placeholders}])`,
      ...filter.emails, store.id,
    );
  } else if (filter.mode === "min_orders" && "value" in filter && filter.value > 0) {
    buyers = await db.$queryRawUnsafe<Array<{ buyerEmail: string; buyerName: string }>>(
      `SELECT "buyerEmail", "buyerName" FROM "RetailOrder" WHERE "storeId" = $2 AND "buyerEmail" IS NOT NULL GROUP BY "buyerEmail", "buyerName" HAVING COUNT(*) >= $1`,
      filter.value, store.id,
    );
  } else if (filter.mode === "min_spend" && "value" in filter && filter.value > 0) {
    buyers = await db.$queryRawUnsafe<Array<{ buyerEmail: string; buyerName: string }>>(
      `SELECT "buyerEmail", "buyerName" FROM "RetailOrder" WHERE "storeId" = $2 AND "buyerEmail" IS NOT NULL GROUP BY "buyerEmail", "buyerName" HAVING SUM(total) >= $1`,
      filter.value, store.id,
    );
  } else {
    buyers = await db.$queryRawUnsafe<Array<{ buyerEmail: string; buyerName: string }>>(
      `SELECT DISTINCT "buyerEmail", "buyerName" FROM "RetailOrder" WHERE "storeId" = $1 AND "buyerEmail" IS NOT NULL`,
      store.id,
    );
  }

  let sentCount = 0;
  for (const buyer of buyers) {
    if (!buyer.buyerEmail) continue;
    try {
      await sendEmail({
        to: [buyer.buyerEmail],
        subject: c.subject,
        html: c.bodyHtml.replace(/{{name}}/g, buyer.buyerName).replace(/{{store}}/g, store.name),
      });
      sentCount++;
    } catch {
      // skip failed sends
    }
  }

  await db.$executeRawUnsafe(
    `UPDATE "BroadcastCampaign" SET status = 'sent', "sentCount" = $1, "sentAt" = NOW(), "updatedAt" = NOW() WHERE id = $2 AND "storeId" = $3`,
    sentCount, id, store.id,
  );

  return { sent: sentCount };
}

export async function deleteBroadcastCampaign(formData: FormData) {
  const { store } = await getSellerStore();
  const id = formData.get("id") as string;
  if (id) {
    await db.$executeRawUnsafe(
      `DELETE FROM "BroadcastCampaign" WHERE id = $1 AND "storeId" = $2`,
      id, store.id,
    );
  }
}

export async function testSendCampaign(formData: FormData) {
  const { user, store } = await getSellerStore();
  const id = formData.get("id") as string;
  const subject = formData.get("subject") as string;
  const bodyHtml = (formData.get("bodyHtml") as string) || "";

  if (!subject) return { error: "Subject is required" };

  await sendEmail({
    to: [user.email],
    subject: `[TEST] ${subject}`,
    html: bodyHtml.replace(/{{name}}/g, user.name).replace(/{{store}}/g, store.name),
  });

  return { sent: true, to: user.email };
}

// ─── Discounts & Coupons ───────────────────────────────────────────────────────

export async function saveDiscount(formData: FormData) {
  const { store } = await getSellerStore();
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const code = ((formData.get("code") as string) || "").toUpperCase().replace(/\s+/g, "_");
  const type = formData.get("type") as string;
  const value = parseFloat(formData.get("value") as string) || 0;
  const minOrder = parseFloat(formData.get("minOrder") as string) || 0;
  const maxUses = parseInt(formData.get("maxUses") as string) || 0;
  const status = (formData.get("status") as string) || "draft";
  const expiresAt = (formData.get("expiresAt") as string) || null;

  if (!name || !code || !type || value <= 0) return { error: "Missing required fields" };

  if (id) {
    await db.$executeRawUnsafe(
      `UPDATE "Discount" SET name = $1, code = $2, type = $3, value = $4, "minOrder" = $5, "maxUses" = $6, status = $7, "expiresAt" = $8, "updatedAt" = NOW() WHERE id = $9 AND "storeId" = $10`,
      name, code, type, value, minOrder, maxUses, status, expiresAt, id, store.id,
    );
  } else {
    await db.$executeRawUnsafe(
      `INSERT INTO "Discount" (id, "storeId", name, code, type, value, "minOrder", "maxUses", status, "expiresAt") VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      store.id, name, code, type, value, minOrder, maxUses, status, expiresAt,
    );
  }
}

export async function toggleDiscountStatus(formData: FormData) {
  const { store } = await getSellerStore();
  const id = formData.get("id") as string;
  const status = formData.get("status") as string;
  if (id && status) {
    await db.$executeRawUnsafe(
      `UPDATE "Discount" SET status = $1, "updatedAt" = NOW() WHERE id = $2 AND "storeId" = $3`,
      status, id, store.id,
    );
  }
}

export async function deleteDiscount(formData: FormData) {
  const { store } = await getSellerStore();
  const id = formData.get("id") as string;
  if (id) {
    await db.$executeRawUnsafe(
      `DELETE FROM "Discount" WHERE id = $1 AND "storeId" = $2`,
      id, store.id,
    );
  }
}

export async function generateCoupon(formData: FormData) {
  const { store } = await getSellerStore();
  const type = (formData.get("type") as string) || "percentage";
  const value = parseFloat(formData.get("value") as string) || 0;
  const count = parseInt(formData.get("count") as string) || 1;

  if (value <= 0) return { error: "Value must be greater than 0" };

  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const generated: string[] = [];

  for (let i = 0; i < count; i++) {
    let code = "";
    for (let j = 0; j < 8; j++) code += chars[Math.floor(Math.random() * chars.length)];

    await db.$executeRawUnsafe(
      `INSERT INTO "Coupon" (id, "storeId", code, type, value) VALUES (gen_random_uuid()::text, $1, $2, $3, $4) ON CONFLICT (code) DO NOTHING`,
      store.id, code, type, value,
    );
    generated.push(code);
  }

  return { codes: generated };
}

export async function bulkImportCoupons(formData: FormData) {
  const { store } = await getSellerStore();
  const type = (formData.get("type") as string) || "percentage";
  const value = parseFloat(formData.get("value") as string) || 0;
  const rawCodes = (formData.get("codes") as string) || "";

  if (value <= 0) return { error: "Value must be greater than 0" };
  if (!rawCodes.trim()) return { error: "No codes provided" };

  const codes = rawCodes.split("\n").map((c) => c.trim().toUpperCase().replace(/\s+/g, "_")).filter(Boolean);
  if (codes.length === 0) return { error: "No valid codes found" };

  let imported = 0;
  for (const code of codes) {
    try {
      await db.$executeRawUnsafe(
        `INSERT INTO "Coupon" (id, "storeId", code, type, value) VALUES (gen_random_uuid()::text, $1, $2, $3, $4) ON CONFLICT (code) DO NOTHING`,
        store.id, code, type, value,
      );
      imported++;
    } catch {
      // skip duplicates
    }
  }

  return { imported };
}
