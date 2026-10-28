// "Call Peggy" in the app: the call runs inside the phone app (ElevenLabs' React Native SDK, never a browser), Peggy
// saves while she talks (client tools → POST /api/mobile/peggy-call/action, the setup chat's cleanActions rules),
// she speaks English or Pidgin and writes everything in English, her notes reach the admin portal, and the after-call
// summary goes to the next missing step.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const tools = await import("../src/lib/onboarding/peggy-call-tools.ts");
const prompt = await import("../src/lib/ai/peggy-voice-prompt.ts");
const notes = await import("../src/lib/onboarding/peggy-notes.ts");
const webhook = await import("../src/lib/ai/elevenlabs-webhook.ts");
const pure = await import("../apps/mobile/src/lib/peggy-call-pure.ts");
const LANGS = ["en", "pcm", "yo", "ha", "ig"];

// ─── Tools and the action endpoint ───────────────────────────────────────────

test("tools: client tools for every saving action, plus notes, the summary and area lookups", () => {
  assert.deepEqual([...tools.VOICE_TOOL_NAMES].sort(), ["add_coverage", "add_pickup_point", "get_dashboard", "lookup_areas", "open_screen", "save_call_summary", "save_note", "save_pickup_address", "set_description", "set_starting_price"]);
  for (const tool of tools.elevenLabsTools()) {
    assert.equal(tool.type, "client", tool.name);
    assert.equal(tool.expects_response, true, tool.name);
    assert.equal(tool.parameters.type, "object");
    for (const key of tool.parameters.required) assert.ok(tool.parameters.properties[key], `${tool.name}.${key}`);
    for (const [key, param] of Object.entries(tool.parameters.properties)) assert.ok(param.description, `${tool.name}.${key} described`);
  }
  // What she saves is written in English.
  for (const name of ["save_pickup_address", "add_coverage", "set_description", "save_note", "save_call_summary"]) {
    assert.match(tools.VOICE_TOOLS.find((tool) => tool.name === name).description, /in English/, name);
  }
  // The phone registers exactly these tools.
  assert.deepEqual([...pure.CALL_TOOLS].sort(), [...tools.VOICE_TOOL_NAMES].sort());
});

test("action validation: a tool call becomes cleaned setup actions, only those the role may take", () => {
  assert.deepEqual(tools.toolActions("add_coverage", { city: "Abeokuta", areas: ["Lafenwa", "Kuto"] }, "logistics_partner"), [{ type: "add_coverage", areas: ["Ogun: Lafenwa", "Ogun: Kuto"], label: "Abeokuta – Lafenwa, Kuto" }]);
  assert.deepEqual(tools.toolActions("set_starting_price", { naira: "2500" }, "logistics_partner"), [{ type: "set_base_price", naira: 2500 }]);
  assert.deepEqual(tools.toolActions("set_starting_price", { naira: 50 }, "logistics_partner"), []);
  assert.deepEqual(tools.toolActions("set_starting_price", { naira: 2500 }, "seller"), []);
  assert.deepEqual(tools.toolActions("add_pickup_point", { address: "4 Kuto Road, Kuto", state: "Ogun" }, "supplier"), []);
  assert.deepEqual(tools.toolActions("save_call_summary", { text: "Set up Lafenwa and Kuto. Documents still to do." }, "supplier"), [{ type: "save_note", text: "Set up Lafenwa and Kuto. Documents still to do.", kind: "summary" }]);
  assert.deepEqual(tools.toolActions("save_note", { text: "Uses two bikes", kind: "summary" }, "seller"), [{ type: "save_note", text: "Uses two bikes", kind: "note" }]);
  assert.deepEqual(tools.toolActions("delete_account", {}, "seller"), []);
  assert.deepEqual(tools.toolActions("save_note", "junk", "seller"), []);
  assert.equal(tools.toolAllowed("lookup_areas", "seller"), true);
  assert.equal(tools.toolAllowed("add_pickup_point", "seller"), false);
});

