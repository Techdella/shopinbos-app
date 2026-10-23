// Member stories (shared with consent) and the Rex video preview in video tips.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const s = await import("../shared/member-stories.ts");
const { TIPS } = await import("../src/lib/member-messaging/tips-library.ts");
const e = await import("../src/lib/member-messaging/tips-email.ts");
const read = (path) => fs.readFileSync(path, "utf8");
const good = { displayName: "Kemi, Kemi's Fabrics", city: "Ibadan", result: "40 orders in my first month", story: "I posted one Rex video a day on my Status and the orders started coming in from people I never met.", consent: true };

test("stories: consent, lengths and no contact details", () => {
  assert.equal(s.checkStory(good).ok, true);
  assert.match(s.checkStory({ ...good, consent: false }).error, /Tick the box/);
  assert.match(s.checkStory({ ...good, story: "Too short." }).error, /a little more/);
  assert.match(s.checkStory({ ...good, story: good.story + " x".repeat(250) }).error, /under 400/);
  for (const bad of ["Call me on 0803 123 4567 for wholesale prices, I sell plenty", "Email kemi@example.com for prices and more of my fabric stories", "Visit https://kemi.example to see more of my fabrics and prices please"]) {
    assert.match(s.checkStory({ ...good, story: bad }).error, /contact details/, bad);
  }
  assert.equal(s.checkStory({ ...good, city: "  ", result: "" }).value.city, null);
  const text = s.consentText();
  assert.match(text, /won't share my phone number, email or any other contact details/);
  assert.match(text, /stop this any time/);
  assert.equal(s.CONSENT_VERSION, "v1");
});

test("stories: a reader sees approved stories for their role, never their own, taking turns", () => {
  const stories = [
    { id: "a", userId: "u1", role: "seller", status: "approved" },
    { id: "b", userId: "u2", role: "seller", status: "approved" },
    { id: "c", userId: "u3", role: "seller", status: "submitted" },
    { id: "d", userId: "u4", role: "supplier", status: "approved" },
    { id: "e", userId: "u5", role: "seller", status: "withdrawn" },
  ];
  assert.equal(s.storyForReader(stories, "seller", "u1", 0).id, "b");
  assert.equal(s.storyForReader(stories, "seller", "u9", 0).id, "a");
  assert.equal(s.storyForReader(stories, "seller", "u9", 1).id, "b");
  assert.equal(s.storyForReader(stories, "supplier", "u4", 3), null);
  assert.equal(s.storyForReader(stories, "logistics_partner", "u9", 0), null);
  assert.equal(s.storyWeek(new Date("2026-01-12T00:00:00Z")), 1);
});

test("tip email: the member's story in their own words, and the Rex video only in video tips", () => {
  const videoTip = TIPS.find((tip) => tip.topic === "rex-videos");
  const otherTip = TIPS.find((tip) => tip.topic !== "rex-videos" && tip.role === "seller");
  const video = { kind: "member", videoUrl: "https://media.example/v.mp4", posterUrl: "https://media.example/p.jpg", name: "Kemi <Fabrics>" };
  const base = { firstName: "Ada", ctaUrl: "https://app.shopinbos.com/tip/x", storyUrl: "https://app.shopinbos.com/story", story: { displayName: "Kemi", city: "Ibadan", result: "40 orders", story: "My <b>own</b> words." }, video };
  const withVideo = e.renderTipEmail(videoTip, base).bodyHtml;
  assert.match(withVideo, /href="https:\/\/media\.example\/v\.mp4"/);
  assert.match(withVideo, /src="https:\/\/media\.example\/p\.jpg"/);
  assert.match(withVideo, /Made with Rex by Kemi &lt;Fabrics&gt;/);
  assert.match(withVideo, /From a real member/);
  assert.match(withVideo, /My &lt;b&gt;own&lt;\/b&gt; words\./);
  assert.match(withVideo, /Kemi, Ibadan/);
  assert.match(withVideo, /href="https:\/\/app\.shopinbos\.com\/story"/);
  const without = e.renderTipEmail(otherTip, base).bodyHtml;
  assert.ok(!without.includes("v.mp4"), "no video outside video tips");
  assert.match(without, /From a real member/);
  assert.match(e.renderTipEmail(videoTip, { ...base, video: { ...video, kind: "yours" } }).bodyHtml, /Your latest Rex video/);
  const yo = e.renderTipEmail(videoTip, { ...base, locale: "yo" }).bodyHtml;
  assert.ok(!yo.includes("From a real member") && !yo.includes("Watch it"), "wrapper in their language");
  assert.match(yo, /My &lt;b&gt;own&lt;\/b&gt; words\./, "the story stays in the member's own words");
  const none = e.renderTipEmail(videoTip, { firstName: "Ada", ctaUrl: "x" }).bodyHtml;
  assert.ok(!none.includes("From a real member") && !none.includes("&#9654;"));
});

test("stories: member pages, admin review and the senders follow the consent rules", () => {
  for (const [path, role] of [["src/app/home/story/page.tsx", "seller"], ["src/app/supplier/story/page.tsx", "supplier"], ["src/app/logistics/story/page.tsx", "logistics_partner"]]) {
    assert.match(read(path), new RegExp(`requireRole\\(\\["${role}"\\]`));
    assert.match(read(path), /<ShareStory/);
  }
  const form = read("src/components/member-stories/ShareStory.tsx");
  assert.match(form, /name="consent" value="yes" required/);
  assert.match(form, /\{consentText\(\)\}/, "the consent shown is the consent stored");
  assert.match(form, /Stop using my story/);
  const server = read("src/lib/member-messaging/stories.server.ts");
  assert.match(server, /consentText: consentText\(\)/);
  assert.match(server, /status: "submitted"/, "a new version goes back for review");
  assert.match(server, /where: \{ id: input\.videoProjectId, userId: user\.id/, "only their own video");
  assert.match(server, /story\.status === "withdrawn"\) return \{ ok: false/, "a withdrawn story can't be approved");
  assert.match(server, /where: \{ status: "approved" \}/);
  const actions = read("src/app/admin/member-stories/actions.ts");
  assert.equal((actions.match(/requireAdminSection\("leads"\)/g) ?? []).length, 2);
  assert.match(read("src/app/admin/member-stories/page.tsx"), /requireAdminSection\("leads"\)/);
  const tips = read("src/lib/member-messaging/tips.server.ts");
  assert.match(tips, /pickStory\(stories, role, person\.id, now\)/);
  assert.match(tips, /tip\.topic === "rex-videos" \? await videoPreviewFor\(person\.id/);
  assert.match(tips, /if \(story\) await markStoryShown\(story\.id\)/);
  assert.equal((read("src/lib/admin-team/pure.ts").match(/"member-stories": "leads"/g) ?? []).length, 2);
});
