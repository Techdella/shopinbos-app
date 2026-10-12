import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { sendPlatformEmail } from "@/lib/email/compliance.server";
import { html } from "@/lib/email/shell";
import { sellerStore } from "@/lib/inbox/auth";
import { cleanTags } from "@/lib/inbox/pure";
import { getThread, teamOptions } from "@/lib/inbox/queries";

export const dynamic = "force-dynamic";

export const GET = withSeller(async (_req, { user, params }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const thread = await getThread(store.id, String(params.id));
  if (!thread) return apiError("NOT_FOUND", "Conversation not found", 404);
  return ok(thread);
});

const PatchSchema = z
  .object({
    status: z.enum(["open", "snoozed", "closed"]).optional(),
    snoozeHours: z.number().int().min(1).max(24 * 30).optional(),
    assigneeEmail: z.string().email().nullable().optional(),
    tags: z.array(z.string().max(40)).max(20).optional(),
    contactName: z.string().trim().max(120).optional(),
    contactEmail: z.string().trim().email().nullable().optional(),
    contactPhone: z.string().trim().max(30).nullable().optional(),
  })
  .strict();

export const PATCH = withSeller(async (req: NextRequest, { user, params }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid change");
  const conversation = await db.inboxConversation.findFirst({ where: { id: String(params.id), storeId: store.id } });
  if (!conversation) return apiError("NOT_FOUND", "Conversation not found", 404);

  const input = parsed.data;
  if (input.assigneeEmail) {
    const team = await teamOptions(store.id, { email: user.email ?? "", name: user.name ?? "You" });
    if (!team.some((member) => member.email === input.assigneeEmail)) return apiError("BAD_REQUEST", "Invite this person in Settings → Team first.");
  }

  const updated = await db.inboxConversation.update({
    where: { id: conversation.id },
    data: {
      ...(input.status ? { status: input.status, snoozedUntil: input.status === "snoozed" ? new Date(Date.now() + (input.snoozeHours ?? 24) * 3_600_000) : null } : {}),
      ...(input.assigneeEmail !== undefined ? { assigneeEmail: input.assigneeEmail } : {}),
      ...(input.tags ? { tags: cleanTags(input.tags) } : {}),
      ...(input.contactName !== undefined ? { contactName: input.contactName || null } : {}),
      ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail?.toLowerCase() || null } : {}),
      ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone || null } : {}),
    },
  });

  // Tell a teammate when a conversation is handed to them (they don't have their own login yet).
  if (input.assigneeEmail && input.assigneeEmail !== conversation.assigneeEmail && input.assigneeEmail !== user.email) {
    const link = `${(process.env.NEXT_PUBLIC_APP_URL ?? "https://app.shopinbos.com").replace(/\/$/, "")}/home/messages?c=${conversation.id}`;
    void sendPlatformEmail({
      to: input.assigneeEmail,
      kind: "transactional",
      subject: `${store.name}: a customer conversation was assigned to you`,
      eyebrow: store.name,
      heading: "A conversation was assigned to you",
      bodyHtml: html.p(`${user.name ?? "The store owner"} assigned you a conversation with ${conversation.contactName ?? conversation.contactEmail ?? conversation.contactPhone ?? "a customer"}.`),
      cta: { label: "Open it in the inbox", url: link },
      reason: `you're on the ${store.name} team on Shopinbos`,
      serviceNote: "This is a service message about work assigned to you.",
    }).catch(() => null);
  }

  return ok({ id: updated.id, status: updated.status, snoozedUntil: updated.snoozedUntil?.toISOString() ?? null, assigneeEmail: updated.assigneeEmail, tags: updated.tags });
});
