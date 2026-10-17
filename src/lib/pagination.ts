// Paging for the app's lists, the pure parts: reading ?page= from the URL, clamping it to the pages that exist,
// the skip/take for the query, the "101–200 of 1,000" range, which page numbers to show (with gaps), and the links
// (which keep every other search, filter and sort param). No imports; unit-tested in tests/pagination.test.mjs.
// The UI is src/components/seller/Pagination.tsx.

export const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE = 100_000;

type RawParam = string | string[] | number | null | undefined;

/** ?page= as a whole number ≥ 1 (junk, 0, negatives and huge numbers fall back sensibly). */
export function parsePage(raw: RawParam): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const page = typeof value === "number" ? Math.trunc(value) : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1;
}

/** How many pages `total` rows fill (always at least one, so an empty list is "page 1 of 1"). */
export function pageCount(total: number, size = DEFAULT_PAGE_SIZE): number {
  const perPage = Math.max(1, Math.trunc(size) || 1);
  return Math.max(1, Math.ceil(Math.max(0, total) / perPage));
}

/** The page to show: past the end goes to the last page, before the start to the first. */
export function clampPage(page: number, total: number, size = DEFAULT_PAGE_SIZE): number {
  return Math.min(Math.max(1, Math.trunc(page) || 1), pageCount(total, size));
}

export interface PageWindow {
  page: number;
  pages: number;
  size: number;
  total: number;
  /** Rows to skip and take in the query. */
  skip: number;
  take: number;
  /** 1-based first and last row on this page; both 0 when there are no rows. */
  from: number;
  to: number;
}

/** Everything a list needs for one page: the clamped page, the query's skip/take and the range shown. */
export function pageWindow(rawPage: RawParam, total: number, size = DEFAULT_PAGE_SIZE): PageWindow {
  const perPage = Math.max(1, Math.trunc(size) || 1);
  const count = Math.max(0, Math.trunc(total) || 0);
  const page = clampPage(parsePage(rawPage), count, perPage);
  const skip = (page - 1) * perPage;
  return {
    page,
    pages: pageCount(count, perPage),
    size: perPage,
    total: count,
    skip,
    take: perPage,
    from: count ? skip + 1 : 0,
    to: Math.min(skip + perPage, count),
  };
}

/** One page of an array already in memory (lists that are small or come from JSON, not a table). */
export function pageSlice<T>(rows: readonly T[], rawPage: RawParam, size = DEFAULT_PAGE_SIZE): { rows: T[]; window: PageWindow } {
  const window = pageWindow(rawPage, rows.length, size);
  return { rows: rows.slice(window.skip, window.skip + window.take), window };
}

/** Page numbers to show: always the first and last, the current one with `around` neighbours, gaps between. */
export function pageNumbers(current: number, totalPages: number, around = 1): Array<number | "gap"> {
  const last = Math.max(1, totalPages);
  const page = Math.min(Math.max(1, current), last);
  const wanted = new Set<number>([1, last]);
  for (let n = page - around; n <= page + around; n++) if (n >= 1 && n <= last) wanted.add(n);
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  for (const n of sorted) {
    const prev = out[out.length - 1];
    // A gap of exactly one page shows that page instead of "…".
    if (typeof prev === "number" && n - prev === 2) out.push(n - 1);
    else if (typeof prev === "number" && n - prev > 2) out.push("gap");
    out.push(n);
  }
  return out;
}

export type PageParams = Record<string, string | string[] | number | null | undefined>;

/**
 * The link to `page` of a list at `base`, keeping the other params (empty ones are dropped). Page 1 has no
 * ?page= so a list's first page has one address. `pageParam` names the param for pages with two lists.
 */
export function pageHref(base: string, params: PageParams, page: number, pageParam = "page"): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === pageParam || value === null || value === undefined || value === "") continue;
    if (Array.isArray(value)) value.forEach((item) => item && query.append(key, item));
    else query.set(key, String(value));
  }
  if (page > 1) query.set(pageParam, String(Math.trunc(page)));
  const text = query.toString();
  return text ? `${base}?${text}` : base;
}
