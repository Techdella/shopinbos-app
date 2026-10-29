// One-off: WhatsApp the "new look for your store" notice to live sellers moved off the blank starter who have no email
// (scripts/move-blank-starter-stores-rest.ts only reached the bell). Reads each store's bell notice and sends it
// the way notify() does, on WhatsApp Cloud (src/lib/notifications/notify.server.ts sendNotificationOnWhatsApp).
// The same send is a button in Admin › Sellers › a seller › Notices to the owner.
//
//   npx tsx --conditions=react-server --env-file=.env.local scripts/whatsapp-blank-starter-notice.ts --dry-run
//   npx tsx --conditions=react-server --env-file=.env.local scripts/whatsapp-blank-starter-notice.ts <storeId> [<storeId> …]
//
// With no store ids: every moved live store whose seller has no email. Needs DATABASE_URL and the WhatsApp keys
// (WHATSAPP_LEADS_* or WHATSAPP_OTP_*). Records each send as a NotificationDelivery, and skips one already sent.

import { db } from "../src/lib/db/client";
import { sendNotificationOnWhatsApp } from "../src/lib/notifications/notify.server";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const ids = args.filter((arg) => !arg.startsWith("--"));

async function main() {
  const notices = await db.notification.findMany({
    where: { dedupeKey: ids.length ? { in: ids.map((id) => `blank-starter-move:${id}`) } : { startsWith: "blank-starter-move:" } },
    select: { id: true, user: { select: { email: true, phone: true } } },
  });
  for (const notice of notices) {
    if (!ids.length && notice.user.email) continue;
    if (dryRun) {
      console.log(`  ${notice.id}: would send to ${notice.user.phone ? `…${notice.user.phone.slice(-4)}` : "(no phone)"}`);
      continue;
    }
    const result = await sendNotificationOnWhatsApp(notice.id);
    console.log(`  ${notice.id}: ${result.ok ? `sent (${result.provider}) to …${result.to.slice(-4)}` : result.error}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
