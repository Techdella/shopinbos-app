// Media library ("Choose from my media"): the pure rules in shared/media.ts (what can be uploaded, how a library
// query is read, who may see or remove an entry, which pasted links count), and the wiring that keeps a person's
// library their own: every route is signed-in and scoped to user.id, removing only hides, uploads go through the same
// type / size / content checks as /api/upload, and the migration is additive and idempotent.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const media = await import("../shared/media.ts");

const ROOT = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(ROOT, path), "utf8");
const params = (query) => new URLSearchParams(query);
const MB = 1024 * 1024;

test("upload rules: allowed types, size limits, pictures-only fields", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]) {
    assert.equal(media.mediaFileProblem({ type, size: 1000 }), null, type);
    assert.equal(media.mediaFileProblem({ type, size: 1000 }, "image"), null, type);
  }
  for (const type of ["video/mp4", "video/webm", "video/ogg"]) {
    assert.equal(media.mediaFileProblem({ type, size: 1000 }), null, type);
    assert.match(media.mediaFileProblem({ type, size: 1000 }, "image"), /picture/i, `${type} refused where only pictures fit`);
  }
  for (const type of ["text/html", "application/pdf", "image/x-icon", "application/octet-stream", "", null, undefined]) {
    assert.ok(media.mediaFileProblem({ type, size: 1000 }), String(type));
  }
  assert.equal(media.mediaFileProblem({ type: "image/png", size: 10 * MB }), null, "exactly 10 MB is fine");
  assert.match(media.mediaFileProblem({ type: "image/png", size: 10 * MB + 1 }), /10MB/);
  assert.equal(media.mediaFileProblem({ type: "video/mp4", size: 80 * MB }), null);
  assert.match(media.mediaFileProblem({ type: "video/mp4", size: 80 * MB + 1 }), /80MB/);
  assert.match(media.mediaFileProblem({ type: "image/png", size: 0 }), /empty/);
  assert.equal(media.mediaKindOfType("IMAGE/PNG"), "image");
  assert.equal(media.mediaKindOfType("video/webm; codecs=vp9"), "video");
  assert.equal(media.mediaKindOfType("image/svg"), null);
});

test("library query: defaults, clamps and a safe search", () => {
  assert.deepEqual(media.parseMediaQuery(params("")), { q: "", kind: null, page: 1, limit: media.MEDIA_PAGE_SIZE });
  assert.deepEqual(media.parseMediaQuery(params("q=ankara&kind=video&page=3&limit=10")), { q: "ankara", kind: "video", page: 3, limit: 10 });
  assert.equal(media.parseMediaQuery(params("kind=pdf")).kind, null);
  assert.equal(media.parseMediaQuery(params("page=-4")).page, 1);
  assert.equal(media.parseMediaQuery(params("page=abc")).page, 1);
  assert.equal(media.parseMediaQuery(params("page=999999")).page, 1000);
  assert.equal(media.parseMediaQuery(params("limit=5000")).limit, media.MEDIA_MAX_PAGE_SIZE);
  assert.equal(media.parseMediaQuery(params("limit=0")).limit, media.MEDIA_PAGE_SIZE);
  // LIKE wildcards and control characters never reach the database; long searches are cut.
  assert.equal(media.parseMediaQuery(params("q=%25_%5C")).q, "");
  assert.equal(media.parseMediaQuery(params(`q=${"a".repeat(300)}`)).q.length, 80);
});

test("ownership: only the owner sees or removes an entry, and hidden ones stay hidden", () => {
  const mine = { userId: "user_a", hiddenAt: null };
  assert.equal(media.canSeeMedia(mine, "user_a"), true);
  assert.equal(media.canSeeMedia(mine, "user_b"), false, "someone else's");
  assert.equal(media.canSeeMedia(mine, ""), false);
  assert.equal(media.canSeeMedia(mine, null), false);
  assert.equal(media.canSeeMedia(null, "user_a"), false);
  assert.equal(media.canSeeMedia({ userId: "user_a", hiddenAt: new Date() }, "user_a"), false, "removed from the library");
});

