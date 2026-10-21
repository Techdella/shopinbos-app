#!/usr/bin/env node
// Makes one successful Graph API call per permission the shopinbos Meta app (1287420443273303) asks for in App
// Review. Meta greys out "Request advanced access" until it has logged a successful call for that permission in
// the last 30 days (logging takes up to 2 days), so run this, wait a day or two, then submit.
//
//   META_TEST_TOKEN=…  node scripts/meta-review-test-calls.mjs              read-only calls (safe to repeat)
//   META_TEST_TOKEN=…  node scripts/meta-review-test-calls.mjs --write      also the write permissions (see below)
//
// META_TEST_TOKEN     a USER access token for the shopinbos app from Graph API Explorer
//                     (developers.facebook.com/tools/explorer → Meta App: shopinbos → User Token → tick every
//                     permission below → Generate). The person must be an admin/developer/tester of the app, and
//                     manage the test Facebook Page, its linked Instagram professional account, an ad account,
//                     a catalog and a WhatsApp Business Account.
// META_PAGE_ID        optional: which Page to use (default: the first from /me/accounts).
// META_AD_ACCOUNT_ID  optional: act_… (default: the first from /me/adaccounts).
// META_BUSINESS_ID    optional (default: the first from /me/businesses).
// META_WABA_ID        optional WhatsApp Business Account id (default: the first one the business owns).
// META_IG_TOKEN       optional: an Instagram-Login user token (graph.instagram.com) for
//                     instagram_business_basic / instagram_business_content_publish.
// META_WA_TEST_TO     with --write: a WhatsApp number (2348…) on the WABA's allowed test list, sent the
//                     "hello_world" template (whatsapp_business_messaging).
// META_GRAPH_VERSION  default v21.0.
//
// --write also: creates an UNPUBLISHED post on the Page, comments on it and deletes it (pages_manage_posts,
// pages_manage_engagement), and sends the WhatsApp template above. Nothing is shown publicly.

const env = process.env;
const token = (env.META_TEST_TOKEN ?? "").trim();
const igToken = (env.META_IG_TOKEN ?? "").trim();
const version = (env.META_GRAPH_VERSION ?? "").trim() || "v21.0";
const graph = `https://graph.facebook.com/${version}`;
const write = process.argv.includes("--write");

if (!token) {
  console.error("❌ Set META_TEST_TOKEN (a user token from Graph API Explorer; see the comment at the top of this file).");
  process.exit(1);
}

const results = [];

async function call(path, { method = "GET", params = {}, accessToken = token, base = graph } = {}) {
  const url = new URL(`${base}/${path.replace(/^\//, "")}`);
  const body = new URLSearchParams({ ...params, access_token: accessToken });
  const init = method === "GET" || method === "DELETE" ? {} : { method, body };
  if (method === "GET" || method === "DELETE") for (const [k, v] of body) url.searchParams.set(k, v);
  const res = await fetch(url, { ...init, method, signal: AbortSignal.timeout(20_000) }).catch((error) => ({ ok: false, json: async () => ({ error: { message: error.message } }) }));
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return json;
}

async function step(permission, what, run) {
  try {
    const detail = await run();
    results.push({ permission, ok: true, what, detail: detail ?? "" });
    console.log(`✅ ${permission.padEnd(36)} ${what}${detail ? ` · ${detail}` : ""}`);
  } catch (error) {
    results.push({ permission, ok: false, what, detail: error.message });
    console.log(`❌ ${permission.padEnd(36)} ${what} · ${error.message}`);
  }
}

function skip(permission, why) {
  results.push({ permission, ok: false, what: "skipped", detail: why });
  console.log(`⏭️  ${permission.padEnd(36)} skipped · ${why}`);
}

// ─── Who, and which assets ───────────────────────────────────────────────────

const granted = new Set();
try {
  const perms = await call("me/permissions");
  for (const p of perms.data ?? []) if (p.status === "granted") granted.add(p.permission);
  console.log(`Token grants: ${[...granted].sort().join(", ") || "nothing"}\n`);
} catch (error) {
  console.error(`❌ The token doesn't work: ${error.message}`);
  process.exit(1);
}

