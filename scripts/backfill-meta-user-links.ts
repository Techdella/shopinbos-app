// One-off: record which Facebook person connected each existing Meta connection (MetaUserLink), so Meta's
// Deauthorize and Data Deletion callbacks can find connections made before links were recorded. Safe to re-run.
//
//   npx tsx --conditions=react-server --env-file=.env.local scripts/backfill-meta-user-links.ts
//
// Needs DATABASE_URL, INBOX_ENCRYPTION_KEY (to read the stored tokens), META_APP_ID and META_APP_SECRET.
// Run after docs/migrations/2026-11-07-meta-user-data.sql.

import { backfillMetaUserLinks } from "../src/lib/meta/user-links.server";

backfillMetaUserLinks()
  .then(({ checked, linked }) => {
    console.log(`Checked ${checked} connection(s). Links recorded in total: ${linked}.`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