test("action replies: short English lines that tell Peggy what happened", () => {
  assert.match(tools.toolReply("lookup_areas", { city: "Ijebu Ode" }, "seller", []), /^Ijebu-Ode \(Ogun\): .*Molipa/);
  assert.match(tools.toolReply("lookup_areas", { city: "Atlantis" }, "seller", []), /don't have a list/);
  assert.match(tools.toolReply("add_pickup_point", {}, "seller", []), /can't be saved for a seller/);
  assert.match(tools.toolReply("add_coverage", { areas: ["Atlantis"] }, "logistics_partner", []), /^Not saved: I couldn't place Atlantis/);
  assert.match(tools.toolReply("add_coverage", { city: "Lagos", areas: ["Yaba", "Atlantis"] }, "logistics_partner", ["Added delivery areas: Lagos – Yaba"]), /^Saved\. .*couldn't place Atlantis/);
  assert.match(tools.toolReply("set_starting_price", { naira: 5 }, "logistics_partner", []), /^Not saved: the price/);
  assert.equal(tools.toolReply("nope", {}, "seller", []), "That isn't something I can do on this call.");
});

test("action endpoint: signed in (or the web call's token), validated, rate-limited, status refreshed, no AI credits", () => {
  const route = read("src/app/api/mobile/peggy-call/action/route.ts");
  assert.match(route, /z\.object\(/);
  assert.match(route, /toolActions\(tool, params, status\.role\)/);
  assert.match(route, /applySetupActions\(/);
  assert.match(route, /const after = done\.length \? await setupStatus\(userId\) : status/);
  assert.match(route, /checkRateLimitShared\(rateLimitKey\("peggy-call-action"/);
  assert.match(route, /\["seller", "supplier", "logistics_partner"\]/);
  assert.match(route, /userFromCallToken/);
  assert.doesNotMatch(route, /aiText|chargeCredits|spendCredits|aiCredits/);
  // The tools reuse the setup chat's validation.
  assert.match(read("src/lib/onboarding/peggy-call-tools.ts"), /cleanActions\(\[raw\], role\)/);
});

test("starting a call: a WebRTC token, the same daily limit and maximum length", () => {
  const route = read("src/app/api/mobile/peggy-call/route.ts");
  assert.match(route, /startPeggyAppCall/);
  assert.match(route, /maxRequests: VOICE_CALLS_PER_DAY/);
  const server = read("src/lib/ai/peggy-voice.server.ts");
  assert.match(server, /export const VOICE_CALLS_PER_DAY = 5;/);
  assert.match(server, /const MAX_CALL_SECONDS = 900;/);
  assert.match(server, /max_duration_seconds: MAX_CALL_SECONDS/);
  assert.match(server, /\/convai\/conversation\/token\?agent_id=/);
  assert.match(server, /prompt: \{ prompt: PROMPT, tools: elevenLabsTools\(\), \.\.\.\(withSystemTools \? \{ built_in_tools: elevenLabsBuiltInTools\(\) \} : \{\}\) \}/);
  assert.match(server, /FIRST_MESSAGE = `.*\$\{PEGGY_LANGUAGE_QUESTION\}`/);
});

// ─── Prompt rules ────────────────────────────────────────────────────────────

test("prompt: English or Pidgin only, asked at the start; everything saved in English; a summary at the end", () => {
  const text = prompt.peggyVoicePrompt({ facts: "FACTS", cities: "Abeokuta (Ogun)" });
  assert.equal(prompt.PEGGY_LANGUAGE_QUESTION, "Would you like English or Pidgin?");
  assert.ok(text.includes(prompt.PEGGY_LANGUAGE_QUESTION));
  assert.match(text, /You speak only English or Nigerian Pidgin/);
  assert.match(text, /Everything you save is written in English, always/);
  assert.match(text, /save_call_summary/);
  assert.match(text, /save_note/);
  assert.doesNotMatch(text, /Yoruba|Hausa|Igbo|French/i);
  assert.match(text, /Never ask for passwords, card numbers, BVN, PINs or one-time codes/);
  // Places: ask which areas, confirm, save.
  assert.match(text, /In Abeokuta, which areas: Lafenwa, Kuto, Oke-Ilewo/);
  assert.match(text, /Confirm the areas back, then save them with add_coverage/);
  assert.match(text, /\{\{home_areas\}\}/);
  assert.match(text, /Abeokuta \(Ogun\)/);
  assert.ok(text.endsWith("FACTS"));
  // The voice server no longer carries any other language rules.
  assert.doesNotMatch(read("src/lib/ai/peggy-voice.server.ts"), /Yoruba|Hausa|Igbo|switch to Pidgin if they do/);
});

// ─── The phone app ───────────────────────────────────────────────────────────

test("phone: the call runs in the app, never in a browser or the web", () => {
  for (const file of ["apps/mobile/src/components/CallPeggyButton.tsx", "apps/mobile/src/components/peggy/PeggyCallEngine.tsx", "apps/mobile/src/components/peggy/PeggyCallHost.tsx", "apps/mobile/src/components/peggy/PeggyCallViews.tsx", "apps/mobile/src/lib/peggy-call.ts"]) {
    const source = read(file);
    assert.doesNotMatch(source, /expo-web-browser|openBrowserAsync|openWeb|openPath|Linking\.openURL|react-native-webview|call-peggy\?t=/, file);
  }
  const button = read("apps/mobile/src/components/CallPeggyButton.tsx");
  assert.match(button, /requestPeggyCall\(\)/);
  assert.match(button, /if \(!ready\) return null;/);
  const engine = read("apps/mobile/src/components/peggy/PeggyCallEngine.tsx");
  assert.match(engine, /from "@elevenlabs\/react-native"/);
  assert.match(engine, /conversationToken: session\.conversationToken, connectionType: "webrtc"/);
  assert.match(engine, /clientTools/);
  // Expo Go can't run it: the engine is only loaded where it can, and the button hides.
  assert.equal(pure.inAppCallPossible({ platform: "ios", expoGo: true }), false);
  assert.equal(pure.inAppCallPossible({ platform: "web", expoGo: false }), false);
  assert.equal(pure.inAppCallPossible({ platform: "android", expoGo: false }), true);
  assert.match(read("apps/mobile/src/components/peggy/PeggyCallHost.tsx"), /if \(!callsPossibleHere\(\)\) return null;/);
  assert.match(read("apps/mobile/src/app/_layout.tsx"), /<PeggyCallHost \/>/);
});

test("phone: SDK installed with LiveKit WebRTC and the Expo config plugins", () => {
  const pkg = JSON.parse(read("apps/mobile/package.json"));
  for (const dep of ["@elevenlabs/react-native", "@livekit/react-native", "@livekit/react-native-webrtc", "@livekit/react-native-expo-plugin", "@config-plugins/react-native-webrtc", "livekit-client"]) assert.ok(pkg.dependencies[dep], dep);
  // react-native-webview is in the app for Korapay's liveness check only; the call never falls back to a WebView.
  assert.doesNotMatch(read("apps/mobile/src/components/peggy/PeggyCallHost.tsx"), /react-native-webview|<WebView/, "no WebView fallback needed");
  const app = JSON.parse(read("apps/mobile/app.json"));
  const plugins = app.expo.plugins.map((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin));
  assert.ok(plugins.includes("@livekit/react-native-expo-plugin"));
  assert.ok(plugins.includes("@config-plugins/react-native-webrtc"));
  assert.ok(app.expo.android.permissions.includes("android.permission.RECORD_AUDIO"));
  assert.match(JSON.stringify(app.expo.plugins), /call Peggy/);
});

test("phone: minimize, live lines, ticks, and the summary that goes to the next missing step", () => {
  const views = read("apps/mobile/src/components/peggy/PeggyCallViews.tsx");
  for (const key of ["call.minimize", "call.onCall", "call.mute", "call.end", "call.summaryTitle", "call.edit"]) assert.ok(views.includes(`t("${key}")`), key);
  assert.equal(pure.editPath("logistics_partner", "coverage"), "/logistics/coverage");
  assert.equal(pure.editPath("supplier", "pickup_address"), "/supplier/setup?edit=pickup");
  assert.equal(pure.editPath("seller", "note"), null);
  assert.equal(pure.nextStepPath("logistics_partner", "rates"), "/logistics/rates");
  assert.equal(pure.nextStepPath("seller", "delivery"), "/start");
  assert.equal(pure.nextStepPath("supplier", null), null);
  // The partner wizard never jumps to documents while something Peggy helps with is missing.
  const steps = (missing) => ["profile", "coverage", "pickup", "rates", "documents", "bank"].map((id) => ({ id, done: !missing.includes(id) }));
  assert.equal(pure.partnerWizardStep(steps(["coverage", "documents"])), "cover");
  assert.equal(pure.partnerWizardStep(steps(["rates", "documents", "bank"])), "rates");
  assert.equal(pure.partnerWizardStep(steps(["documents", "bank"])), "docs");
  assert.equal(pure.partnerWizardStep(steps(["bank"])), "payout");
  assert.equal(pure.supplierWizardStep([{ id: "pickup", done: false }, { id: "documents", done: false }]), "pickup");
  assert.equal(pure.callClock(75), "1:15");
  // Setup screens refresh as she saves and take Continue to their own next step.
  for (const file of ["apps/mobile/src/app/logistics/setup.tsx", "apps/mobile/src/app/supplier/setup.tsx", "apps/mobile/src/app/start.tsx"]) {
    const source = read(file);
    assert.match(source, /usePeggySaved\(/, file);
    assert.match(source, /usePeggyContinue\(/, file);
  }
});

test("phone: Call Peggy is everywhere: setup from the first step, Help, Home or More, Ask Peggy", () => {
  assert.match(read("apps/mobile/src/app/logistics/setup.tsx"), /<CallPeggyButton variant="compact" \/>/);
  assert.match(read("apps/mobile/src/app/logistics/setup.tsx"), /<CallPeggyButton style=\{\{ marginTop: 6 \}\} \/>/);
  assert.match(read("apps/mobile/src/app/supplier/setup.tsx"), /aside=\{peggy\}/);
  for (const file of ["apps/mobile/src/app/help/index.tsx", "apps/mobile/src/app/start.tsx", "apps/mobile/src/app/(tabs)/home.tsx", "apps/mobile/src/app/supplier/account.tsx", "apps/mobile/src/app/logistics/(tabs)/more.tsx", "apps/mobile/src/app/ask-peggy.tsx"]) {
    assert.match(read(file), /<CallPeggyButton/, file);
  }
  // Shopinbos's own "Call Peggy" status starts the call.
  assert.match(read("apps/mobile/src/lib/shopinbos.ts"), /cta\?\.kind === "call_peggy"[\s\S]*requestPeggyCall\(\)/);
});

test("words: the call's lines and the Call Peggy statuses in all five languages", async () => {
  const help = Object.fromEntries(await Promise.all(LANGS.map(async (lang) => [lang, (await import(`../shared/i18n/messages/m_help/${lang}.ts`)).default])));
  const keys = ["call.short", "call.backTo", "call.minimize", "call.onCall", "call.summaryTitle", "call.next", ...["pickup_address", "pickup_point", "coverage", "price", "description", "note", "summary"].map((kind) => pure.savedKey(kind)), ...pure.STEP_IDS.map((id) => pure.stepKey(id))];
  for (const lang of LANGS) for (const key of keys) assert.ok(help[lang][key], `${lang} ${key}`);
  assert.equal(help.en["call.saved.coverage"], "Peggy added coverage: {detail}");
  const familiar = Object.fromEntries(await Promise.all(LANGS.map(async (lang) => [lang, (await import(`../shared/i18n/messages/m_familiar/${lang}.ts`)).default])));
  for (const lang of LANGS) for (const role of ["seller", "supplier", "partner"]) for (const part of ["title", "body", "cta"]) assert.ok(familiar[lang][`sib.${role}.call.${part}`], `${lang} ${role} ${part}`);
});

// ─── Notes for the team ──────────────────────────────────────────────────────

test("notes: stored per person with source peggy_call (no new table), kept out of Rex's answers", () => {
  const server = read("src/lib/onboarding/peggy-notes.server.ts");
  assert.match(server, /db\.onboardingResponse\.create/);
  assert.match(server, /source: PEGGY_NOTE_SOURCE/);
  assert.equal(notes.PEGGY_NOTE_SOURCE, "peggy_call");
  assert.match(read("src/lib/ai/rex-onboarding.ts"), /source: \{ not: "peggy_call" \}/);
  const note = notes.readPeggyNote({ id: "n1", answer: { text: " Has two bikes ", kind: "summary", via: "elevenlabs", conversationId: "c1" }, createdAt: new Date("2026-10-24T10:00:00Z") });
  assert.deepEqual(note, { id: "n1", kind: "summary", text: "Has two bikes", via: "elevenlabs", conversationId: "c1", createdAt: "2026-10-24T10:00:00.000Z" });
  assert.equal(notes.readPeggyNote({ id: "x", answer: { text: "" }, createdAt: new Date() }), null);
  assert.equal(notes.readPeggyNote({ id: "x", answer: "junk", createdAt: new Date() }), null);
});

test("admin: Peggy call notes (English) on the seller, supplier and delivery partner pages", () => {
  const view = read("src/components/admin/PeggyCallNotes.tsx");
  assert.match(view, /Peggy call notes \(English\)/);
  assert.match(view, /if \(!notes\.length\) return null;/);
  assert.match(view, /peggyNotes\(userId\)/);
  assert.match(read("src/app/admin/sellers/[id]/page.tsx"), /<PeggyCallNotes userId=\{seller\.userId\} \/>/);
  assert.match(read("src/app/admin/suppliers/[id]/page.tsx"), /<PeggyCallNotes userId=\{supplier\.userId\} \/>[\s\S]*<AdminDocumentViewer/);
  assert.match(read("src/app/admin/logistics-partners/[id]/page.tsx"), /<PeggyCallNotes userId=\{partner\.userId\} \/>[\s\S]*<AdminDocumentViewer/);
});

test("post-call webhook: HMAC-checked, recent only, and the summary goes with the person's notes", () => {
  const secret = "whsec_test_secret_123";
  const body = JSON.stringify({ type: "post_call_transcription", data: { conversation_id: "conv1", analysis: { transcript_summary: "Covered Lafenwa and Kuto." }, conversation_initiation_client_data: { dynamic_variables: { user_ref: "user_1" } } } });
  const now = 1_800_000_000;
  const sign = (t, payload = body, key = secret) => `t=${t},v0=${createHmac("sha256", key).update(`${t}.${payload}`).digest("hex")}`;
  assert.equal(webhook.verifyElevenLabsSignature(body, sign(now), secret, now), true);
  assert.equal(webhook.verifyElevenLabsSignature(body, sign(now, body, "other"), secret, now), false);
  assert.equal(webhook.verifyElevenLabsSignature(`${body} `, sign(now), secret, now), false);
  assert.equal(webhook.verifyElevenLabsSignature(body, sign(now - 3600), secret, now), false);
  assert.equal(webhook.verifyElevenLabsSignature(body, null, secret, now), false);
  assert.equal(webhook.verifyElevenLabsSignature(body, sign(now), "", now), false);
  assert.deepEqual(webhook.readPostCall(JSON.parse(body)), { userId: "user_1", conversationId: "conv1", summary: "Covered Lafenwa and Kuto." });
  assert.equal(webhook.readPostCall({ type: "post_call_audio", data: {} }), null);
  const route = read("src/app/api/webhooks/elevenlabs/route.ts");
  assert.match(route, /verifyElevenLabsSignature\(raw, req\.headers\.get\("elevenlabs-signature"\), process\.env\.ELEVENLABS_WEBHOOK_SECRET\)/);
  assert.match(route, /kind: "summary"/);
});

// ─── Round 2: Peggy ends calls, knows the dashboard, opens screens, and is shown as her avatar ───────────────

const rules = await import("../src/lib/onboarding/setup-rules.ts");
const snapshot = await import("../src/lib/ai/peggy-dashboard.ts");
const screens = await import("../shared/peggy-screens.ts");

test("end_call: ElevenLabs' system tool in the agent config, and a rejected sync is retried safely", () => {
  const builtIn = tools.elevenLabsBuiltInTools();
  assert.deepEqual(Object.keys(builtIn), ["end_call"]);
  assert.equal(builtIn.end_call.type, "system");
  assert.equal(builtIn.end_call.name, "end_call");
  assert.deepEqual(builtIn.end_call.params, { system_tool_type: "end_call" });
  assert.match(builtIn.end_call.description, /goodbye/);
  const server = read("src/lib/ai/peggy-voice.server.ts");
  assert.match(server, /built_in_tools: elevenLabsBuiltInTools\(\)/);
  // Version saved only once ElevenLabs takes the full config; otherwise the agent still gets the rest, and it's retried.
  assert.match(server, /if \(synced\) await db\.platformSetting\.upsert/);
  assert.match(server, /agentConfig\(\{ withSystemTools: false \}\)/);
  assert.match(server, /saveAs = "partial"/);
  // Peggy is told when to hang up.
  const text = prompt.peggyVoicePrompt({ facts: "F", cities: "C" });
  assert.match(text, /end the call with end_call/);
  // The phone shows the summary when Peggy hangs up; the web says she ended the call.
  const engine = read("apps/mobile/src/components/peggy/PeggyCallEngine.tsx");
  assert.match(engine, /details\?\.reason === "agent"/);
  assert.match(engine, /patchCall\(\{ phase: "summary", minimized: false, endedBy \}\)/);
  assert.match(read("apps/mobile/src/components/peggy/PeggyCallViews.tsx"), /t\("call\.peggyEnded"\)/);
  assert.match(read("src/components/peggy/PeggyCall.tsx"), /setEndedByPeggy\(details\?\.reason === "agent"\)/);
});

test("published store: what publishing writes counts as live (no launch payment needed)", () => {
  // src/lib/store-publishing.ts publishStoreDraft: status "active", onboardingState "LIVE", editor.published = the draft.
  const published = { status: "active", onboardingState: "LIVE", brandSettings: { editor: { draft: { pages: [] }, published: { pages: [] } } }, paidLaunches: 0 };
  assert.equal(rules.storeIsLive(published), true);
  assert.equal(rules.storeIsLive({ ...published, onboardingState: "INCOMPLETE" }), true, "editor.published on an active store");
  assert.equal(rules.storeIsLive({ status: "active", onboardingState: "NEW", brandSettings: { editor: { draft: {} } }, paidLaunches: 0 }), false, "a new store with the default status isn't live");
  assert.equal(rules.storeIsLive({ status: "active", onboardingState: null, brandSettings: {}, paidLaunches: 1 }), true, "an old paid launch");
  assert.equal(rules.storeIsLive({ status: "suspended", onboardingState: "BUILDING_REX", brandSettings: { editor: { published: {} } } }), false);
  const status = read("src/lib/onboarding/setup-status.server.ts");
  assert.match(status, /done: live, href: "\/studio"/);
  assert.match(status, /storeIsLive\(\{ onboardingState: st\.onboardingState, status: st\.status, brandSettings: st\.brandSettings/);
  assert.match(read("src/lib/store-publishing.ts"), /status: "active", onboardingState: "LIVE"/);
});

test("setup steps: done anywhere (web or phone) is never reported missing", () => {
  assert.equal(rules.bankIsSet({ walletAccountNumber: "0123456789" }), true);
  assert.equal(rules.bankIsSet({ walletSubaccountStatus: "review" }), true);
  assert.equal(rules.bankIsSet({ payoutAccount: true }), true);
  assert.equal(rules.bankIsSet({ brandSettings: { payoutBank: { accountNumberMask: "****6789" } } }), true);
  assert.equal(rules.bankIsSet({ walletSubaccountStatus: "none" }), false);
  assert.equal(rules.sellerDeliverySet({ deliverySettings: false, activeZones: 2, deliveryPartners: 0 }), true);
  assert.equal(rules.sellerDeliverySet({ deliverySettings: false, activeZones: 0, deliveryPartners: 1 }), true);
  assert.equal(rules.sellerDeliverySet({ deliverySettings: false, activeZones: 0, deliveryPartners: 0 }), false);
  assert.equal(rules.documentsDone(2, "verified"), true);
  assert.equal(rules.documentsDone(1, "pending"), false);
  // The phone's supplier set-up saves the pickup address as "Where I ship from".
  assert.equal(rules.supplierPickupSet({ address: null, pickupAddress: null, originAddress: "4 Kuto Road, Abeokuta" }), true);
  assert.equal(rules.supplierProfileSet({ businessName: "Ade Fabrics", city: null, categories: ["fashion"] }), true);
  // The phone's partner set-up writes deliveryAreas and a public rate card, not coverageZones or basePrice.
  assert.equal(rules.partnerCoverageSet({ coverageZones: [], deliveryAreas: ["Lagos: Ikeja"] }), true);
  assert.equal(rules.partnerRatesSet({ basePrice: 0, rateCards: 1 }), true);
  assert.equal(rules.partnerRatesSet({ basePrice: 0, rateCards: 0 }), false);
  assert.equal(rules.partnerProfileSet({ companyName: "Swift Riders", city: null, address: "2 Allen Ave, Ikeja" }), true);
  const status = read("src/lib/onboarding/setup-status.server.ts");
  for (const rule of ["supplierPickupSet", "supplierProfileSet", "partnerCoverageSet", "partnerRatesSet", "partnerProfileSet", "sellerDeliverySet", "bankIsSet", "documentsDone"]) assert.match(status, new RegExp(rule), rule);
});

test("dashboard snapshots: short English lines per role, sent at the start and by get_dashboard", () => {
  const seller = snapshot.sellerSnapshot({ shop: "Glow by Amaka", url: "https://glow.shopinbos.com", live: true, plan: "Starter", products: 12, lowStock: 2, outOfStock: 1, ordersToday: 3, ordersWeek: 9, unpaid: 1, toSend: 2, bankSet: true, deliverySet: true, credits: 140, unreadChats: 4, reviewsMonth: 5 });
  assert.match(seller, /Published: yes, it's live/);
  assert.match(seller, /Products: 12 \(2 running low, 1 sold out\)/);
  assert.match(seller, /3 today, 9 this week; 1 not paid yet, 2 to send out/);
  assert.match(seller, /Payout bank set: yes\. Delivery set up: yes\. AI credits: 140/);
  assert.match(seller, /Unread chats: 4\. Reviews in the last 30 days: 5/);
  assert.match(snapshot.sellerSnapshot({ shop: "X", url: null, live: false, plan: "Free", products: 0, lowStock: 0, outOfStock: 0, ordersToday: 0, ordersWeek: 0, unpaid: 0, toSend: 0, bankSet: false, deliverySet: false, credits: 0, unreadChats: 0, reviewsMonth: 0 }), /Published: no, not yet/);
  const supplier = snapshot.supplierSnapshot({ business: "Ade Fabrics", verification: "pending", products: 8, published: 6, lowStock: 1, toAccept: 2, toSend: 3, quotes: 1, bankSet: true, pickupSet: true, deliveryPartners: 0, selfDelivery: true });
  assert.match(supplier, /Verification: waiting for the team's review/);
  assert.match(supplier, /2 waiting to be accepted, 3 to send\. Quotes waiting: 1/);
  assert.match(supplier, /Delivery: delivers itself/);
  const partner = snapshot.partnerSnapshot({ company: "Swift Riders", verification: "verified", cacNumber: true, coverage: ["Lagos: Ikeja", "Lagos: Yaba"], pickupPoints: 2, ratesSet: true, startingPrice: 2500, riders: 3, newJobs: 1, activeJobs: 4, unassigned: 1, cashOwed: 45000, bankSet: false });
  assert.match(partner, /CAC number given: yes/);
  assert.match(partner, /Delivers to: Lagos: Ikeja, Lagos: Yaba\. Pickup points: 2\. Rates set: yes, from ₦2,500/);
  assert.match(partner, /Riders: 3\. Jobs: 1 new waiting, 4 active, 1 with no rider yet/);
  assert.match(partner, /cash owed to sellers: ₦45,000\. Bank for payments set: no/);
  for (const text of [seller, supplier, partner]) assert.ok(text.length < 600, "short");
  // Built server-side from the dashboards' helpers, and given to Peggy with the rule to trust it.
  const server = read("src/lib/ai/peggy-dashboard.server.ts");
  for (const helper of ["computeDashboard", "supplierFacts", "partnerFacts", "getSellerOnboardingStatus", "creditBalance", "sellerPlan"]) assert.match(server, new RegExp(helper), helper);
  assert.match(read("src/lib/ai/peggy-voice.server.ts"), /dashboard: dashboard \|\|/);
  const text = prompt.peggyVoicePrompt({ facts: "F", cities: "C" });
  assert.match(text, /\{\{dashboard\}\}/);
  assert.match(text, /Never say something is missing or not done when they say it's done/);
  assert.match(text, /call get_dashboard/);
  assert.match(read("src/app/api/mobile/peggy-call/action/route.ts"), /if \(tool === "get_dashboard"\)[\s\S]*peggyDashboard\(userId, status\)/);
});

test("open_screen: only allow-listed screens per role; unknown ones are refused", () => {
  for (const role of ["seller", "supplier", "logistics_partner"]) {
    const list = screens.PEGGY_SCREENS[role];
    assert.ok(list.length >= 10, role);
    assert.equal(new Set(list.map((s) => s.id)).size, list.length, `${role} ids unique`);
    for (const screen of list) {
      assert.match(screen.app, /^\/[a-z]/, `${role} ${screen.id}`);
      assert.doesNotMatch(screen.app + (screen.web ?? ""), /admin|checkout|credits|billing|topup|top-up/i, `${role} ${screen.id} never a money or admin page`);
    }
  }
  assert.equal(screens.findScreen("seller", "delivery").app, "/delivery");
  assert.equal(screens.findScreen("seller", "Add a product").app, "/add-products");
  assert.equal(screens.findScreen("supplier", "pickup").app, "/supplier/setup?edit=pickup");
  assert.equal(screens.findScreen("logistics_partner", "riders").app, "/logistics/team");
  assert.equal(screens.findScreen("logistics_partner", "pickup points").app, "/logistics/points");
  assert.equal(screens.findScreen("seller", "admin"), null);
  assert.equal(screens.findScreen("seller", "/admin/users"), null);
  assert.equal(screens.findScreen("seller", "riders"), null, "another role's screen");
  assert.equal(screens.findScreen("supplier", 42), null);
  // Phone: the route to push, or a refusal (nothing opens).
  const opened = pure.openScreenOnPhone("logistics_partner", { screen: "coverage" });
  assert.equal(opened.route, "/logistics/coverage");
  assert.match(opened.reply, /^Opened Where you deliver\. .*Don't press anything/);
  const refused = pure.openScreenOnPhone("seller", { screen: "delete account" });
  assert.equal(refused.route, null);
  assert.match(refused.reply, /^Not opened/);
  // Web: web paths, never from the signed-out call page, never for phone-only screens.
  assert.equal(screens.openScreenOnWeb("seller", { screen: "delivery" }).path, "/home/shipping");
  assert.equal(screens.openScreenOnWeb("seller", { screen: "delivery" }, false).path, null);
  assert.equal(screens.openScreenOnWeb("supplier", { screen: "help" }).path, null);
  assert.equal(screens.openScreenOnWeb(null, { screen: "delivery" }).path, null);
  assert.equal(screens.screenRoleFromWords("delivery partner"), "logistics_partner");
  // The phone minimizes the call, pushes the route and shows a toast; every screen name has words in all languages.
  const engine = read("apps/mobile/src/components/peggy/PeggyCallEngine.tsx");
  assert.match(engine, /patchCall\(\{ minimized: true \}\);\s*router\.push\(route as never\);/);
  assert.match(engine, /t\("call\.opened"/);
  assert.match(read("src/components/peggy/PeggyCall.tsx"), /openScreenOnWeb\(role\.current, params, !token\)/);
  const text = prompt.peggyVoicePrompt({ facts: "F", cities: "C" });
  assert.match(text, /\{\{screens\}\}/);
  assert.match(text, /never press or submit anything for them, and never anything that spends money, without them saying yes/);
  assert.match(read("src/lib/ai/peggy-voice.server.ts"), /screens: screenList\(status\.role\)/);
  assert.equal(tools.toolAllowed("open_screen", "seller"), true);
  assert.match(tools.toolReply("open_screen", { screen: "delivery" }, "seller", []), /^Not opened/);
});

test("words: the opened toast, every screen name and Peggy ending the call, in all five languages", async () => {
  const help = Object.fromEntries(await Promise.all(LANGS.map(async (lang) => [lang, (await import(`../shared/i18n/messages/m_help/${lang}.ts`)).default])));
  const ids = new Set(Object.values(screens.PEGGY_SCREENS).flat().map((s) => s.id));
  for (const lang of LANGS) {
    assert.match(help[lang]["call.opened"], /\{screen\}/, lang);
    assert.ok(help[lang]["call.peggyEnded"], lang);
    for (const id of ids) assert.ok(help[lang][`call.screen.${id}`], `${lang} ${id}`);
  }
});

test("avatar: no P letter mark left in the call UI; Peggy's avatar pulses while she speaks", () => {
  for (const file of ["src/components/peggy/PeggyCall.tsx", "src/components/peggy/SetupWithPeggy.tsx", "src/components/peggy/SetupWithPeggySlot.tsx", "apps/mobile/src/components/peggy/PeggyCallViews.tsx", "apps/mobile/src/components/peggy/PeggyCallEngine.tsx", "apps/mobile/src/components/CallPeggyButton.tsx"]) {
    const source = read(file);
    assert.doesNotMatch(source, />\s*P\s*</, file);
    assert.doesNotMatch(source, /["']P["']/, file);
  }
  const views = read("apps/mobile/src/components/peggy/PeggyCallViews.tsx");
  assert.match(views, /export function PeggyAvatar/);
  assert.match(views, /<Mascot who="peggy"/);
  assert.match(views, /Animated\.loop/);
  assert.match(views, /isReduceMotionEnabled/);
  // The sheet, the minimized bar (which also carries the "Peggy opened …" line) and the summary all show her.
  assert.equal((views.match(/<PeggyAvatar /g) ?? []).length, 3);
  const web = read("src/components/peggy/PeggyCall.tsx");
  assert.match(web, /<Mascot who="peggy"/);
  assert.match(web, /speaking && "animate-ping"/);
});

test("the call engine registers its controls once (no render loop)", async () => {
  const { readFileSync } = await import("node:fs");
  const engine = readFileSync(new URL("../apps/mobile/src/components/peggy/PeggyCallEngine.tsx", import.meta.url), "utf8");
  const store = readFileSync(new URL("../apps/mobile/src/lib/peggy-call.ts", import.meta.url), "utf8");
  // useConversation returns a new object each render: start/end must not depend on it.
  const { default: assert } = await import("node:assert/strict");
  assert.match(engine, /conversationRef\.current\.startSession/);
  assert.doesNotMatch(engine, /\[clientTools, conversation/);
  assert.doesNotMatch(engine, /\}, \[start, end\]\)/);
  assert.match(store, /if \(state\.engine !== Boolean\(next\)\)/);
});
