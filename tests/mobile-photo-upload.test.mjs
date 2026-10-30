// Photo uploads from the phone app: every photo is shrunk on the phone before it's sent, because Vercel refuses
// request bodies over ~4.5 MB (413 FUNCTION_PAYLOAD_TOO_LARGE, which Android showed as "We couldn't reach
// Shopinbos"). Pure rules: apps/mobile/src/lib/upload-photo-pure.ts; device side: apps/mobile/src/lib/upload-photo.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pure = await import("../apps/mobile/src/lib/upload-photo-pure.ts");
const MB = 1024 * 1024;

test("resize: the long side is brought down to the limit, keeping the shape; small photos stay", () => {
  assert.deepEqual(pure.resizeTarget(8160, 6120), { width: 1600, height: 1200 }); // 50 MP camera
  assert.deepEqual(pure.resizeTarget(3000, 4000), { width: 1200, height: 1600 }); // portrait
  assert.deepEqual(pure.resizeTarget(4000, 3000, 2400), { width: 2400, height: 1800 }); // documents
  assert.equal(pure.resizeTarget(1200, 900), null);
  assert.equal(pure.resizeTarget(1600, 1600), null);
  assert.equal(pure.resizeTarget(null, 900), null);
  assert.equal(pure.resizeTarget(0, 0), null);
});

test("type and name: always a real image type and a name with the right extension", () => {
  assert.equal(pure.photoMime("image/jpeg", "file:///x.jpg"), "image/jpeg");
  assert.equal(pure.photoMime("image/jpg"), "image/jpeg");
  assert.equal(pure.photoMime(null, "file:///cache/ImagePicker/abc.PNG"), "image/png");
  assert.equal(pure.photoMime(undefined, "content://media/external/images/media/12"), "image/jpeg");
  assert.equal(pure.photoMime("", "file:///a.heic"), "image/heic");
  assert.equal(pure.photoFileName(null, "image/jpeg", "product"), "product.jpg");
  assert.equal(pure.photoFileName("IMG_1234.HEIC", "image/jpeg"), "IMG_1234.jpg");
  assert.equal(pure.photoFileName("/storage/emulated/0/DCIM/my photo (1).png", "image/png"), "my-photo-1.png");
  assert.equal(pure.photoFileName("   ", "image/webp", "logo"), "logo.webp");
});

test("shrink: big or wide photos and HEIC are redrawn; GIFs and SVGs never", () => {
  assert.equal(pure.shouldShrink({ type: "image/jpeg", width: 4000, height: 3000, bytes: 3 * MB }), true);
  assert.equal(pure.shouldShrink({ type: "image/jpeg", width: 1200, height: 900, bytes: 2 * MB }), true);
  assert.equal(pure.shouldShrink({ type: "image/jpeg", width: 1200, height: 900, bytes: 300 * 1024 }), false);
  assert.equal(pure.shouldShrink({ type: "image/heic", width: 800, height: 600, bytes: 100 * 1024 }), true);
  assert.equal(pure.shouldShrink({ type: "image/gif", width: 4000, height: 3000, bytes: 9 * MB }), false);
  assert.equal(pure.shouldShrink({ type: "image/jpeg" }), true); // nothing known: shrink to be safe
  assert.equal(pure.shrunkType("image/png", true), "image/png");
  assert.equal(pure.shrunkType("image/png", false), "image/jpeg");
  assert.equal(pure.shrunkType("image/heic", true), "image/jpeg");
});

test("batches: Snap photos go in as few requests as fit under the limit", () => {
  assert.deepEqual(pure.batchBySize([500e3, 500e3, 500e3]), [[0, 1, 2]]);
  assert.deepEqual(pure.batchBySize([2 * MB, 2 * MB, 1 * MB]), [[0], [1, 2]]);
  assert.deepEqual(pure.batchBySize([null, null]), [[0], [1]]); // unknown sizes count as 3 MB
  assert.deepEqual(pure.batchBySize([5 * MB]), [[0]]); // one too-big photo still goes alone
  assert.deepEqual(pure.batchBySize([1, 1, 1, 1, 1, 1, 1], undefined, 6), [[0, 1, 2, 3, 4, 5], [6]]);
  for (const batch of pure.batchBySize([1.5 * MB, 1.5 * MB, 1.5 * MB, 1.5 * MB])) {
    assert.ok(batch.length * 1.5 * MB <= pure.BATCH_BUDGET_BYTES);
  }
  assert.ok(pure.BATCH_BUDGET_BYTES < 4.5 * MB);
  assert.equal(pure.UPLOAD_MAX_BYTES, 4 * MB);
});

