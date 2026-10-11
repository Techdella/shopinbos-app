import { z } from "zod";
import { ok } from "@/lib/api/response";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { parseCsv, rowsToSubscribers, type ImportColumn } from "@/lib/marketing/import";
import { MarketingError } from "@/lib/marketing/segments";
import { addSubscriber, cleanTags } from "@/lib/marketing/subscribers";

export const maxDuration = 120;

const COLUMNS = ["email", "name", "first_name", "last_name", "phone", "country", "tags", "birthday", "ignore"] as const;

const ImportSchema = z.object({
  csv: z.string().min(1, "Choose a CSV file").max(5_000_000, "That file is too big (5 MB max)"),
  columns: z.array(z.enum(COLUMNS)).max(60).optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
  consent: z.object({ email: z.literal(true, { message: "Confirm these people agreed to get your emails" }), sms: z.boolean().default(false), whatsapp: z.boolean().default(false) }),
  dryRun: z.boolean().default(false),
});

// CSV import. dryRun returns the detected columns and a preview; a real run adds or updates everyone.
// People who unsubscribed before stay unsubscribed.
export const POST = marketingRoute(async ({ req, store }) => {
  const input = await readBody(req, ImportSchema);
  const parsed = rowsToSubscribers(parseCsv(input.csv), input.columns as ImportColumn[] | undefined);
  if (!parsed.rows.length) throw new MarketingError("No email addresses found. Check the file has an email column.");
  if (parsed.rows.length > 20_000) throw new MarketingError("Import up to 20,000 people at a time");
  if (input.dryRun) return ok({ columns: parsed.columns, total: parsed.rows.length, skipped: parsed.skipped, preview: parsed.rows.slice(0, 8) });

  const extraTags = cleanTags(input.tags ?? []);
  let added = 0;
  let updated = 0;
  let failed = 0;
  for (const row of parsed.rows) {
    const result = await addSubscriber(
      store.id,
      { ...row, tags: [...row.tags, ...extraTags], source: "csv_upload", consent: { ...input.consent, text: "Imported from a CSV; the seller confirmed these people agreed" } },
      { optIn: false },
    ).catch(() => ({ ok: false as const, error: "failed" }));
    if (!result.ok) failed++;
    else if (result.created) added++;
    else updated++;
  }
  return ok({ added, updated, failed, skipped: parsed.skipped });
});
