# App languages (shared/i18n)

> **Translation quality rules**
>
> - Every non-English text is **machine-drafted by Claude** and marked `// Draft: needs native-speaker review` at the
>   top of its file. Keep that line until a native speaker has checked the file.
> - Write the way people talk in a Lagos market or on WhatsApp: **natural everyday register**, short sentences,
>   not formal, literary or "church" language.
> - **Keep standard commerce terms in English** when Nigerians actually say them in English inside their own
>   language and there's no common local word: order, dropship, payout, campaign, segment, inventory, checkout,
>   template, domain, SKU, COD, escrow, settlement, ads, budget, subscribers, affiliates, wholesale, quote
>   requests, rider… (e.g. Yorùbá "Àwọn order", Hausa "Wholesale orders", Igbo "Payouts"). The glossary's `term`
>   is never translated: it's the word people learn.
> - **Correct letters**: Yorùbá subdots ẹ ọ ṣ and tone marks where they're commonly written (Ẹ kú àbọ̀,
>   ọjà, owó); Hausa hooked letters ɓ ɗ ƙ (and ʼy where needed); Igbo dotted vowels ị ọ ụ and ṅ.
> - Names, prices (₦), places, codes (SALLAH20, DRS-RED-M) and brand names (Shopinbos, Peggy, Rex, WhatsApp) stay
>   as they are. Keep every `{placeholder}` and plural exactly; the test fails otherwise.
> - Nigerian Pidgin (`pcm`) is written the common way ("wetin", "dey", "don", "una"), not Naijá academic spelling.

## Languages

| Code  | English name     | Native name | Numbers / dates |
|-------|------------------|-------------|-----------------|
| `en`  | English          | English     | en-NG           |
| `pcm` | Nigerian Pidgin  | Pidgin      | en-NG           |
| `yo`  | Yoruba           | Yorùbá      | yo-NG (else en-NG) |
| `ha`  | Hausa            | Hausa       | ha-NG (else en-NG) |
| `ig`  | Igbo             | Igbo        | ig-NG (else en-NG) |

Money is always NGN (`formatMoney(12500, locale)` → `₦12,500`), dates in Africa/Lagos time.

## How it fits together

```
shared/i18n/index.ts            pure core: LANGUAGES, Locale, isLocale, negotiateLocale, createT, formatMessage,
                                formatMoney / formatNumber / formatDate / formatRelative   (no imports)
shared/i18n/messages/<ns>/      en.ts (source of truth) + pcm.ts yo.ts ha.ts ig.ts + index.ts
shared/i18n/catalog.ts          registers namespaces; tFor(locale, ...ns), mergedMessages()
shared/i18n/nav.ts              sidebar labels (src/lib/nav.ts stays English) → "nav" keys
shared/i18n/learn.ts            translateTerm / translateIntro for the glossary and 60-second intros

web   src/lib/i18n/server.ts    getLocale() (sib_lang cookie → Accept-Language), getT(...ns), localeForUser(),
                                getTFor(locale, ...ns) for emails
      src/components/i18n/I18nProvider.tsx   useT(...ns), useLocale(), useSetLocale() — mounted in src/app/layout.tsx
      src/components/i18n/LanguagePicker.tsx  <LanguagePicker variant="list|compact|globe" />, <LanguageSettingsCard />
phone apps/mobile/src/lib/i18n.tsx        useT(...ns), useLocale(), useSetLocale() — mounted in app/_layout.tsx
      apps/mobile/src/components/LanguagePicker.tsx  <LanguageSheet />, <LanguageRow />, <LanguageButton />
```

The choice is saved in `User.preferences.language` (`PATCH /api/app/preferences { language }`, which also sets the
`sib_lang` cookie). The web reads the cookie on the server so the first paint is translated; a signed-in person on
a new browser gets their saved language on the first load (the provider fetches it once and refreshes). Signed-out
visitors get the cookie or Accept-Language; the phone uses its saved choice, the account's, or the phone language.

## Messages

- Keys are flat strings: `"save"`, `"status.paid"`, `"segments.1.caption"`.
- Placeholders: `"Hi {name}"` → `t("hi", { name })`. Numbers are formatted (`1,200`).
- **Plurals (ICU style, the only form we use):**
  `"{count, plural, =0 {No orders} one {# order} other {# orders}}"`. `#` is the number. Branches: `=N`, `zero`,
  `one`, `two`, `few`, `many` (the language's plural rules) and **`other` (always required)**. Yorùbá and Igbo
  have no singular form, so they normally only need `other` (`"{count, plural, other {order #}}"`).
- No literal `{` or `}` in messages.
- A key missing in a language shows English; a key missing in English shows the key and warns in development.
- For keys built at runtime use `t.dynamic(key, englishFallback)` (no type check, never warns).

## Translating a screen (phase 2)

1. **Pick a namespace** per area, e.g. `orders`. Create `shared/i18n/messages/orders/`:
   - `en.ts`: `const en = { title: "Orders", empty: "No orders yet", … } satisfies Record<string, string>; export default en;`
   - `pcm.ts`, `yo.ts`, `ha.ts`, `ig.ts`: start with `// Draft: needs native-speaker review`, then
     `import type en from "./en.ts"; const yo: Partial<Record<keyof typeof en, string>> = { … }; export default yo;`
   - `index.ts`: copy from `messages/common/index.ts`.
2. **Register it** in `shared/i18n/catalog.ts`: one `import orders from "./messages/orders/index.ts";` line and one
   `orders,` entry in `CATALOGS`. (Each area owns its folder, so parallel work only meets on those two lines.)
3. **Replace literals** with `t("key")`:
   - server component / route handler: `const t = await getT("orders", "common");` (`@/lib/i18n/server`)
   - client component: `const t = useT("orders", "common");` (`@/components/i18n/I18nProvider`)
   - phone: `const t = useT("orders", "common");` (`@/lib/i18n`)
   - money/dates: `formatMoney(amount, locale)`, `formatDate(date, locale)`, `formatRelative(date, locale)` with
     `useLocale()` / `await getLocale()`.
   Reuse `common` for buttons, statuses and time words instead of re-adding them.
4. **Keep the standard terms** (see the rules above) and keep English strings that tests read where they live
   (e.g. nav labels stay in `src/lib/nav.ts` and are translated at render).
5. **Run the coverage test**: `node --test tests/i18n.test.mjs` — it lists every missing key per language,
   extra keys, placeholder mismatches and plurals without `other`.

Glossary and intro sentences come from `shared/glossary.ts` and `shared/feature-intros.ts`: after editing those,
run `node scripts/i18n-learn-catalog.mjs` to regenerate the English `glossary`/`intros` catalogs, then translate
the new keys.

## Notes

- The web provider receives one language's messages (all namespaces, English filling gaps) from the root layout,
  once per full page load. If that grows too big, split namespaces per route segment with a nested provider.
- Emails: `localeForUser(user)` + `getTFor(locale, "emails")` in `src/lib/i18n/server.ts` are ready for the email
  shell; emails are still English.
