// The product form's "Visibility and channels" tab shows where the product really sells (the website plus the Sell
// everywhere platforms, no "Marketplace" we don't have), and links from the pre-orders list open the Preorder settings.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("channels come from Sell everywhere, not made-up checkboxes", () => {
  const form = read("src/app/components/ProductForm.tsx");
  assert.doesNotMatch(form, /label: "Marketplace"/);
  assert.doesNotMatch(form, /toggleSalesChannel/);
  assert.match(form, /channels\.map\(\(channel\) =>/);
  assert.match(form, /href="\/channels"/);
  assert.match(form, /salesChannel: product\?\.salesChannel \?\? "website"/, "the saved value is kept, not rewritten");
  const view = read("src/lib/sales-channels/product-view.server.ts");
  assert.match(view, /card\.state\.kind !== "soon"/, "only platforms this server can connect");
  for (const page of ["src/app/products/[id]/page.tsx", "src/app/products/new/page.tsx"]) assert.match(read(page), /channels=\{channels\}/, page);
});

test("pre-order links open the Preorder settings", () => {
  const form = read("src/app/components/ProductForm.tsx");
  assert.match(form, /const HASH_TABS: Record<string, number> = \{ channels: 1, preorder: 2 \}/);
  assert.equal(JSON.parse(`[${form.match(/const TABS = \[(.*?)\];/)[1]}]`)[2], "Price and stock");
  assert.match(form, /<Section id="preorder"/);
  assert.match(form, /window\.addEventListener\("hashchange", open\)/);
  assert.match(read("src/app/products/page.tsx"), /filter\.key === "preorder" \? `\/products\/\$\{p\.id\}#preorder`/);
  assert.match(read("src/app/home/preorders/page.tsx"), /#preorder/);
});

test("phone app: pre-order taps open the product at its Preorder settings", () => {
  const screen = read("apps/mobile/src/app/product/[id].tsx");
  assert.match(screen, /useLocalSearchParams<\{ id: string; section\?: string \}>/);
  assert.match(screen, /section !== "preorder"/);
  assert.equal((screen.match(/<View onLayout=\{jumpTo\}>/g) ?? []).length, 2, "own and dropship preorder parts");
  assert.match(screen, /scrollRef=\{scrollRef\}/);
  assert.match(read("apps/mobile/src/components/Screen.tsx"), /ref=\{scrollRef\}/);
  assert.match(read("apps/mobile/src/app/preorders.tsx"), /params: \{ id: group\.productId, section: "preorder" \}/);
  assert.match(read("apps/mobile/src/app/(tabs)/products.tsx"), /section=\{query\.show === "preorder" \? "preorder" : undefined\}/);
  assert.match(read("apps/mobile/src/components/seller/StockRows.tsx"), /params: section \? \{ id: product\.id, section \}/);
});
