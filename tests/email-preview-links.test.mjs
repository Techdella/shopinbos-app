// Email previews: links still hold placeholders ({{store_url}}, {{cart_url}}) until the email is sent, so in every
// preview they do nothing, don't look navigable, keep their button styling and show a small hint. Sent emails are
// never touched.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const { disablePreviewLinks, PREVIEW_LINK_ATTR } = await import("../src/lib/marketing/preview-links.ts");
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const HINT = "Links work in the email you send.";

test("preview links lose their address and target, keep their look, and show the hint", () => {
  const email = `<!doctype html><html><head><title>x</title></head><body>
    <a href="{{store_url}}" target="_blank" style="display:inline-block;background:#0E2A38;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none">Shop now</a>
    <p>Finish here: <a href='{{cart_url}}'>your cart</a> or <A HREF=https://shop.example/x rel="noopener">site</A></p>
    <map><area shape="rect" coords="0,0,1,1" href="{{store_url}}" /></map>
  </body></html>`;
  const out = disablePreviewLinks(email, HINT);
  assert.doesNotMatch(out, /\shref\s*=/i, "no link can be followed");
  assert.doesNotMatch(out, /\starget\s*=/i, "nothing opens a new tab");
  assert.equal((out.match(new RegExp(`${PREVIEW_LINK_ATTR}=""`, "g")) ?? []).length, 4, "every link and image-map area is marked");
  assert.match(out, /style="display:inline-block;background:#0E2A38;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none"/, "buttons keep their styling");
  assert.match(out, />Shop now<\/a>/);
  assert.match(out, /tabindex="0" aria-disabled="true"/, "a tap or keyboard focus shows the hint");
  assert.match(out, /<style data-preview-links>[\s\S]*cursor:default!important[\s\S]*<\/style><\/head>/, "the style goes in the head");
  assert.match(out, /:hover::after,a\[data-preview-link\]:focus::after\{content:"Links work in the email you send\."/);
  assert.match(out, /<area shape="rect" coords="0,0,1,1" data-preview-link="" [^>]*\/>/, "self-closing tags stay valid");
});

test("fragments without a head get the style too, and the hint is escaped", () => {
  const out = disablePreviewLinks(`<p><a href="#">x</a></p>`, `Say "hi" <now>`);
  assert.match(out, /^<style data-preview-links>/);
  assert.match(out, /content:"Say \\"hi\\" <now>"/);
  assert.match(out, /data-preview-hint="Say &quot;hi&quot; &lt;now&gt;"/);
  assert.match(disablePreviewLinks(`<body class="x"><a href="#">x</a></body>`, HINT), /<body class="x"><style data-preview-links>/);
  assert.equal(disablePreviewLinks("", HINT), "");
});

test("every email preview uses the one shared iframe; nothing else draws email HTML", () => {
  const frame = read("../src/app/home/marketing/_kit/EmailFrame.tsx");
  assert.match(frame, /export function EmailPreviewIframe/);
  assert.match(frame, /disablePreviewLinks\(html, hint\)/);
  assert.match(frame, /t\("preview\.linksHint"\)/);
  assert.match(read("../src/app/home/marketing/_kit/client.tsx"), /<EmailPreviewIframe/, "campaign and automation previews");
  assert.match(read("../src/components/admin/ProductNewsManager.tsx"), /<EmailPreviewIframe/, "admin product news preview");

  // The only srcDoc in the app is the shared preview iframe.
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name) && /srcDoc=/.test(readFileSync(path, "utf8")) && !path.endsWith(join("_kit", "EmailFrame.tsx"))) offenders.push(path);
    }
  };
  walk(new URL("../src", import.meta.url).pathname);
  assert.deepEqual(offenders, []);
});

test("sent emails are unchanged: only the preview iframe uses the link blocker", () => {
  const users = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(tsx?|mjs)$/.test(name) && /marketing\/preview-links"/.test(readFileSync(path, "utf8"))) users.push(path.slice(path.indexOf("src")));
    }
  };
  walk(new URL("../src", import.meta.url).pathname);
  assert.deepEqual(users, [join("src", "app", "home", "marketing", "_kit", "EmailFrame.tsx")]);
});

test("the hint is translated in all five languages", async () => {
  for (const locale of ["en", "pcm", "yo", "ha", "ig"]) {
    const messages = (await import(`../shared/i18n/messages/emailBuilder/${locale}.ts`)).default;
    assert.ok(messages["preview.linksHint"], locale);
  }
});
