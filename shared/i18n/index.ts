// App-wide languages: the pure, import-free core shared by the web app (src/lib/i18n, src/components/i18n) and
// the phone app (apps/mobile/src/lib/i18n.tsx). Message catalogs live in shared/i18n/messages/<namespace>/<locale>.ts
// and are registered in shared/i18n/catalog.ts. How to translate a screen: shared/i18n/README.md.
// Unit-tested in tests/i18n.test.mjs.

// ─── Languages ──────────────────────────────────────────────────────────────

/**
 * The languages Shopinbos speaks. `name` is the English name, `nativeName` what speakers call it. `intl` is the
 * BCP 47 tag used for numbers, money and dates; Pidgin uses en-NG on purpose (ICU's Naijá data spells months in a
 * way most Pidgin readers don't use), and the others fall back to en-NG where the runtime's Intl lacks them.
 */
export const LANGUAGES = [
  { code: "en", name: "English", nativeName: "English", intl: "en-NG" },
  { code: "pcm", name: "Nigerian Pidgin", nativeName: "Pidgin", intl: "en-NG" },
  { code: "yo", name: "Yoruba", nativeName: "Yorùbá", intl: "yo-NG" },
  { code: "ha", name: "Hausa", nativeName: "Hausa", intl: "ha-NG" },
  { code: "ig", name: "Igbo", nativeName: "Igbo", intl: "ig-NG" },
] as const;

export type Locale = (typeof LANGUAGES)[number]["code"];
export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALES: readonly Locale[] = LANGUAGES.map((language) => language.code);

/** Cookie that carries the chosen language on the web (1 year, SameSite=Lax), read by server components. */
export const LOCALE_COOKIE = "sib_lang";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function languageOf(locale: Locale): Language {
  return LANGUAGES.find((language) => language.code === locale) ?? LANGUAGES[0];
}

