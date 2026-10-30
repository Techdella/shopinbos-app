// Connect WhatsApp (Meta Embedded Signup, src/components/meta/embedded-signup.ts) never spins forever: Facebook's
// SDK loads when the page opens, so the tap opens Facebook's window at once (loading it inside the tap got the window
// blocked as a popup and FB.login never called back), and a blocked window, a seller coming back with no answer, or
// no answer at all each end with a message instead of "Connecting…".
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the SDK loads once, ahead of the tap, and FB.login runs without waiting when it's ready", () => {
  const lib = read("src/components/meta/embedded-signup.ts");
  assert.match(lib, /export function preloadFacebookSdk\(appId: string\)/);
  assert.match(lib, /if \(sdkReady\) return Promise\.resolve\(sdkReady\);\s*if \(sdkLoading\) return sdkLoading;/);
  assert.match(lib, /const FB = sdkReady \?\? \(await loadFacebookSdk\(signup\.appId\)\);/);
});

test("a blocked window, coming back without an answer, or no answer at all never leaves it spinning", () => {
  const lib = read("src/components/meta/embedded-signup.ts");
  assert.match(lib, /new EmbeddedSignupError\("blocked", /);
  assert.match(lib, /new EmbeddedSignupError\("timeout", /);
  assert.match(lib, /if \(left\) backTimer = window\.setTimeout\(\(\) => finish\(\(\) => reject\(new EmbeddedSignupError\("closed", "closed"\)\)\), 45_000\);/);
  assert.match(lib, /FB\.login\(\(response\) => finish\(\(\) => resolve\(response\.authResponse\?\.code \?\? null\)\)/);
});

test("every Connect WhatsApp page preloads the SDK; the web card opens Facebook before asking the server", () => {
  for (const path of ["src/app/channels/whatsapp/WhatsAppAppConnect.tsx", "src/app/channels/ChannelClient.tsx", "src/app/home/inbox/chatbot/WhatsAppPeggyClient.tsx", "src/app/home/inbox/whatsapp-catalog/WhatsAppCatalogClient.tsx"]) {
    assert.match(read(path), /preloadFacebookSdk\(signup\.appId\)/, path);
  }
  const card = read("src/app/channels/ChannelClient.tsx");
  assert.ok(card.indexOf("if (!accounts?.whatsapp && signup) return await signUpWhatsApp(signup);") < card.indexOf("let result = await connectWhatsAppAction();"));
  assert.match(read("src/app/channels/whatsapp/WhatsAppAppConnect.tsx"), /signal: AbortSignal\.timeout\(90_000\)/);
});
