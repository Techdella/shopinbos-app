// One-off: WhatsApp the "new look for your store" notice to live sellers moved off the blank starter who have no email
// (scripts/move-blank-starter-stores-rest.ts only reached the bell). Reads each store's bell notice and sends it
// the way notify() does: the approved template on our number (Meta Cloud API), else the SMS provider's WhatsApp.
//
//   npx tsx --conditions=react-server --env-file=.env.local scripts/whatsapp-blank-starter-notice.ts --dry-run
//   npx tsx --conditions=react-server --env-file=.env.local scripts/whatsapp-blank-starter-notice.ts <storeId> [<storeId> …]
//
// With no store ids: every moved live store whose seller has no email. Needs DATABASE_URL and the WhatsApp keys
// (META_WHATSAPP_* or the Sendchamp keys). Records each send as a NotificationDelivery, and skips one already sent.

import { db } from "../src/lib/db/client";
import { sendAlertWhatsApp, textPhoneFor } from "../src/lib/notifications/notify.server";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const ids = args.filter((arg) => !arg.startsWith("--"));
const APP = "https://app.shopinbos.com";

async function main() {
  const notices = await db.notification.findMany({
    where: { dedupeKey: { startsWith: "blank-starter-move:" }, ...(ids.length ? { dedupeKey: { in: ids.map((id) => `blank-starter-move:${id}`) } } : {}) },
    select: { id: true, userId: true, title: true, description: true, link: true, event: true, category: true, metadata: true, user: { select: { name: true, role: true, phone: true, email: true } } },
  });
  for (const notice of notices) {
    if (!ids.length && notice.user.email) continue;
    const sent = await db.notificationDelivery.findFirst({ where: { notificationId: notice.id, channel: "whatsapp", status: "ok" } }).catch(() => null);
    if (sent) {
      console.log(`  ${notice.id}: already sent on WhatsApp`);
      continue;
    }
    const phone = await textPhoneFor(notice.userId, notice.user.phone, notice.user.role);
    if (!phone) {
      console.log(`  ${notice.id}: no phone`);
      continue;
    }
    const url = notice.link ? `${APP}${notice.link}` : null;
    const text = `Shopinbos: ${notice.title}. ${notice.description}`.slice(0, 300) + (url ? ` ${url}` : "");
    if (dryRun) {
      console.log(`  ${notice.id}: would send to …${phone.slice(-4)}: ${text}`);
      continue;
    }
    const result = await sendAlertWhatsApp({
      input: { userId: notice.userId, event: notice.event, title: notice.title, description: notice.description, link: notice.link, metadata: notice.metadata as Record<string, unknown> },
      category: (notice.category ?? "account") as Parameters<typeof sendAlertWhatsApp>[0]["category"],
      to: phone,
      url,
      user: { name: notice.user.name ?? "", role: notice.user.role },
      text,
    });
    await db.notificationDelivery
      .create({ data: { notificationId: notice.id, userId: notice.userId, channel: "whatsapp", provider: result.provider, status: result.success ? "ok" : "error", category: notice.category ?? "account", title: notice.title, error: result.success ? null : result.message ?? null } })
      .catch((error) => console.error("  could not record the delivery", error));
    console.log(`  ${notice.id}: ${result.success ? `sent (${result.provider})` : `failed: ${result.message}`} to …${phone.slice(-4)}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