await step("public_profile", "GET /me", async () => (await call("me", { params: { fields: "id,name" } })).name);
await step("email", "GET /me?fields=email", async () => (await call("me", { params: { fields: "email" } })).email ?? "no email on the account");

let page = null;
await step("pages_show_list", "GET /me/accounts", async () => {
  const pages = (await call("me/accounts", { params: { fields: "id,name,access_token,instagram_business_account" } })).data ?? [];
  page = pages.find((p) => p.id === env.META_PAGE_ID) ?? pages[0] ?? null;
  if (!page) throw new Error("this account manages no Facebook Page");
  return `${pages.length} page(s), using ${page.name}`;
});

const pageToken = page?.access_token;
if (page && pageToken) {
  await step("pages_read_engagement", "GET /{page}?fields=followers_count + /feed", async () => {
    const info = await call(page.id, { accessToken: pageToken, params: { fields: "name,followers_count,fan_count" } });
    await call(`${page.id}/feed`, { accessToken: pageToken, params: { limit: "1" } });
    return `${info.followers_count ?? info.fan_count ?? 0} followers`;
  });
  await step("pages_manage_metadata", "GET /{page}/subscribed_apps", async () => `${((await call(`${page.id}/subscribed_apps`, { accessToken: pageToken })).data ?? []).length} app(s) subscribed`);
  await step("pages_messaging", "GET /{page}/conversations", async () => `${((await call(`${page.id}/conversations`, { accessToken: pageToken, params: { limit: "5", fields: "id,participants" } })).data ?? []).length} conversation(s)`);
  await step("Business Asset User Profile Access", "GET a Messenger sender's name", async () => {
    const convs = (await call(`${page.id}/conversations`, { accessToken: pageToken, params: { limit: "5", fields: "participants" } })).data ?? [];
    const person = convs.flatMap((c) => c.participants?.data ?? []).find((p) => p.id !== page.id);
    if (!person) throw new Error("no Messenger conversation on the Page yet: message the Page from a test account, then rerun");
    return (await call(person.id, { accessToken: pageToken, params: { fields: "name" } })).name;
  });
  await step("pages_manage_ads", "GET /{page}/ads_posts", async () => `${((await call(`${page.id}/ads_posts`, { accessToken: pageToken, params: { limit: "1" } })).data ?? []).length} ad post(s)`);
  await step("instagram_manage_messages", "GET /{page}/conversations?platform=instagram", async () => `${((await call(`${page.id}/conversations`, { accessToken: pageToken, params: { platform: "instagram", limit: "5" } })).data ?? []).length} conversation(s)`);

  if (write) {
    await step("pages_manage_posts + pages_manage_engagement", "create an unpublished post, comment, delete", async () => {
      const post = await call(`${page.id}/feed`, { method: "POST", accessToken: pageToken, params: { message: "Shopinbos App Review test (unpublished, deleted straight away)", published: "false" } });
      try {
        await call(`${post.id}/comments`, { method: "POST", accessToken: pageToken, params: { message: "Test comment" } }).catch(() => null);
        await call(`${post.id}/likes`, { method: "POST", accessToken: pageToken });
      } finally {
        await call(post.id, { method: "DELETE", accessToken: pageToken }).catch(() => null);
      }
      return `post ${post.id} created and deleted`;
    });
  } else {
    skip("pages_manage_posts", "rerun with --write (unpublished test post, deleted at once)");
    skip("pages_manage_engagement", "rerun with --write");
  }
} else {
  for (const p of ["pages_read_engagement", "pages_manage_metadata", "pages_messaging", "Business Asset User Profile Access", "pages_manage_ads", "instagram_manage_messages", "pages_manage_posts", "pages_manage_engagement"]) skip(p, "no Page");
}

const igId = page?.instagram_business_account?.id;
if (igId) {
  await step("instagram_basic", "GET /{ig-user}?fields=username,media_count", async () => (await call(igId, { params: { fields: "username,media_count" } })).username);
  await step("instagram_content_publish", "GET /{ig-user}/content_publishing_limit", async () => `quota used: ${(await call(`${igId}/content_publishing_limit`, { params: { fields: "quota_usage" } })).data?.[0]?.quota_usage ?? 0}`);
} else {
  skip("instagram_basic", "the Page has no linked Instagram professional account");
  skip("instagram_content_publish", "the Page has no linked Instagram professional account");
}