test("errors: offline, too big and server problems are told apart; retries only when it can help", () => {
  assert.equal(pure.uploadProblem(0, 200e3), "offline");
  assert.equal(pure.uploadProblem(0, 6 * MB), "tooBig"); // Vercel cut the connection on a big body
  assert.equal(pure.uploadProblem(0, null), "offline");
  assert.equal(pure.uploadProblem(413, 1), "tooBig");
  assert.equal(pure.uploadProblem(503), "server");
  assert.equal(pure.uploadProblem(400), "rejected");
  assert.equal(pure.shouldRetryUpload(0, 0, 300e3), true);
  assert.equal(pure.shouldRetryUpload(0, 1, 300e3), true);
  assert.equal(pure.shouldRetryUpload(0, 2, 300e3), false);
  assert.equal(pure.shouldRetryUpload(0, 0, 6 * MB), false);
  assert.equal(pure.shouldRetryUpload(503, 0), true);
  assert.equal(pure.shouldRetryUpload(500, 0), false);
  assert.equal(pure.shouldRetryUpload(400, 0), false);
  assert.equal(pure.shouldRetryUpload(413, 0), false);
  assert.ok(pure.retryDelayMs(1) < pure.retryDelayMs(2));
});

test("every photo upload on the phone goes through the shrinking helper", () => {
  const helper = read("apps/mobile/src/lib/upload-photo.ts");
  assert.match(helper, /requireOptionalNativeModule\("ExpoImageManipulator"\)/);
  assert.match(helper, /ImageManipulator\.manipulate/);
  const pkg = JSON.parse(read("apps/mobile/package.json"));
  assert.ok(pkg.dependencies["expo-image-manipulator"]);
  for (const file of ["photos.ts", "products.ts", "supplier.ts", "logistics.ts", "familiar.ts", "identity.ts"]) {
    const source = read(`apps/mobile/src/lib/${file}`);
    assert.match(source, /uploadOnePhoto/, file);
  }
  for (const file of ["apps/mobile/src/lib/onboarding.ts", "apps/mobile/src/lib/bulk-add.ts", "apps/mobile/src/lib/rider.ts"]) {
    assert.match(read(file), /preparePhoto\(/, file);
  }
  // No raw { uri, name, type } image parts left outside the helper (voice notes and PDFs aside).
  for (const file of ["photos.ts", "products.ts", "supplier.ts", "familiar.ts", "identity.ts", "onboarding.ts", "bulk-add.ts", "rider.ts"]) {
    assert.doesNotMatch(read(`apps/mobile/src/lib/${file}`), /type\.split\("\/"\)\[1\]/, file);
  }
  assert.match(read("apps/mobile/src/components/VerificationScreen.tsx"), /uploadOnePhoto/);
});

test("file uploads skip expo/fetch: multipart bodies go through XMLHttpRequest (photos, voice notes, documents)", () => {
  // expo/fetch (Expo SDK 57's global fetch) throws "Unsupported FormDataPart implementation" on React Native's
  // { uri, name, type } parts, before the request leaves the phone: product photos and Rex video photos failed as
  // "offline" while Add many (XHR) worked.
  const api = readFileSync(new URL("../apps/mobile/src/lib/api.ts", import.meta.url), "utf8");
  assert.match(api, /export function send\(url: string, init: RequestInit = \{\}\): Promise<Response> \{\s*if \(Platform\.OS === "web" \|\| !\(init\.body instanceof FormData\)\) return fetch\(url, init\);/);
  assert.match(api, /const xhr = new XMLHttpRequest\(\);/);
  assert.match(api, /if \(name\.toLowerCase\(\) !== "content-type"\) xhr\.setRequestHeader\(name, value\);/);
  assert.equal((api.match(/response = await send\(`\$\{API_URL\}\$\{path\}`/g) ?? []).length, 2, "api() and apiBody() both use send");
  assert.doesNotMatch(api, /response = await fetch\(`\$\{API_URL\}\$\{path\}`/);
  const rider = readFileSync(new URL("../apps/mobile/src/lib/rider.ts", import.meta.url), "utf8");
  assert.match(rider, /response = await send\(`\$\{API_URL\}\/api\/mobile\/logistics\/rider\$\{path\}`/);
});
