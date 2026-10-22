import "server-only";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { localeForUser } from "@/lib/i18n/server";
import { tFor } from "@shared/i18n/catalog";
import { briefForUser, briefTitles } from "./partner-brief.server";

// Peggy's morning brief for suppliers and delivery partners (/api/cron/morning-brief, once a day at 7:30 Lagos):
// one notification listing what needs them today, in their language, sent through notify() so it follows each
// person's channels and quiet hours. Nothing waiting, no notification. Once a day per account (dedupeKey).

const BATCH = 400;

export async function sendMorningBriefs(now = new Date()) {
  const day = now.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const users = await db.user.findMany({
    where: { role: { in: ["supplier", "logistics_partner"] }, OR: [{ supplier: { status: "active" } }, { logisticsPartner: { status: "active" } }] },
    select: { id: true, role: true, preferences: true },
    take: BATCH,
    orderBy: { createdAt: "asc" },
  });
  let sent = 0;
  for (const user of users) {
    try {
      const brief = await briefForUser(user, now);
      if (!brief?.peggy.length) continue;
      const locale = localeForUser(user);
      const titles = briefTitles(brief, "peggy", locale);
      const t = tFor(locale, "briefs");
      await createNotification({
        userId: user.id,
        type: brief.role === "partner" ? "logistics" : "suppliers",
        priority: brief.peggy.some((item) => item.urgent) ? "warning" : "info",
        title: t("morning.title", { count: titles.length }),
        description: titles.slice(0, 3).join(" · "),
        link: brief.role === "partner" ? "/logistics/dashboard" : "/supplier/dashboard",
        event: "brief.morning",
        dedupeKey: `brief.morning:${user.id}:${day}`,
      });
      sent += 1;
    } catch (error) {
      console.error("[morning brief]", user.id, error);
    }
  }
  return { checked: users.length, sent };
}
