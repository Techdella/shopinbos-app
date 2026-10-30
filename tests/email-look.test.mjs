// The look of Shopinbos's own emails: navy classic, chat and celebrate; seasons; the proverb of the week.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const looks = await import("../src/lib/email/looks.ts");
const shell = await import("../src/lib/email/shell.ts");
const { seasonFor, SEASON_KEYS } = await import("../shared/seasons.ts");
const { proverbOfWeek, PROVERBS } = await import("../shared/proverbs.ts");
const APP = "https://app.shopinbos.com";
const LEGAL = { name: "Shopinbos", address: "Lagos" };
const at = (iso) => new Date(iso);

test("seasons: the right pattern and greeting on the right days (Lagos time)", () => {
  assert.equal(seasonFor(at("2026-10-23T10:00:00Z")).key, "default");
  assert.equal(seasonFor(at("2026-12-20T10:00:00Z")).key, "christmas");
  assert.equal(seasonFor(at("2026-12-05T10:00:00Z")).key, "detty-december");
  assert.equal(seasonFor(at("2026-12-31T23:30:00Z")).key, "new-year", "00:30 on 1 Jan in Lagos");
  assert.equal(seasonFor(at("2027-02-14T10:00:00Z")).key, "valentine");
  assert.equal(seasonFor(at("2027-03-10T10:00:00Z")).key, "sallah", "Eid al-Fitr 2027");
  assert.equal(seasonFor(at("2027-03-27T10:00:00Z")).key, "easter");
  assert.equal(seasonFor(at("2026-10-01T10:00:00Z")).key, "independence");
  assert.equal(seasonFor(at("2026-09-08T10:00:00Z")).key, "school");
  for (const key of SEASON_KEYS) assert.ok(fs.existsSync(`public/brand/email/strips/${key}.png`), `${key} strip exists`);
});

test("proverbs: one a week, the same all week, different next week", () => {
  const monday = proverbOfWeek(at("2026-10-19T08:00:00Z"));
  assert.equal(proverbOfWeek(at("2026-10-23T08:00:00Z")), monday);
  assert.notEqual(proverbOfWeek(at("2026-10-27T08:00:00Z")), monday);
  assert.ok(PROVERBS.length >= 12);
});

test("looks: classic has the navy header and season strip, no mint bar; chat and celebrate have theirs", () => {
  const base = { appUrl: APP, kind: "lifecycle", reason: "you have a Shopinbos seller account", legal: LEGAL, unsubscribeUrl: "#", preferencesUrl: "#", heading: "Hello", bodyHtml: "<p>Body</p>", cta: { label: "Go", url: "#" }, now: at("2026-12-20T10:00:00Z") };
  const classic = shell.platformEmail({ ...base, persona: "rex", proverb: "Patience can cook a stone.", personal: "Your shop this month: 4 orders." });
  assert.match(classic, /bgcolor="#0E2A38"/);
  assert.match(classic, /\/brand\/email\/strips\/christmas\.png/);
  assert.match(classic, /Merry Christmas! 🎄/);
  assert.match(classic, /Proverb of the week/);
  assert.match(classic, /Rex, from Shopinbos Business/);
  assert.match(classic, /📊 Your shop this month: 4 orders\./);
  assert.match(classic, />Go<span aria-hidden="true"> &rarr;<\/span>/);
  assert.match(classic, /Built in Lagos for businesses across Africa/);
  assert.doesNotMatch(classic, /#73D8C8;?"?\s*>?\s*<\/td>|border-top:4px solid #73D8C8/);
  const notice = shell.platformEmail({ ...base, kind: "transactional" });
  assert.doesNotMatch(notice, /Merry Christmas/, "no seasonal greeting on security and billing notices");
  const chat = shell.platformEmail({ ...base, look: "chat", persona: "peggy", bubbles: ["Hello Kemi 👋🏾", "Next step: <b>x</b>"], reply: "Okay Peggy, I'm on it 🙏🏾" });
  assert.match(chat, /Peggy from Shopinbos Business/);
  assert.match(chat, /Okay Peggy, I&#39;m on it/);
  assert.match(chat, /bgcolor="#F2A93B"/, "amber button, not WhatsApp green");
  assert.doesNotMatch(chat, /#25D366/);
  const party = shell.platformEmail({ ...base, look: "celebrate", persona: "rex", sticker: "OYA, CONGRATS! 🎉", stats: [{ value: "50", label: "free AI credits" }] });
  assert.match(party, /OYA, CONGRATS! 🎉/);
  assert.match(party, /bgcolor="#E86A4F"/);
  assert.match(party, /free AI credits/);
  assert.equal(looks.personaSender("peggy"), "Peggy from Shopinbos Business");
  assert.equal(looks.personaSender("team"), null);
});

test("looks: member emails reply to the support inbox and come from Rex or Peggy", () => {
  const tips = fs.readFileSync("src/lib/member-messaging/tips.server.ts", "utf8");
  assert.match(tips, /from: formatFromAddress\(personaSender\(persona\)\), replyTo: supportInbox\(\), proverb: mailT\(locale\)\(`proverb\.\$\{proverbIndex\(now\)\}` as MailKey\), locale/);
  assert.match(fs.readFileSync("src/lib/member-messaging/journeys.server.ts", "utf8"), /\.\.\.memberEmailExtras\(lookFor\.persona, now, locale\)/);
  assert.match(fs.readFileSync("src/lib/member-messaging/announce.server.ts", "utf8"), /memberEmailExtras\("peggy", now, locale\)/);
});
