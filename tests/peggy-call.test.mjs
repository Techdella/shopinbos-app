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
  assert.deepEqual([...tools.VOICE_TOOL_NAMES].sort(), ["add_coverage", "add_pickup_point", "lookup_areas", "save_call_summary", "save_note", "save_pickup_address", "set_description", "set_starting_price"]);
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
  assert.match(server, /prompt: \{ prompt: PROMPT, tools: elevenLabsTools\(\) \}/);
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
  assert.ok(!pkg.dependencies["react-native-webview"], "no WebView fallback needed");
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