test("pasted links: https only, no spaces, not absurdly long", () => {
  assert.equal(media.isHttpsMediaUrl("https://cdn.example.com/a.jpg"), true);
  assert.equal(media.isHttpsMediaUrl("http://cdn.example.com/a.jpg"), false);
  assert.equal(media.isHttpsMediaUrl("javascript:alert(1)"), false);
  assert.equal(media.isHttpsMediaUrl("data:image/png;base64,AAAA"), false);
  assert.equal(media.isHttpsMediaUrl("https://cdn.example.com/a b.jpg"), false);
  assert.equal(media.isHttpsMediaUrl(`https://x.com/${"a".repeat(2100)}`), false);
  assert.equal(media.isHttpsMediaUrl(42), false);
  assert.equal(media.mediaKindOfUrl("https://x.com/clip.MP4?v=1"), "video");
  assert.equal(media.mediaKindOfUrl("https://x.com/photo.webp"), "image");
});

test("small helpers: dimensions, display names, AI picture owners", () => {
  assert.equal(media.cleanDimension("1200"), 1200);
  assert.equal(media.cleanDimension(800), 800);
  assert.equal(media.cleanDimension("12.5"), null);
  assert.equal(media.cleanDimension("-3"), null);
  assert.equal(media.cleanDimension("999999"), null);
  assert.equal(media.cleanDimension(null), null);
  assert.equal(media.mediaDisplayName("IMG_2041.JPG"), "IMG_2041");
  assert.equal(media.mediaDisplayName("C:\\fakepath\\my<logo>.png"), "mylogo", "folder and markup dropped");
  assert.equal(media.mediaDisplayName(""), null);
  assert.equal(media.aiImageOwner("generated/ckuser123456/rex-hero-1.webp"), "ckuser123456");
  assert.equal(media.aiImageOwner("logos/ckuser123456/bold-1.webp"), "ckuser123456");
  assert.equal(media.aiImageOwner("enhanced/ckuser123456/1.webp"), "ckuser123456");
  assert.equal(media.aiImageOwner("products/1700000000-abc.png"), null);
  assert.equal(media.aiImageOwner("generated/../x/1.webp"), null);
});

