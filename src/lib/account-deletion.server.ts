import type { AuthUser } from "@/lib/auth/types";
import { db } from "@/lib/db/client";
import { createTicket, supportReady } from "@/lib/support/service.server";
import { mergeBrandSettings } from "@/lib/workspace";

// "Delete my account" (both app stores require it in the app; the public form is /delete-account). Deletion is a
// request the support team completes within 30 days: wallets, payouts and open orders need a person, and the privacy
// policy keeps payment records the law requires. Asking closes the seller's shop straight away (as Settings › Close
// store does) and opens a support ticket; asking again while that ticket is open doesn't open another.

export const DELETION_SUBJECT = "Delete my account";

export async function requestAccountDeletion(user: AuthUser, reason?: string) {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, brandSettings: true } });
  if (store) {
    await db.store.update({
      where: { id: store.id },
      data: { brandSettings: mergeBrandSettings(store.brandSettings, { status: "closed", closedAt: new Date().toISOString() }) },
    });
  }

  if (!(await supportReady())) return { ticket: null };
  const open = await db.supportTicket.findFirst({
    where: { userId: user.id, subject: DELETION_SUBJECT, status: { in: ["open", "pending"] } },
    select: { number: true },
  });
  if (open) return { ticket: open.number };

  const message = [
    `Please delete my Shopinbos account (${user.role}) and my data.`,
    store ? "My shop is now closed." : null,
    reason?.trim() ? `Reason: ${reason.trim().slice(0, 1000)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const ticket = await createTicket(user, { topic: "other", subject: DELETION_SUBJECT, message, path: "/account/delete", files: [] });
  return { ticket: ticket?.number ?? null };
}
