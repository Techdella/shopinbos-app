import fs from "node:fs";
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const S = "/tmp/claude-0/-home-user-shopinbos-app/aa9340e2-0807-5f2d-b0c3-cfaeae1094cd/scratchpad";
const B = "http://localhost:3100";
const TOKENS = { seller: "smoke-seller", supplier: "smoke-supplier", logistics_partner: "smoke-logistics", admin: "smoke-admin" };
const log = fs.readFileSync(`${S}/smoke.log`, "utf8");
const pages = [...log.matchAll(/^ok\s+200 (seller|supplier|logistics_partner|admin)\s+(\/\S*)/gm)]
  .map((m) => ({ role: m[1], url: m[2] }))
  .filter((p) => !p.url.startsWith("/api") && !p.url.startsWith("/r/") && !/^\/(s|store|preview|_domain|builder|seller\/store)\b/.test(p.url) && !p.url.includes("/print"));
const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
const widths = [360, 768, 1440, 2560];
const browser = await chromium.launch();
const problems = [];
fs.mkdirSync(`${S}/sweep`, { recursive: true });
for (const role of Object.keys(TOKENS)) {
  const session = { access_token: TOKENS[role], refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: TOKENS[role] } };
  for (const width of widths) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), domain: "localhost", path: "/" }]);
    // Skip the walkthrough so it doesn't cover pages.
    await ctx.addInitScript(() => { try { localStorage.setItem("shopinbos:prefs", JSON.stringify({ hiddenNav: [], tour: "done" })); } catch {} });
    const page = await ctx.newPage();
    let errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    page.on("console", (m) => { if (m.type() === "error" && !/insights|favicon|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200)); });
    for (const p of pages.filter((p) => p.role === role && (!only || only.test(p.url)))) {
      errors = [];
      try {
        await page.goto(B + p.url, { waitUntil: "networkidle", timeout: 30000 });
      } catch (e) { problems.push({ ...p, width, issue: "load " + String(e).slice(0, 80) }); continue; }
      await page.waitForTimeout(300);
      const info = await page.evaluate(() => {
        const main = document.querySelector("main .overflow-y-auto") || document.scrollingElement;
        const over = document.documentElement.scrollWidth - window.innerWidth;
        const inner = main ? main.scrollWidth - main.clientWidth : 0;
        const wide = [...document.querySelectorAll("main *")].filter((el) => { const r = el.getBoundingClientRect(); return r.right > window.innerWidth + 2 && r.width > 0 && getComputedStyle(el).position !== "fixed" && !el.closest("[class*='overflow-x-auto'],[class*='overflow-auto'],.tbl"); }).slice(0, 3).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
        const text = document.body.innerText;
        return { over, inner, wide, err: /Something went wrong|Application error|Unhandled Runtime Error/.test(text) };
      });
      if (info.over > 1 || info.inner > 1) problems.push({ ...p, width, issue: `overflow ${Math.max(info.over, info.inner)}px ${info.wide.join(" | ")}` });
      if (info.err) problems.push({ ...p, width, issue: "error boundary" });
      if (errors.length) problems.push({ ...p, width, issue: "console: " + errors[0] });
      if ((width === 360 || width === 1440) && process.argv[3] === "shots") await page.screenshot({ path: `${S}/sweep/${role}${p.url.replace(/\//g, "_")}-${width}.png` });
    }
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(`${S}/sweep.json`, JSON.stringify(problems, null, 1));
console.log(`pages ${pages.length}, problems ${problems.length}`);
for (const p of problems) console.log(p.width, p.role, p.url, p.issue);