test("routes are signed-in and scoped to the caller", () => {
  const list = read("src/app/api/app/media/route.ts");
  const one = read("src/app/api/app/media/[id]/route.ts");
  const lib = read("src/lib/media/library.server.ts");
  assert.match(list, /export const GET = withAuth\(/);
  assert.match(list, /export const POST = withAuth\(/);
  assert.match(list, /listMedia\(user\.id, query\)/);
  assert.match(list, /syncLibrary\(user\.id\)/);
  assert.match(list, /uploadToLibrary\(user\.id, file/);
  assert.match(list, /checkRateLimit\(`media-upload:\$\{user\.id\}`/);
  assert.match(one, /export const DELETE = withAuth\(/);
  assert.match(one, /hideMedia\(user\.id, id\)/);
  assert.match(one, /NOT_FOUND/);
  // Listing is the caller's own, visible rows; removing only hides, and only the caller's row.
  assert.match(lib, /const where = \{\s*userId,\s*hiddenAt: null/);
  assert.match(lib, /updateMany\(\{ where: \{ id, userId, hiddenAt: null \}, data: \{ hiddenAt: new Date\(\) \} \}\)/);
  assert.doesNotMatch(lib, /\.delete(Many)?\(/, "never deletes rows");
  assert.doesNotMatch(one, /removeFile|storage\.from/, "never deletes files");
});

test("uploads share /api/upload's checks and land in the library", () => {
  const lib = read("src/lib/media/library.server.ts");
  const upload = read("src/app/api/upload/route.ts");
  const storage = read("src/lib/supabase/storage.server.ts");
  // Same type/size rules; the bytes (and SVG script) are checked by uploadFileServer → assertUploadContent.
  assert.match(lib, /mediaFileProblem\(file, meta\.allow \?\? "any"\)/);
  assert.match(lib, /uploadFileServer\("brand", file, uploadPath\(`media\/\$\{userId\}`, file\)\)/);
  assert.match(storage, /export async function uploadFileServer[\s\S]*?await assertUploadContent\(file\)/);
  assert.match(upload, /mediaFileProblem\(file\)/);
  assert.match(upload, /recordMedia\(\{ userId: user\.id/);
  // Other upload paths record too: CMS, logos, Rex pictures, product news images.
  assert.match(read("src/app/api/app/cms/upload/route.ts"), /recordMedia\(\{ userId: user\.id, storeId: store\.id/);
  assert.match(read("src/lib/identity.ts"), /recordMedia\(\{ userId: user\.id[^}]*source: "logo"/);
  assert.match(read("src/lib/ai/images.ts"), /aiImageOwner\(path\)/);
  assert.match(read("src/app/api/admin/product-news/image/route.ts"), /recordMedia\(\{ userId: user\.id/);
  // A file in the library is not deleted when the logo changes (it may be used elsewhere).
  assert.match(read("src/lib/identity.ts"), /!\(await isInLibrary\(user\.id, owner\.logoUrl\)\)/);
});

test("migration: additive, idempotent, private", () => {
  const sql = read("docs/migrations/2026-10-26-media-library.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "MediaAsset"/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "MediaAsset_userId_url_key" ON "MediaAsset"\("userId", "url"\)/);
  assert.match(sql, /ALTER TABLE "MediaAsset" ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION shopinbos_media_sync/);
  assert.match(sql, /ON CONFLICT \("userId", "url"\) DO NOTHING/);
  assert.match(sql, /REVOKE ALL ON FUNCTION shopinbos_media_sync\(TEXT\) FROM PUBLIC/);
  assert.match(sql, /SELECT shopinbos_media_sync\(NULL\)/);
  assert.doesNotMatch(sql, /\bDROP\b|\bTRUNCATE\b|\bDELETE FROM\b/i);
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model MediaAsset \{[\s\S]*?@@unique\(\[userId, url\]\)/);
});

test("picker: one component, wired into the old link fields, in five languages", () => {
  for (const file of ["src/components/media/MediaPicker.tsx", "src/components/media/MediaLibraryDialog.tsx", "src/components/media/MediaListField.tsx"]) assert.ok(existsSync(join(ROOT, file)), file);
  const picker = read("src/components/media/MediaPicker.tsx");
  assert.match(picker, /<input type="hidden" name=\{name\} value=\{url\} \/>/);
  assert.match(picker, /field\.choose/);
  assert.match(picker, /field\.pasteLink/);
  assert.match(picker, /isHttpsMediaUrl/);
  const uses = {
    "src/app/home/marketing/forms/FormsManager.tsx": /<MediaPicker id="f-img"/,
    "src/app/home/marketing/_kit/BlockSettings.tsx": /<MediaPicker value=\{url\}/,
    "src/app/home/marketing/campaigns/[id]/CampaignEditor.tsx": /<MediaPicker id="c-wa-image"/,
    "src/app/home/automations/[id]/FlowEditor.tsx": /<MediaPicker label=\{t\("fe\.headerImage"\)\}/,
    "src/app/home/collections/CollectionsClient.tsx": /<MediaPicker id="collection-image"/,
    "src/app/admin/categories/page.tsx": /<MediaPicker id=\{`\$\{idPrefix\}-image`\} name="imageUrl"/,
    "src/components/seo/SeoImageField.tsx": /<MediaPicker id=\{id\} name=\{name\}/,
    "src/components/seo/SeoTab.tsx": /<MediaPicker id=\{`\$\{id\}-si`\}/,
    "src/app/home/cms/[collectionId]/[itemId]/FieldInput.tsx": /<MediaLibraryDialog open=\{libraryOpen\} multiple/,
    "src/app/home/cms/[collectionId]/[itemId]/ItemEditor.tsx": /<MediaLibraryDialog/,
    "src/components/cms/RichTextEditor.tsx": /<MediaLibraryDialog/,
    "src/components/admin/NewsImageUpload.tsx": /<MediaLibraryDialog/,
    "src/app/components/ProductForm.tsx": /<MediaLibraryDialog/,
    "src/components/supplier/SupplierProductForm.tsx": /<MediaListField id="product-images" name="images"/,
  };
  for (const [file, pattern] of Object.entries(uses)) assert.match(read(file), pattern, file);
  assert.doesNotMatch(read("src/app/home/marketing/forms/FormsManager.tsx"), /placeholder="https:\/\/" inputMode="url"/);
  assert.doesNotMatch(read("shared/i18n/messages/marketing/en.ts"), /https link/);
  assert.match(read("shared/i18n/catalog.ts"), /import media from "\.\/messages\/media\/index\.ts";/);
  for (const lang of ["en", "pcm", "yo", "ha", "ig"]) assert.ok(existsSync(join(ROOT, `shared/i18n/messages/media/${lang}.ts`)), lang);
});
