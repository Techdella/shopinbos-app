// Paging for the app's lists (src/lib/pagination.ts): reading ?page=, clamping it, the skip/take and range shown,
// the page numbers with gaps, and links that keep the list's other params. Plus: the capped seller lists page.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const p = await import("../src/lib/pagination.ts");

test("?page= becomes a whole page number of at least 1", () => {
  assert.equal(p.parsePage(undefined), 1);
  assert.equal(p.parsePage(""), 1);
  assert.equal(p.parsePage("abc"), 1);
  assert.equal(p.parsePage("0"), 1);
  assert.equal(p.parsePage("-3"), 1);
  assert.equal(p.parsePage("2"), 2);
  assert.equal(p.parsePage("7.9"), 7);
  assert.equal(p.parsePage(["4", "9"]), 4);
  assert.equal(p.parsePage(3), 3);
  assert.equal(p.parsePage("99999999"), 100_000);
});

test("page count and clamping: an empty list is page 1 of 1, past the end shows the last page", () => {
  assert.equal(p.pageCount(0, 50), 1);
  assert.equal(p.pageCount(50, 50), 1);
  assert.equal(p.pageCount(51, 50), 2);
  assert.equal(p.pageCount(1000, 100), 10);
  assert.equal(p.clampPage(0, 1000, 100), 1);
  assert.equal(p.clampPage(5, 1000, 100), 5);
  assert.equal(p.clampPage(11, 1000, 100), 10);
  assert.equal(p.clampPage(3, 0, 100), 1);
});

test("page window: skip/take for the query and the 101–200 of 1,000 range", () => {
  assert.deepEqual(p.pageWindow("2", 1000, 100), { page: 2, pages: 10, size: 100, total: 1000, skip: 100, take: 100, from: 101, to: 200 });
  const last = p.pageWindow("10", 1000, 100);
  assert.equal(last.from, 901);
  assert.equal(last.to, 1000);
  const partial = p.pageWindow("3", 120, 50);
  assert.deepEqual([partial.page, partial.skip, partial.from, partial.to], [3, 100, 101, 120]);
  const beyond = p.pageWindow("40", 120, 50);
  assert.deepEqual([beyond.page, beyond.skip, beyond.from, beyond.to], [3, 100, 101, 120]);
  const empty = p.pageWindow("4", 0, 50);
  assert.deepEqual([empty.page, empty.pages, empty.skip, empty.from, empty.to], [1, 1, 0, 0, 0]);
});

test("page slice: one page of an in-memory list", () => {
  const rows = Array.from({ length: 7 }, (_, i) => i + 1);
  assert.deepEqual(p.pageSlice(rows, "2", 3).rows, [4, 5, 6]);
  assert.deepEqual(p.pageSlice(rows, "3", 3).rows, [7]);
  assert.deepEqual(p.pageSlice(rows, "9", 3).rows, [7]);
  assert.equal(p.pageSlice(rows, "9", 3).window.page, 3);
  assert.deepEqual(p.pageSlice([], "2", 3).rows, []);
});

test("page numbers: first, last, the current page and its neighbours, with gaps", () => {
  assert.deepEqual(p.pageNumbers(1, 1), [1]);
  assert.deepEqual(p.pageNumbers(1, 3), [1, 2, 3]);
  assert.deepEqual(p.pageNumbers(1, 20), [1, 2, "gap", 20]);
  assert.deepEqual(p.pageNumbers(10, 20), [1, "gap", 9, 10, 11, "gap", 20]);
  assert.deepEqual(p.pageNumbers(20, 20), [1, "gap", 19, 20]);
  // A gap of one page shows that page instead of "…".
  assert.deepEqual(p.pageNumbers(3, 20), [1, 2, 3, 4, "gap", 20]);
  assert.deepEqual(p.pageNumbers(50, 5), [1, "gap", 4, 5]);
});

test("page links keep the list's search and filters, drop empty ones, and page 1 has no ?page=", () => {
  assert.equal(p.pageHref("/home/orders", {}, 1), "/home/orders");
  assert.equal(p.pageHref("/home/orders", { filter: "unpaid", q: "ada", page: "7" }, 3), "/home/orders?filter=unpaid&q=ada&page=3");
  assert.equal(p.pageHref("/home/orders", { filter: "unpaid", q: "", status: undefined, x: null }, 1), "/home/orders?filter=unpaid");
  assert.equal(p.pageHref("/home/reviews", { q: "a&b" }, 2), "/home/reviews?q=a%26b&page=2");
  assert.equal(p.pageHref("/x", { tag: ["a", "b"] }, 2, "p"), "/x?tag=a&tag=b&p=2");
});

test("capped seller lists page through every row with the shared pagination", () => {
  const pages = [
    "src/app/home/orders/page.tsx",
    "src/app/home/customers/page.tsx",
    "src/app/home/invoices/page.tsx",
    "src/app/products/page.tsx",
    "src/app/home/inventory/page.tsx",
    "src/app/home/marketing/subscribers/SubscribersManager.tsx",
    "src/app/home/payment-links/PaymentLinksManager.tsx",
    "src/app/home/reviews/page.tsx",
    "src/app/home/commerce/cart/page.tsx",
    "src/app/home/activity/page.tsx",
    "src/app/home/payouts/page.tsx",
    "src/app/home/forms/page.tsx",
    "src/app/home/marketing/campaigns/page.tsx",
    "src/app/home/labels/orders/page.tsx",
    "src/app/home/cms/[collectionId]/page.tsx",
    "src/app/home/video/VideoHub.tsx",
    "src/app/logistics/bookings/page.tsx",
    "src/app/supplier/quote-requests/page.tsx",
  ];
  for (const file of pages) assert.match(read(file), /<Pagination\b/, file);
  // No list says "the latest 100" any more.
  assert.doesNotMatch(read("shared/i18n/messages/orders/en.ts"), /Showing the latest \{shown\} of \{total\} orders/);
  assert.doesNotMatch(read("src/app/home/orders/page.tsx"), /take: PAGE_SIZE \}/);
  // Payment links filter in the query, not over a capped fetch in the browser.
  assert.doesNotMatch(read("src/app/home/payment-links/PaymentLinksManager.tsx"), /links\.filter\(/);
});