if (igToken) {
  const ig = "https://graph.instagram.com/" + version;
  await step("instagram_business_basic", "GET graph.instagram.com/me", async () => (await call("me", { base: ig, accessToken: igToken, params: { fields: "user_id,username" } })).username);
  await step("instagram_business_content_publish", "GET graph.instagram.com/me/content_publishing_limit", async () => `quota used: ${(await call("me/content_publishing_limit", { base: ig, accessToken: igToken, params: { fields: "quota_usage" } })).data?.[0]?.quota_usage ?? 0}`);
} else {
  skip("instagram_business_content_publish", "set META_IG_TOKEN (Instagram Login token); it also needs instagram_business_basic requested");
}

let adAccount = env.META_AD_ACCOUNT_ID?.trim() || null;
await step("ads_read", "GET /me/adaccounts + insights", async () => {
  if (!adAccount) adAccount = ((await call("me/adaccounts", { params: { fields: "id,name", limit: "5" } })).data ?? [])[0]?.id ?? null;
  if (!adAccount) throw new Error("this account has no ad account");
  await call(`${adAccount}/insights`, { params: { fields: "impressions,spend", date_preset: "last_30d" } });
  return adAccount;
});
await step("ads_management", "GET /{ad-account}/campaigns", async () => {
  if (!adAccount) throw new Error("no ad account");
  return `${((await call(`${adAccount}/campaigns`, { params: { fields: "id,name,status", limit: "5" } })).data ?? []).length} campaign(s)`;
});

let business = env.META_BUSINESS_ID?.trim() || null;
await step("business_management", "GET /me/businesses", async () => {
  const list = (await call("me/businesses", { params: { fields: "id,name" } })).data ?? [];
  business ||= list[0]?.id ?? null;
  if (!business) throw new Error("this account is in no business portfolio");
  return `${list.length} business(es)`;
});
await step("catalog_management", "GET /{business}/owned_product_catalogs", async () => {
  if (!business) throw new Error("no business");
  return `${((await call(`${business}/owned_product_catalogs`, { params: { fields: "id,name" } })).data ?? []).length} catalog(s)`;
});

let waba = env.META_WABA_ID?.trim() || null;
let phoneId = null;
await step("whatsapp_business_management", "GET /{waba}/phone_numbers + message_templates", async () => {
  if (!waba && business) waba = ((await call(`${business}/owned_whatsapp_business_accounts`, { params: { fields: "id,name" } })).data ?? [])[0]?.id ?? null;
  if (!waba) throw new Error("no WhatsApp Business Account (set META_WABA_ID)");
  const phones = (await call(`${waba}/phone_numbers`, { params: { fields: "id,display_phone_number" } })).data ?? [];
  phoneId = phones[0]?.id ?? null;
  await call(`${waba}/message_templates`, { params: { limit: "1" } });
  return `${phones.length} number(s)`;
});
if (write && env.META_WA_TEST_TO && phoneId) {
  await step("whatsapp_business_messaging", "send the hello_world template", async () => {
    const sent = await call(`${phoneId}/messages`, { method: "POST", params: { messaging_product: "whatsapp", to: env.META_WA_TEST_TO.replace(/\D/g, ""), type: "template", template: JSON.stringify({ name: "hello_world", language: { code: "en_US" } }) } });
    return sent.messages?.[0]?.id ?? "sent";
  });
} else {
  skip("whatsapp_business_messaging", "rerun with --write and META_WA_TEST_TO=2348… (a number on the WABA's test list)");
}

// ─── Summary ─────────────────────────────────────────────────────────────────

const ok = results.filter((r) => r.ok);
const missing = results.filter((r) => !r.ok);
console.log(`\n${ok.length} permission call(s) succeeded, ${missing.length} still to do.`);
if (missing.length) console.log("Still to do:\n" + missing.map((r) => `  • ${r.permission}: ${r.detail}`).join("\n"));
console.log("\nMeta logs calls within ~2 days. Then App Review › Permissions and Features lets you request advanced access.");
process.exit(missing.some((r) => r.what !== "skipped") ? 1 : 0);
