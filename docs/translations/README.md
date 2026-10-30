# Translation review (native speakers)

Shopinbos speaks five languages: English (`en`, the source), Nigerian Pidgin (`pcm`), Yorùbá (`yo`), Hausa (`ha`)
and Igbo (`ig`). Every non-English message was **drafted by Claude**. In October 2026 we ran an automated and
partly manual quality pass over the messages added in the last few batches (placeholders, English left untranslated,
inconsistent words, labels too long for a button, product names and ₦ amounts). That pass is **not a substitute for
native speakers**: it can't tell whether a sentence sounds natural in a Lagos market, in Kano or in Onitsha, or
whether a word means the wrong thing. This folder is how a native speaker checks and corrects them.

## The review pack

`review-2026-10.csv` has one row per message that was added or changed between commit `a6f3928b` (2026-10-27)
and the end of October 2026: about 3,600 messages, in these columns:

| column      | what it is                                                                          |
|-------------|-------------------------------------------------------------------------------------|
| `namespace` | which part of the app (`storeEditor` is the phone's shop editor, `m_rexBuild` the phone onboarding "Rex builds your shop", `rexJobs` Rex's background jobs, …) |
| `key`       | the message's id inside that part. **Don't change it.**                             |
| `en`        | the English source. **Don't change it** (the import ignores English and skips a row whose English changed). |
| `pcm` `yo` `ha` `ig` | the current translation in each language: edit these                       |
| `notes`     | hints for you (`new` / `changed`, placeholders to keep, "short label or button", "edited in the 2026-10 quality pass: please check"); add your own comments here |

Open it in Google Sheets, Excel or LibreOffice (it's UTF-8 with a byte-order mark, so ẹ ọ ṣ, ɓ ɗ ƙ and ị ọ ụ ṅ
show correctly). Each reviewer only needs their own language's column.

## How to mark a correction

1. **Agree with a translation?** Leave the cell as it is.
2. **Want to change it?** Type the corrected text **in the same cell** (replace the old text). Don't add a new
   column or row.
3. **Not sure, or want to discuss?** Leave the cell and write your question in `notes`, starting with your
   language code, e.g. `yo: is "àsíá" right for a website banner?`.
4. Keep these exactly as they are, or the app shows broken text:
   - **Placeholders** in curly braces: `{name}`, `{count}`, `{when}`, `{url}`… They are filled in by the app. You
     may move them in the sentence, but never translate, rename or remove them.
   - **Plurals**: `{count, plural, one {# order} other {# orders}}`. Translate only the words inside the inner
     braces; keep `{count, plural,`, the `one` / `other` words and `#` (the number). Yorùbá and Igbo usually need
     only `other`: `{count, plural, other {order #}}`.
   - **Names**: Rex, Peggy, Shopinbos, Shopinbos Plug, WhatsApp, Paystack; codes like `SALLAH20`; ₦ amounts.
5. Write the way people really talk and type on WhatsApp: everyday words, not formal or church language. Common
   commerce words people say in English stay in English (order, payout, delivery, rider, credits, checkout…).
6. Buttons and short labels (see "short label or button" in `notes`) must stay short: about as long as the English.

When you're done, export/download the sheet as **CSV (UTF-8)** and send it back.

## Bringing corrections back into the app

The import reads the corrected CSV and updates `shared/i18n/messages/<namespace>/<language>.ts`. It is a **dry run
unless you add `--apply`**:

```bash
# 1. See what would change (nothing is written)
node scripts/i18n-import-review.mjs path/to/review-2026-10-yo.csv

# 2. Only some languages (e.g. the Yorùbá reviewer's file)
node scripts/i18n-import-review.mjs path/to/review-2026-10-yo.csv --langs=yo

# 3. Write the corrections
node scripts/i18n-import-review.mjs docs/translations/review-2026-10.csv --apply

# 4. Check every language again
npm test
```

What the import does:

- Changes only cells that differ from the catalog. Empty cells mean "no change".
- Never imports English. A row whose English differs from the app's English now (the message was changed after the
  export) is **skipped** and listed: review it again on the new English.
- **Refuses** a correction whose placeholders don't match the English (missing `{name}`, a translated `{count}`,
  unbalanced braces) and lists it; the exit code is 1 until those cells are fixed.
- Reports unknown namespaces or keys instead of creating them.

After applying, `npm test` runs `tests/i18n.test.mjs` and `tests/i18n-placeholders.test.mjs` (placeholder parity in
all five languages for every namespace, product names and ₦ amounts kept). When a native speaker has checked a whole
file, remove its `// Draft: needs native-speaker review` line (see `shared/i18n/README.md`).

## Making the next pack

```bash
node scripts/i18n-export-review.mjs <base-commit> docs/translations/review-YYYY-MM.csv
```

`<base-commit>` is the commit before the period (e.g. `git rev-list -1 --before="3 days ago" HEAD`). Every message
added or changed since then (in any language) goes in the pack, with notes.