function fold(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

const NAMES: Record<string, Locale> = { english: "en", pidgin: "pcm", "nigerian pidgin": "pcm", naija: "pcm", yoruba: "yo", hausa: "ha", igbo: "ig" };

/** "Yorùbá", "yoruba", "yo-NG", "pcm" → the locale; null for anything else. */
export function localeFromName(value: string | null | undefined): Locale | null {
  const raw = fold(value ?? "");
  if (!raw) return null;
  if (NAMES[raw]) return NAMES[raw]!;
  for (const language of LANGUAGES) if (fold(language.name) === raw || fold(language.nativeName) === raw) return language.code;
  const base = raw.split(/[-_]/)[0]!;
  return isLocale(base) ? base : null;
}

/**
 * The best language for an Accept-Language header ("yo-NG,yo;q=0.9,en;q=0.8") or a device's ordered locale list
 * (["ha-NG", "en-GB"]). Highest quality first, ties in the order given; English when nothing matches.
 */
export function negotiateLocale(input: string | readonly (string | null | undefined)[] | null | undefined): Locale {
  const entries: { tag: string; q: number; index: number }[] = [];
  const list = typeof input === "string" ? input.split(",") : [...(input ?? [])];
  list.forEach((item, index) => {
    if (typeof item !== "string") return;
    const [tag = "", ...params] = item.split(";").map((part) => part.trim());
    const qParam = params.find((param) => /^q=/i.test(param));
    const q = qParam ? Number(qParam.slice(2)) : 1;
    if (tag && tag !== "*" && Number.isFinite(q) && q > 0) entries.push({ tag, q, index });
  });
  entries.sort((a, b) => b.q - a.q || a.index - b.index);
  for (const entry of entries) {
    const locale = localeFromName(entry.tag);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

// ─── Messages ───────────────────────────────────────────────────────────────

/** A namespace's messages in one language: flat keys ("ui.skip", "segments.title") to text. */
export type Messages = Readonly<Record<string, string>>;
/** One namespace in every language. English is complete; the others may miss keys (English shows instead). */
export type Catalog = { readonly en: Messages } & { readonly [L in Exclude<Locale, "en">]?: Readonly<Partial<Record<string, string>>> };
export type Vars = Readonly<Record<string, string | number | null | undefined>>;

export interface TFunction<K extends string = string> {
  /** The message for `key` in this language (English when it isn't translated yet), with `{name}` filled in. */
  (key: K, vars?: Vars): string;
  /** For keys built at runtime (nav ids, intro keys): the message, else `fallback`, else the key. Never warns. */
  dynamic(key: string, fallback?: string, vars?: Vars): string;
  /** Whether any registered catalog has `key` (in English, which every key has). */
  has(key: string): boolean;
  readonly locale: Locale;
}

const isDev = (() => {
  try {
    // Inlined by Next.js and Metro; absent in some runtimes.
    const env = process.env.NODE_ENV;
    return env !== "production" && env !== "test";
  } catch {
    return false;
  }
})();
const warned = new Set<string>();

function warnMissing(key: string) {
  if (!isDev || warned.has(key)) return;
  warned.add(key);
  console.warn(`[i18n] Missing message "${key}". Add it to the English catalog in shared/i18n/messages/.`);
}

/** The raw message for a key: this language first, then English, across the catalogs in order. */
export function lookupMessage(locale: Locale, catalogs: readonly Catalog[], key: string): string | undefined {
  if (locale !== "en") {
    for (const catalog of catalogs) {
      const text = catalog[locale]?.[key];
      if (typeof text === "string" && text) return text;
    }
  }
  for (const catalog of catalogs) {
    const text = catalog.en[key];
    if (typeof text === "string") return text;
  }
  return undefined;
}

/**
 * A translate function for `locale` over one or more namespace catalogs (earlier catalogs win on a shared key).
 * Messages support `{name}` placeholders and plurals, see formatMessage.
 */
export function createT<K extends string = string>(locale: Locale, catalogs: Catalog | readonly Catalog[]): TFunction<K> {
  const list: readonly Catalog[] = Array.isArray(catalogs) ? catalogs : [catalogs as Catalog];
  const t = ((key: K, vars?: Vars) => {
    const text = lookupMessage(locale, list, key);
    if (text === undefined) {
      warnMissing(key);
      return key;
    }
    return formatMessage(text, vars, locale);
  }) as TFunction<K>;
  t.dynamic = (key, fallback, vars) => {
    const text = lookupMessage(locale, list, key);
    return text === undefined ? (fallback === undefined ? key : formatMessage(fallback, vars, locale)) : formatMessage(text, vars, locale);
  };
  t.has = (key) => list.some((catalog) => typeof catalog.en[key] === "string");
  Object.defineProperty(t, "locale", { value: locale, enumerable: true });
  return t;
}

// ─── Formatting messages ────────────────────────────────────────────────────
// Placeholders: "Hi {name}". Plurals (ICU style, the one form we use):
//   "{count, plural, =0 {No orders} one {# order} other {# orders}}"
// `#` is the number. Branches: =N (exact), zero/one/two/few/many (the language's plural rules), other (required).
// Braces are only for placeholders; a message can't show a literal { or }.

const pluralRules = new Map<string, Intl.PluralRules | null>();

function pluralCategory(locale: Locale, count: number): string {
  const tag = locale === "pcm" ? "en" : locale;
  if (!pluralRules.has(tag)) {
    try {
      pluralRules.set(tag, Intl.PluralRules.supportedLocalesOf([tag]).length ? new Intl.PluralRules(tag) : new Intl.PluralRules("en"));
    } catch {
      pluralRules.set(tag, null);
    }
  }
  const rules = pluralRules.get(tag);
  return rules ? rules.select(count) : count === 1 ? "one" : "other";
}

/** The matching `}` for the `{` at `open`, or -1. */
function closingBrace(text: string, open: number) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

/** "=0 {none} one {# thing} other {# things}" → { "=0": "none", one: "# thing", other: "# things" } */
export function parsePluralBranches(body: string): Record<string, string> {
  const branches: Record<string, string> = {};
  let i = 0;
  while (i < body.length) {
    const match = /^\s*(=\d+|zero|one|two|few|many|other)\s*\{/.exec(body.slice(i));
    if (!match) break;
    const open = i + match[0].length - 1;
    const close = closingBrace(body, open);
    if (close < 0) break;
    branches[match[1]!] = body.slice(open + 1, close);
    i = close + 1;
  }
  return branches;
}

function show(value: string | number, locale: Locale) {
  return typeof value === "number" ? formatNumber(value, locale) : value;
}

export function formatMessage(template: string, vars: Vars | undefined, locale: Locale = DEFAULT_LOCALE): string {
  if (!template.includes("{")) return template;
  let out = "";
  let i = 0;
  while (i < template.length) {
    const open = template.indexOf("{", i);
    if (open < 0) {
      out += template.slice(i);
      break;
    }
    out += template.slice(i, open);
    const close = closingBrace(template, open);
    if (close < 0) {
      out += template.slice(open);
      break;
    }
    const inner = template.slice(open + 1, close);
    const plural = /^\s*(\w+)\s*,\s*plural\s*,([\s\S]*)$/.exec(inner);
    if (plural) {
      const value = vars?.[plural[1]!];
      const count = typeof value === "number" ? value : Number(value);
      const branches = parsePluralBranches(plural[2]!);
      const branch = Number.isFinite(count) ? branches[`=${count}`] ?? branches[pluralCategory(locale, count)] ?? branches.other : branches.other;
      out += branch === undefined ? "" : formatMessage(branch.replace(/#/g, Number.isFinite(count) ? formatNumber(count, locale) : ""), vars, locale);
    } else {
      const name = inner.trim();
      const value = vars?.[name];
      out += value === undefined || value === null ? `{${name}}` : show(value, locale);
    }
    i = close + 1;
  }
  return out;
}

/** The placeholder names a message uses ("{name}", plural counts), for the catalog tests. */
export function placeholdersOf(template: string): string[] {
  const names = new Set<string>();
  const walk = (text: string) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) return;
      const close = closingBrace(text, open);
      if (close < 0) return;
      const inner = text.slice(open + 1, close);
      const plural = /^\s*(\w+)\s*,\s*plural\s*,([\s\S]*)$/.exec(inner);
      if (plural) {
        names.add(plural[1]!);
        for (const branch of Object.values(parsePluralBranches(plural[2]!))) walk(branch);
      } else names.add(inner.trim());
      i = close + 1;
    }
  };
  walk(template);
  return [...names].sort();
}

// ─── Numbers, money and dates ───────────────────────────────────────────────

export const APP_TIME_ZONE = "Africa/Lagos";
const intlTags = new Map<Locale, string>();

/** The Intl tag for a locale: its own when this runtime supports it, else en-NG. */
export function intlLocale(locale: Locale): string {
  const cached = intlTags.get(locale);
  if (cached) return cached;
  const wanted = languageOf(locale).intl;
  let tag = "en-NG";
  try {
    if (Intl.NumberFormat.supportedLocalesOf([wanted]).length && Intl.DateTimeFormat.supportedLocalesOf([wanted]).length) tag = wanted;
  } catch {
    // Intl without locale data (some Android builds): en-NG.
  }
  intlTags.set(locale, tag);
  return tag;
}

export function formatNumber(value: number, locale: Locale = DEFAULT_LOCALE, options?: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(intlLocale(locale), options).format(value);
  } catch {
    return String(value);
  }
}

/** "₦12,500" (kobo only when there are any). */
export function formatMoney(amount: number, locale: Locale = DEFAULT_LOCALE, { currency = "NGN", decimals }: { currency?: string; decimals?: number } = {}): string {
  const digits = decimals ?? (Number.isInteger(amount) ? 0 : 2);
  try {
    return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount);
  } catch {
    return `${currency === "NGN" ? "₦" : `${currency} `}${amount.toFixed(digits)}`;
  }
}

function toDate(value: Date | string | number) {
  return value instanceof Date ? value : new Date(value);
}

/** A date (and time, when asked) in Lagos time. Default "13 Oct 2026". */
export function formatDate(value: Date | string | number, locale: Locale = DEFAULT_LOCALE, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: APP_TIME_ZONE, ...options }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86400],
  ["month", 30 * 86400],
  ["week", 7 * 86400],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

/** "yesterday", "in 3 days", "5 minutes ago" in the locale (en-NG wording where Intl lacks the language). */
export function formatRelative(value: Date | string | number, locale: Locale = DEFAULT_LOCALE, now: Date | number = Date.now()): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.round((date.getTime() - toDate(now).getTime()) / 1000);
  const tag = intlLocale(locale);
  try {
    const rtf = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
    for (const [unit, size] of UNITS) {
      if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
    }
    return rtf.format(0, "second");
  } catch {
    return formatDate(date, locale);
  }
}
