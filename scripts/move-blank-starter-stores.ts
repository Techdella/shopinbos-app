// One-off: move every store still on the old "blank" setup starter (the split hero with empty colour tiles) onto a
// free theme that fits what it sells (Afẹ́fẹ́ when nothing fits). The seller's own words, images, products and pages
// come across. A store that never went live takes the theme straight away; a live store gets it as a draft, and the
// seller is notified (bell + email) with a link to preview and publish it. Safe to re-run.
//
//   npx tsx --conditions=react-server --env-file=.env.local scripts/move-blank-starter-stores.ts --dry-run
//   npx tsx --conditions=react-server --env-file=.env.local scripts/move-blank-starter-stores.ts
//
// Options: --dry-run (report only, write nothing), --store <id> (just that store), --no-notify (move without telling).
// Needs DATABASE_URL, plus the notification provider keys for the emails.

import { findBlankStarterStores, moveStoreOffBlankStarter } from "../src/lib/themes/apply.server";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const notifySellers = !args.includes("--no-notify");
const storeIndex = args.indexOf("--store");
const onlyStore = storeIndex >= 0 ? args[storeIndex + 1] : null;

async function main() {
  const ids = onlyStore ? [onlyStore] : await findBlankStarterStores();
  console.log(`${ids.length} store(s) on the blank starter${dryRun ? " (dry run: nothing is written)" : ""}.`);
  const counts = { moved: 0, live: 0, notified: 0, skipped: 0 };
  for (const id of ids) {
    const outcome = await moveStoreOffBlankStarter(id, { dryRun, notify: notifySellers });
    if (outcome.result === "skipped") {
      counts.skipped += 1;
      console.log(`  ${id}: skipped (${outcome.reason})`);
      continue;
    }
    counts.moved += 1;
    if (outcome.live) counts.live += 1;
    if (outcome.notified) counts.notified += 1;
    console.log(`  ${id}: ${outcome.themeName} (${outcome.themeId}), ${outcome.live ? "live: draft only" : "not live: applied"}, ${outcome.carriedSections} section(s) of their own carried${outcome.notified ? ", notified" : ""}`);
  }
  console.log(`${dryRun ? "Would move" : "Moved"} ${counts.moved} (${counts.live} live${dryRun ? "" : `, ${counts.notified} notified`}); skipped ${counts.skipped}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
