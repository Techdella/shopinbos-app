// scripts/move-blank-starter-stores.ts over Supabase REST, for when only the project URL and service-role key are to
// hand (no DATABASE_URL). Same move (src/lib/themes/apply.ts); the notice goes to the bell only, since email and push
// need the app's provider keys. Safe to re-run.
//
//   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/move-blank-starter-stores-rest.ts [--dry-run] [--store <id>] [--no-notify]

import { randomUUID } from "node:crypto";
import { blankStarterNotice, planBlankStarterMove, type ThemeStoreData } from "../src/lib/themes/apply";

const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const NOTIFY = !args.includes("--no-notify");
const ONLY = args.includes("--store") ? args[args.indexOf("--store") + 1] : null;

if (!SUPABASE || !KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${SUPABASE}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } });
  if (!response.ok) throw Object.assign(new Error(`${init.method ?? "GET"} ${path}: ${response.status} ${await response.text()}`), { status: response.status });
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

type StoreRow = { id: string; userId: string; name: string; logoUrl: string | null; currency: string | null; brandSettings: unknown };

async function main() {
  const filter = ONLY
    ? `id=eq.${encodeURIComponent(ONLY)}`
    : "or=(brandSettings->editor->draft->>templateId.eq.blank,brandSettings->editor->published->>templateId.eq.blank)";
  const stores: StoreRow[] = await rest(`Store?select=id,userId,name,logoUrl,currency,brandSettings&${filter}&order=createdAt.asc`);
  console.log(`${stores.length} store(s) to check${DRY ? " (dry run: nothing is written)" : ""}.`);
  const counts = { moved: 0, live: 0, notified: 0, skipped: 0 };

  for (const store of stores) {
    const storeProducts: ThemeStoreData["storeProducts"] = await rest(
      `StoreProduct?select=id,name,description,images,retailPrice,currency&storeId=eq.${store.id}&status=neq.archived&order=createdAt.desc&limit=8`,
    );
    const plan = planBlankStarterMove({ ...store, storeProducts });
    if (plan.result === "skipped") {
      counts.skipped += 1;
      console.log(`  ${store.id} ${store.name}: skipped (${plan.reason})`);
      continue;
    }
    counts.moved += 1;
    if (plan.live) counts.live += 1;

    let notified = false;
    if (!DRY) {
      await rest(`Store?id=eq.${store.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ brandSettings: plan.brandSettings, updatedAt: new Date().toISOString() }),
      });
      if (plan.live && NOTIFY) {
        const notice = blankStarterNotice(store.id, store.name, plan.themeId, plan.themeName);
        try {
          await rest("Notification", {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ id: randomUUID(), userId: store.userId, priority: "info", category: "account", ...notice }),
          });
          notified = true;
        } catch (error) {
          // 409: already told (the dedupe key is unique per person).
          if ((error as { status?: number }).status !== 409) console.error(`  ${store.id}: notice failed`, error);
        }
      }
      if (notified) counts.notified += 1;
    }
    console.log(`  ${store.id} ${store.name}: ${plan.themeName} (${plan.themeId}), ${plan.live ? "live: draft only" : "not live: applied"}, ${plan.carriedSections} section(s) of their own carried${notified ? ", notified" : ""}`);
  }
  console.log(`${DRY ? "Would move" : "Moved"} ${counts.moved} (${counts.live} live${DRY ? "" : `, ${counts.notified} notified`}); skipped ${counts.skipped}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
