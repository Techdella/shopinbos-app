"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { getCurrentAppUser } from "@/lib/server-auth";
import { sendEmail } from "@/lib/notifications/resend";
import { parseRecipientFilter, sendCampaign, type RecipientFilter } from "@/lib/campaigns/send";
import { escapeHtml } from "@/lib/campaigns/render";

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

/** Parses a datetime-local value (no timezone) as Lagos time (WAT, UTC+1, no daylight saving). */
function parseLagosDateTime(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(`${value.length === 16 ? `${value}:00` : value}+01:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function recipientFilterFromForm(formData: FormData): RecipientFilter | null {
  const filterMode = formData.get("filterMode") as string | null;
  if (!filterMode) {
    const raw = formData.get("recipientFilter") as string | null;
    return raw ? parseRecipientFilter(raw) : null;
  }
  // Each radio option has its own value input, so read the one that belongs to the chosen mode.
  switch (filterMode) {
    case "min_orders":
      return { mode: "min_orders", value: parseFloat(formData.get("minOrders") as string) || 1 };
    case "min_spend":
      return { mode: "min_spend", value: parseFloat(formData.get("minSpend") as string) || 0 };
    case "specific":
      return {
        mode: "specific",
        emails: ((formData.get("filterEmails") as string) || "").split(/[\n,]/).map((e) => e.trim()).filter(Boolean),
      };
    case "subscribers":
      return { mode: "subscribers" };
    default:
      return { mode: "all" };
  }
}

export async function saveBroadcastCampaign(formData: FormData): Promise<{ id?: string; error?: string }> {
  const { store } = await getSellerStore();
  const id = (formData.get("id") as string) || null;
  const name = ((formData.get("name") as string) || "").trim();
  const subject = ((formData.get("subject") as string) || "").trim();
  if (!name || !subject) return { error: "Name and subject are required" };

  const scheduledAt = parseLagosDateTime(formData.get("scheduledAt") as string | null);
  const filter = recipientFilterFromForm(formData);
  const data = {
    name,
    subject,
    bodyHtml: (formData.get("bodyHtml") as string) || "",
    templateId: (formData.get("templateId") as string) || null,
    scheduledAt,
    // A future schedule queues the campaign for the scheduler; otherwise it stays a draft.
    status: scheduledAt && scheduledAt > new Date() ? ("scheduled" as const) : ("draft" as const),
    ...(filter ? { recipientFilter: filter } : {}),
  };

  if (id) {
    const existing = await db.broadcastCampaign.findFirst({ where: { id, storeId: store.id }, select: { status: true } });
    if (!existing) return { error: "Campaign not found" };
    if (existing.status === "sent" || existing.status === "sending") return { error: "Sent campaigns can't be edited" };
    await db.broadcastCampaign.update({ where: { id }, data });
    return { id };
  }

  const created = await db.broadcastCampaign.create({
    data: { ...data, storeId: store.id, recipientFilter: filter ?? { mode: "all" } },
    select: { id: true },
  });
  return { id: created.id };
}

export async function sendBroadcastCampaign(formData: FormData): Promise<{ sent?: number; failed?: number; error?: string }> {
  const { store } = await getSellerStore();
  const id = formData.get("id") as string;
  if (!id) return { error: "Campaign ID required" };

  const result = await sendCampaign(store.id, id);
  return result.ok ? { sent: result.sent, failed: result.failed } : { error: result.error };
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

  const result = await sendEmail({
    to: [user.email],
    subject: `[TEST] ${subject.replace(/{{\s*store\s*}}/g, store.name)}`,
    html: bodyHtml.replace(/{{\s*name\s*}}/g, escapeHtml(user.name)).replace(/{{\s*store\s*}}/g, escapeHtml(store.name)),
  });
  if (!result.success) return { error: result.message ?? "Test email could not be sent" };

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
