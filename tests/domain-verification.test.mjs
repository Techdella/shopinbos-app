// Custom-domain ownership (src/lib/domains/verification.ts, ownership.server.ts, lookup.ts): normalization,
// platform-domain refusal, the TXT check (with an injected resolver, never real DNS), token format, and the
// claim → verify → serve flow against an in-memory store table.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { register } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const HOOKS = `
import { existsSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
let root = "";
export async function initialize(data) { root = data.root; }
function find(base) {
  for (const ext of ["", ".ts", ".tsx", "/index.ts"]) {
    const p = base + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}
const STUBS = ["lib/db/client", "lib/domains/vercel"];
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    if (STUBS.includes(rel)) return { url: "mock:" + rel, shortCircuit: true };
    const file = find(root + "/src/" + rel);
    if (!file) throw new Error("Can't find " + specifier);
    return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url === "mock:lib/db/client") return { format: "module", source: "export const db = new Proxy({}, { get: (_, k) => globalThis.__dom.db[k] });", shortCircuit: true };
  if (url === "mock:lib/domains/vercel") return { format: "module", source: [
    "export const hasVercelDomainConfig = () => globalThis.__dom.vercel.configured;",
    "export const assignDomainOnVercel = async (d) => { globalThis.__dom.vercel.added.push(d); return { domain: d, verified: true, verification: [], configuration: null }; };",
    "export const removeDomainFromVercel = async (d) => { globalThis.__dom.vercel.removed.push(d); return true; };",
  ].join("\\n"), shortCircuit: true };
  return next(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(HOOKS)}`, { data: { root: ROOT } });

const v = await import("../src/lib/domains/verification.ts");

const config = { rootDomain: "shopinbos.com", appHosts: ["https://app.shopinbos.com", "https://staging.example.org"] };
const parse = (raw, serveAs) => v.parseDomainInput(raw, serveAs, config);

test("normalization: lowercase, no scheme, path, port, trailing dot or www; www/apex is a choice", () => {
  assert.deepEqual(parse("https://WWW.Adas.NG:443/shop?x=1"), { ok: true, domain: "adas.ng", host: "www.adas.ng", servedAs: "www" });
  assert.deepEqual(parse("adas.ng."), { ok: true, domain: "adas.ng", host: "adas.ng", servedAs: "apex" });
  assert.deepEqual(parse("www.adas.ng", "apex"), { ok: true, domain: "adas.ng", host: "adas.ng", servedAs: "apex" });
  assert.deepEqual(parse("adas.ng", "www"), { ok: true, domain: "adas.ng", host: "www.adas.ng", servedAs: "www" });
  assert.deepEqual(parse("  Shop.Kemi.com.ng/ "), { ok: true, domain: "shop.kemi.com.ng", host: "shop.kemi.com.ng", servedAs: "apex" });
  assert.equal(v.domainKey("http://WWW.Bolu.com:8080/a"), "bolu.com");
  assert.equal(v.domainKey(""), "");
});

test("refuses platform and hosting domains, IPs and non-names", () => {
  for (const raw of ["shopinbos.com", "www.shopinbos.com", "adas.shopinbos.com", "a.b.shopinbos.com", "my-app.vercel.app", "x.vercel.sh", "cname.vercel-dns.com", "app.shopinbos.com", "staging.example.org", "x.staging.example.org", "localhost", "shop.localhost"]) {
    const result = parse(raw);
    assert.equal(result.ok, false, raw);
    assert.ok(["platform", "invalid"].includes(result.code), `${raw}: ${result.code}`);
  }
  assert.equal(parse("adas.shopinbos.com").code, "platform");
  for (const raw of ["1.2.3.4", "http://10.0.0.1/", "[::1]", "2001:db8::1"]) assert.equal(parse(raw).code, "ip", raw);
  for (const raw of ["adas", "-bad-.com", "under_score.com", "a..com", "x.123", "user@adas.ng", "adas .ng"]) assert.equal(parse(raw).ok, false, raw);
  assert.equal(parse("").code, "missing");
  assert.equal(parse("staging.example.org.ng").ok, true, "only the app host and its subdomains are refused");
});

test("tokens: 32 random bytes as base64url, unique, validated", () => {
  const a = v.newVerifyToken();
  const b = v.newVerifyToken();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
  assert.equal(v.isVerifyToken(a), true);
  for (const bad of ["", "short", `${a}x`, a.slice(1), `${a.slice(1)}=`, null, 42]) assert.equal(v.isVerifyToken(bad), false, String(bad));
});

test("records: TXT at _shopinbos-verify.<domain>, then A/CNAME routing for the chosen address", () => {
  const token = v.newVerifyToken();
  const targets = v.routingTargets({});
  assert.deepEqual(targets, { cname: "cname.vercel-dns.com", a: "76.76.21.21" });
  assert.deepEqual(v.routingTargets({ DOMAIN_CNAME_TARGET: "x.vercel-dns-017.com", DOMAIN_A_RECORD: "1.1.1.1" }), { cname: "x.vercel-dns-017.com", a: "1.1.1.1" });
  const www = v.dnsRecordsFor("www.adas.ng", token, targets);
  assert.deepEqual(www.map((r) => [r.type, r.name, r.value, r.required]), [
    ["TXT", "_shopinbos-verify.adas.ng", `shopinbos-verify=${token}`, true],
    ["A", "adas.ng", "76.76.21.21", false],
    ["CNAME", "www.adas.ng", "cname.vercel-dns.com", true],
  ]);
  const apex = v.dnsRecordsFor("adas.ng", null, targets);
  assert.deepEqual(apex.map((r) => [r.type, r.required]), [["A", true], ["CNAME", false]], "no token: routing records only");
});

test("TXT matching: joined chunks, quotes and spaces tolerated, exact token required", async () => {
  const token = v.newVerifyToken();
  assert.deepEqual(v.txtValues([["shopinbos-verify=", token], ['"v=spf1 -all"'], ["  "]]), [`shopinbos-verify=${token}`, "v=spf1 -all"]);
  assert.equal(v.txtMatches([`shopinbos-verify=${token}`], token), true);
  assert.equal(v.txtMatches([` Shopinbos-Verify=${token} `], token), true);
  assert.equal(v.txtMatches([`shopinbos-verify=${token.toLowerCase() === token ? token.toUpperCase() : token.toLowerCase()}`], token), false, "token is case-sensitive");
  assert.equal(v.txtMatches([`shopinbos-verify=${token}x`], token), false);
  assert.equal(v.txtMatches([token], token), false, "the prefix is required");
  assert.equal(v.txtMatches([`shopinbos-verify=`], ""), false);

  const asked = [];
  const resolver = (records) => async (name) => { asked.push(name); return records; };
  assert.deepEqual(await v.checkVerificationTxt("www.adas.ng", token, resolver([["other"], [`shopinbos-verify=${token}`]])), { ok: true });
  assert.equal(asked[0], "_shopinbos-verify.adas.ng");

  const mismatch = await v.checkVerificationTxt("adas.ng", token, resolver([["shopinbos-verify=old-token"]]));
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, "mismatch");
  assert.match(mismatch.message, /_shopinbos-verify\.adas\.ng/);
  assert.deepEqual(mismatch.found, ["shopinbos-verify=old-token"]);

  const missing = await v.checkVerificationTxt("adas.ng", token, async () => { throw Object.assign(new Error("nope"), { code: "ENOTFOUND" }); });
  assert.equal(missing.code, "no_record");
  const empty = await v.checkVerificationTxt("adas.ng", token, resolver([]));
  assert.equal(empty.code, "no_record");
  const failing = await v.checkVerificationTxt("adas.ng", token, async () => { throw Object.assign(new Error("x"), { code: "ESERVFAIL" }); });
  assert.equal(failing.code, "dns_error");
  assert.match(failing.message, /ESERVFAIL/);
  const slow = await v.checkVerificationTxt("adas.ng", token, () => new Promise(() => {}), 20);
  assert.equal(slow.code, "timeout");
});

// ─── The flow, against an in-memory Store table ───────────────────────────────

function fakeDb() {
  const rows = [
    { id: "store-A", userId: "user-A", slug: "ada", status: "active" },
    { id: "store-B", userId: "user-B", slug: "bolu", status: "active" },
    { id: "store-C", userId: "user-C", slug: "chi", status: "draft" },
  ].map((row) => ({ customDomain: null, customDomainKey: null, customDomainVerifiedAt: null, pendingDomain: null, domainVerifyToken: null, ...row }));
  const matches = (row, where = {}) => Object.entries(where).every(([key, cond]) => {
    if (key === "NOT") return !matches(row, cond);
    if (cond && typeof cond === "object" && "not" in cond) return row[key] !== cond.not;
    return row[key] === cond;
  });
  const pick = (row, select) => (row && select ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])) : row ? { ...row } : null);
  return {
    rows,
    store: {
      findUnique: async ({ where, select }) => pick(rows.find((row) => matches(row, where)), select),
      findFirst: async ({ where, select }) => pick(rows.find((row) => matches(row, where)), select),
      update: async ({ where, data, select }) => {
        const row = rows.find((r) => matches(r, where));
        if (!row) throw Object.assign(new Error("not found"), { code: "P2025" });
        if (data.customDomainKey && rows.some((r) => r !== row && r.customDomainKey === data.customDomainKey)) {
          throw Object.assign(new Error("unique"), { code: "P2002" });
        }
        Object.assign(row, data);
        return pick(row, select);
      },
    },
  };
}

globalThis.__dom = { db: fakeDb(), vercel: { configured: false, added: [], removed: [] } };
const ownership = await import("../src/lib/domains/ownership.server.ts");
const lookup = await import("../src/lib/domains/lookup.ts");

test("claim → verify → served; pending and unverified domains are never served; a second store is refused", async () => {
  const db = globalThis.__dom.db;
  const storeA = db.rows[0];

  const pending = await ownership.claimDomain("user-A", "https://WWW.Adas.ng/", "www");
  assert.equal(pending.live, null);
  assert.equal(pending.pending.domain, "www.adas.ng");
  assert.equal(storeA.customDomain, null, "a claim never sets the live domain");
  assert.equal(v.isVerifyToken(storeA.domainVerifyToken), true);
  const txt = pending.pending.records.find((r) => r.type === "TXT");
  assert.equal(txt.name, "_shopinbos-verify.adas.ng");
  assert.equal(await lookup.resolveCustomDomainSlug("www.adas.ng", 1), null, "pending is not served");

  // Claiming the same domain again keeps the token, so records already added still count.
  const token = storeA.domainVerifyToken;
  await ownership.claimDomain("user-A", "adas.ng", "www");
  assert.equal(storeA.domainVerifyToken, token);

  const wrong = await ownership.verifyPendingDomain("user-A", async () => [["shopinbos-verify=nope"]]);
  assert.equal(wrong.check.ok, false);
  assert.equal(wrong.check.code, "mismatch");
  assert.equal(storeA.customDomain, null);

  const ok = await ownership.verifyPendingDomain("user-A", async (name) => (name === "_shopinbos-verify.adas.ng" ? [[`shopinbos-verify=${token}`]] : []));
  assert.equal(ok.check.ok, true);
  assert.equal(ok.check.hosting.status, "not_configured", "no Vercel keys: hosting step skipped and said so");
  assert.equal(ok.state.live.domain, "www.adas.ng");
  assert.equal(ok.state.pending, null);
  assert.equal(storeA.customDomainKey, "adas.ng");
  assert.ok(storeA.customDomainVerifiedAt instanceof Date);
  assert.equal(storeA.domainVerifyToken, null);
  assert.equal(await lookup.resolveCustomDomainSlug("www.adas.ng", 2), "ada", "cache was cleared for the new domain");
  assert.equal(await lookup.resolveCustomDomainSlug("ADAS.ng.", 2), "ada", "the bare twin is served too");
  assert.deepEqual(await lookup.getStoreByCustomDomain("https://adas.ng"), { slug: "ada" });

  // Store B can't claim or take it, and the message names no store.
  await assert.rejects(ownership.claimDomain("user-B", "adas.ng"), (error) => error.code === "domain_taken" && error.status === 409 && !/ada|store-A/i.test(error.message.replace(/Shopinbos store/, "")));
  await assert.rejects(ownership.claimDomain("user-B", "www.ADAS.ng", "apex"), { code: "domain_taken" });
  assert.equal(db.rows[1].pendingDomain, null);
  assert.equal(await lookup.resolveCustomDomainSlug("www.adas.ng", 3), "ada", "A keeps its domain");

  // A race that slips past the check still hits the unique key.
  db.rows[1].pendingDomain = "adas.ng";
  db.rows[1].domainVerifyToken = v.newVerifyToken();
  await assert.rejects(ownership.verifyPendingDomain("user-B", async () => [[`shopinbos-verify=${db.rows[1].domainVerifyToken}`]]), { code: "domain_taken" });
  assert.equal(db.rows[1].customDomain, null);
  await ownership.removeDomain("user-B", "pending");

  // Switching between www and the bare address of a verified domain needs no new proof.
  const switched = await ownership.claimDomain("user-A", "adas.ng", "apex");
  assert.equal(switched.live.domain, "adas.ng");
  assert.equal(switched.pending, null);

  // Removing it stops it being served.
  const removed = await ownership.removeDomain("user-A", "live");
  assert.equal(removed.live, null);
  assert.equal(storeA.customDomainKey, null);
  assert.equal(await lookup.resolveCustomDomainSlug("adas.ng", 4), null);

  // Now that A let it go, B can prove it and take it.
  await ownership.claimDomain("user-B", "adas.ng");
  const bToken = db.rows[1].domainVerifyToken;
  const taken = await ownership.verifyPendingDomain("user-B", async () => [[`shopinbos-verify=${bToken}`]]);
  assert.equal(taken.check.ok, true);
  assert.equal(await lookup.resolveCustomDomainSlug("adas.ng", 5), "bolu");
});

test("only active stores are served; platform domains, rate limits and purchases", async () => {
  const db = globalThis.__dom.db;
  const storeC = db.rows[2];
  await ownership.claimDomain("user-C", "chi.store");
  await ownership.verifyPendingDomain("user-C", async () => [[`shopinbos-verify=${storeC.domainVerifyToken}`]]);
  assert.equal(storeC.customDomainKey, "chi.store");
  assert.equal(await lookup.resolveCustomDomainSlug("chi.store", 10), null, "a draft store isn't served even when verified");

  await assert.rejects(ownership.claimDomain("user-C", "chi.shopinbos.com"), { code: "invalid_domain" });
  await assert.rejects(ownership.claimDomain("user-C", "8.8.8.8"), { code: "invalid_domain" });
  await assert.rejects(ownership.verifyPendingDomain("user-C"), { code: "nothing_pending" });

  await ownership.claimDomain("user-C", "slow.ng");
  let limited = null;
  for (let i = 0; i < 12 && !limited; i++) {
    try {
      await ownership.verifyPendingDomain("user-C", async () => []);
    } catch (error) {
      limited = error;
    }
  }
  assert.equal(limited?.code, "rate_limited");
  assert.equal(limited?.status, 429);

  // A domain bought through the app is verified straight away, unless another store holds it.
  globalThis.__dom.vercel.configured = true;
  assert.equal(await ownership.markPurchasedDomainVerified("store-A", "AdaShop.com"), true);
  assert.equal(db.rows[0].customDomainKey, "adashop.com");
  assert.ok(db.rows[0].customDomainVerifiedAt);
  assert.equal(await ownership.markPurchasedDomainVerified("store-A", "adas.ng"), false, "held by store B");
  assert.equal(db.rows[0].customDomainKey, "adashop.com");
  assert.equal(await lookup.resolveCustomDomainSlug("adashop.com", 20), "ada");

  const removed = await ownership.removeDomain("user-A", "all");
  assert.equal(removed.live, null);
  assert.deepEqual(globalThis.__dom.vercel.removed, ["adashop.com"], "removed from hosting too");
  globalThis.__dom.vercel.configured = false;
});

test("wiring: nothing sets customDomain without verification", () => {
  const workspace = read("src/app/actions/workspace.ts");
  const fn = workspace.slice(workspace.indexOf("export async function saveStoreDomainSettings"), workspace.indexOf("export async function saveStoreBrandKitSettings"));
  assert.doesNotMatch(fn, /customDomain:/, "the settings action no longer writes customDomain");
  const connect = read("src/app/api/domains/connect/route.ts");
  assert.doesNotMatch(connect, /customDomain:|assignDomainOnVercel/, "connecting only records a pending claim");
  assert.match(read("src/app/api/domains/order/[orderId]/route.ts"), /markPurchasedDomainVerified\(store\.id/);
  assert.doesNotMatch(read("src/app/api/domains/order/[orderId]/route.ts"), /data: \{ customDomain:/);
  assert.match(read("src/app/api/domains/verify/route.ts"), /verifyPendingDomain\(user\.id\)/);
  const lookupSrc = read("src/lib/domains/lookup.ts");
  assert.match(lookupSrc, /customDomainVerifiedAt: \{ not: null \}/);
  assert.match(lookupSrc, /status: "active"/);
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /customDomainKey\s+String\?\s+@unique/);
  const sql = read("docs/migrations/2026-10-15-domain-verification.sql");
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "Store_customDomainKey_key"/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "domainVerifyToken"/);
});
