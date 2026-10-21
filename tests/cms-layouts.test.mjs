// CMS layouts (src/lib/cms/layouts.ts): the list and page layouts a collection can pick, an item's own override,
// and the rich text editor no longer waiting forever on "Loading editor".
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const l = await import("../src/lib/cms/layouts.ts");

test("an item's own layout wins, anything else falls back to the collection's", () => {
  assert.equal(l.itemLayoutOf({ _layout: "sidebar" }, "classic"), "sidebar");
  assert.equal(l.itemLayoutOf({ _layout: "nope" }, "wide"), "wide");
  assert.equal(l.itemLayoutOf({}, "minimal"), "minimal");
  assert.equal(l.itemLayoutOf(null, "classic"), "classic");
});

test("the seller's item list shows rows for the list-style layouts and cards otherwise", () => {
  assert.equal(l.adminView("list"), "list");
  assert.equal(l.adminView("compact"), "list");
  assert.equal(l.adminView("grid"), "grid");
  assert.equal(l.adminView("magazine"), "grid");
});

test("the layout key can't clash with a field key (fields always start with a letter)", () => {
  assert.match(l.ITEM_LAYOUT_KEY, /^[^a-z]/);
});

test("the server accepts every layout and keeps the item's override", () => {
  const server = read("src/lib/cms/server.ts");
  assert.match(server, /layout: z\.enum\(LIST_LAYOUTS\)/);
  assert.match(server, /itemLayout: z\.enum\(ITEM_LAYOUTS\)/);
  assert.match(server, /withItemLayout\(values\.data, body\.layout, existing\?\.data\)/);
});

test("the rich text editor reads its toolbar state from the live editor, not only the first snapshot", () => {
  const editor = read("src/components/cms/RichTextEditor.tsx");
  assert.match(editor, /const e = snapshot \?\? editor;/);
  assert.match(editor, /rte\.html/);
});

test("videos from the media library survive sanitising and render as a <video>", async () => {
  const { sanitizeDoc, renderDoc } = await import("../src/lib/cms/richtext.ts");
  const doc = sanitizeDoc({ type: "doc", content: [{ type: "video", attrs: { src: "https://cdn.example.com/a.mp4", title: "Our shop", onload: "x" } }, { type: "video", attrs: { src: "javascript:alert(1)" } }] });
  assert.deepEqual(doc.content, [{ type: "video", attrs: { src: "https://cdn.example.com/a.mp4", title: "Our shop" } }]);
  const html = renderDoc(doc);
  assert.match(html, /<video src="https:\/\/cdn\.example\.com\/a\.mp4" controls preload="metadata" playsinline><\/video><figcaption>Our shop<\/figcaption>/);
});

test("adding a picture or video in a post goes through the media library first", () => {
  const editor = read("src/components/cms/RichTextEditor.tsx");
  assert.doesNotMatch(editor, /type="file"/);
  assert.match(editor, /setLibrary\("insert"\)/);
  const item = read("src/app/home/cms/[collectionId]/[itemId]/ItemEditor.tsx");
  assert.doesNotMatch(item, /type="file"/);
  const fields = read("src/app/home/cms/[collectionId]/[itemId]/FieldInput.tsx");
  for (const name of ["ImageInput", "GalleryInput", "VideoInput"]) {
    const body = fields.slice(fields.indexOf(`function ${name}(`), fields.indexOf("\nfunction ", fields.indexOf(`function ${name}(`) + 1));
    assert.doesNotMatch(body, /useUpload\(/, `${name} uploads without the library`);
    assert.match(body, /MediaLibraryDialog/, `${name} opens the library`);
  }
});
