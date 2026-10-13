// Voice typing (POST /api/ai/transcribe, VoiceInputButton, VoiceInput) and one-minute help videos
// (HelpVideo, /admin/help-videos, "Watch a 1-minute video" in Help). Build spec 8A.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const voice = await import("../shared/voice-input.ts");
const videos = await import("../shared/help-videos.ts");
const sniff = await import("../src/lib/security/upload-sniff.ts");

const bytes = (...parts) => {
  const out = [];
  for (const part of parts) {
    if (typeof part === "string") for (const ch of part) out.push(ch.charCodeAt(0));
    else out.push(...part);
  }
  return new Uint8Array(out);
};
const u32be = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u32le = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const u16le = (n) => [n & 255, (n >>> 8) & 255];

/** A WAV header for `seconds` of 16 kHz mono 16-bit audio (no samples needed to read the length). */
function wavHeader(seconds) {
  const byteRate = 16000 * 2;
  const data = seconds * byteRate;
  return bytes("RIFF", u32le(36 + data), "WAVE", "fmt ", u32le(16), u16le(1), u16le(1), u32le(16000), u32le(byteRate), u16le(2), u16le(16), "data", u32le(data));
}

/** The start of an M4A: ftyp, then moov/mvhd (version 0) with a timescale and duration. */
function m4a(seconds) {
  const timescale = 44100;
  const mvhd = bytes(u32be(108), "mvhd", [0, 0, 0, 0], u32be(0), u32be(0), u32be(timescale), u32be(seconds * timescale), new Array(80).fill(0));
  return bytes(u32be(20), "ftypM4A ", u32be(0), "isom", u32be(8 + mvhd.length), "moov", mvhd);
}

/** Two Ogg pages; the last one's granule position says how many 48 kHz Opus samples came before it. */
function oggOpus(seconds) {
  const page = (granule) => bytes("OggS", [0, 0], u32le(granule), u32le(0), u32le(1), u32le(0), u32le(0), [1, 8], "OpusHead");
  return bytes(page(0), page(seconds * 48000));
}

test("audio types: the formats phones and browsers record are taken, others are refused", () => {
  assert.equal(voice.normaliseAudioType("audio/webm;codecs=opus"), "audio/webm");
  assert.equal(voice.normaliseAudioType("video/webm"), "video/webm");
  assert.equal(voice.normaliseAudioType("audio/ogg; codecs=opus"), "audio/ogg");
  assert.equal(voice.normaliseAudioType("audio/x-m4a"), "audio/x-m4a");
  assert.equal(voice.normaliseAudioType("audio/aac"), "audio/aac");
  assert.equal(voice.normaliseAudioType("audio/mp4"), "audio/mp4");
  assert.equal(voice.normaliseAudioType("video/mp4"), "video/mp4");
  assert.equal(voice.normaliseAudioType("audio/wav"), "audio/wav");
  // Phones that send no type (or octet-stream) are read by extension.
  assert.equal(voice.normaliseAudioType("", "voice.m4a"), "audio/mp4");
  assert.equal(voice.normaliseAudioType("application/octet-stream", "note.webm"), "audio/webm");
  assert.equal(voice.normaliseAudioType("text/html", "voice.m4a"), null, "a declared non-audio type is never rescued by the name");
  assert.equal(voice.normaliseAudioType("image/png"), null);
  assert.equal(voice.normaliseAudioType("", "voice.exe"), null);
  assert.equal(voice.audioFileName("audio/x-m4a"), "voice.m4a");
  assert.equal(voice.audioFileName("audio/webm"), "voice.webm");
});

test("audio size and length: at most 10 MB and 60 seconds", () => {
  assert.equal(voice.VOICE_MAX_BYTES, 10 * 1024 * 1024);
  assert.equal(voice.VOICE_MAX_SECONDS, 60);
  assert.equal(voice.audioProblem({ type: "audio/webm", size: 300_000, durationMs: 12_000 }), null);
  assert.equal(voice.audioProblem({ type: "audio/webm", size: 0 })?.code, "NO_AUDIO");
  assert.equal(voice.audioProblem({ type: null, size: 1000 })?.code, "UNSUPPORTED_AUDIO");
  assert.equal(voice.audioProblem({ type: null, size: 1000 })?.status, 415);
  const big = voice.audioProblem({ type: "audio/webm", size: 10 * 1024 * 1024 + 1 });
  assert.equal(big?.code, "AUDIO_TOO_LARGE");
  assert.equal(big?.status, 413);
  assert.equal(voice.audioProblem({ type: "audio/webm", size: 1000, durationMs: 61_000 }), null, "a beat late is fine");
  assert.equal(voice.audioProblem({ type: "audio/webm", size: 1000, durationMs: 75_000 })?.code, "AUDIO_TOO_LONG");

  // The length is also read from the file itself where the container says it.
  assert.equal(Math.round(voice.audioDurationSeconds("audio/wav", wavHeader(30))), 30);
  assert.equal(voice.durationProblem(voice.audioDurationSeconds("audio/wav", wavHeader(30))), null);
  assert.equal(voice.durationProblem(voice.audioDurationSeconds("audio/wav", wavHeader(90)))?.code, "AUDIO_TOO_LONG");
  assert.equal(Math.round(voice.audioDurationSeconds("audio/mp4", m4a(45))), 45);
  assert.equal(voice.durationProblem(voice.audioDurationSeconds("audio/x-m4a", m4a(120)))?.code, "AUDIO_TOO_LONG");
  assert.equal(Math.round(voice.audioDurationSeconds("audio/ogg", oggOpus(20))), 20);
  assert.equal(voice.durationProblem(voice.audioDurationSeconds("audio/ogg", oggOpus(200)))?.code, "AUDIO_TOO_LONG");
  // Browser WebM recordings carry no length: nothing to read, so the recorder's own timer and the size cap apply.
  assert.equal(voice.audioDurationSeconds("audio/webm", bytes([0x1a, 0x45, 0xdf, 0xa3], new Array(40).fill(0))), null);
  assert.equal(voice.durationProblem(null), null);
});

test("audio bytes must match the declared type (no HTML or images passed off as a recording)", () => {
  assert.equal(voice.audioBytesMatch("audio/webm", bytes([0x1a, 0x45, 0xdf, 0xa3, 0, 0])), true);
  assert.equal(voice.audioBytesMatch("audio/ogg", bytes("OggS", [0, 2])), true);
  assert.equal(voice.audioBytesMatch("audio/wav", wavHeader(1)), true);
  assert.equal(voice.audioBytesMatch("audio/mp4", m4a(3)), true);
  assert.equal(voice.audioBytesMatch("audio/aac", bytes([0xff, 0xf1, 0x50, 0x80])), true, "raw AAC (ADTS)");
  assert.equal(voice.audioBytesMatch("audio/webm", bytes("<html><script>")), false);
  assert.equal(voice.audioBytesMatch("audio/mp4", bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), false);
  assert.equal(voice.audioBytesMatch("audio/wav", bytes("OggS")), false);
});

test("speech model gets Nigerian context and a language hint only where one exists", () => {
  assert.equal(voice.voiceLanguage("yo-NG"), "yo");
  assert.equal(voice.voiceLanguage("Yorùbá"), "yo");
  assert.equal(voice.voiceLanguage("Pidgin"), "pcm");
  assert.equal(voice.voiceLanguage("en-GB"), "en");
  assert.equal(voice.voiceLanguage("fr"), null);
  assert.equal(voice.transcriptionLanguageHint("ha"), "ha");
  assert.equal(voice.transcriptionLanguageHint("en"), "en");
  assert.equal(voice.transcriptionLanguageHint("pcm"), undefined, "Pidgin has no ISO-639-1 code");
  assert.equal(voice.transcriptionLanguageHint("ig"), undefined);
  assert.equal(voice.transcriptionLanguageHint(null), undefined);
  const prompt = voice.transcriptionPrompt("pcm", "a product description <script>");
  assert.match(prompt, /Nigerian English, Pidgin, Yorùbá, Hausa or Igbo/);
  assert.match(prompt, /naira amounts like ₦18,500/);
  assert.match(prompt, /Nigerian Pidgin/);
  assert.match(prompt, /a product description script/);
  assert.doesNotMatch(prompt, /</);
  assert.equal(voice.cleanTranscript("  Hello   there \r\n\r\n\r\n second line  "), "Hello there\n\nsecond line");
  assert.equal(voice.mergeVoiceText("Red bag.", "Size 40", "append"), "Red bag. Size 40");
  assert.equal(voice.mergeVoiceText("", "Size 40"), "Size 40");
  assert.equal(voice.mergeVoiceText("Old text", "New text", "replace"), "New text");
  assert.equal(voice.mergeVoiceText("abc", "defghij", "append", 6), "abc de");
  assert.equal(voice.mergeVoiceText("keep", "   "), "keep");
  assert.equal(voice.voiceTimer(7_400), "0:07");
  assert.equal(voice.voiceTimer(60_000), "1:00");
});

test("voice copy: plain words, and a 503 becomes 'type it instead'", () => {
  assert.equal(voice.VOICE_COPY.idle, "Tap and speak");
  assert.equal(voice.VOICE_COPY.listening, "Listening… tap to stop");
  assert.equal(voice.VOICE_COPY.working, "Writing it down…");
  assert.equal(voice.VOICE_COPY.unavailable, "Voice typing isn't available right now. Type it instead.");
  assert.match(voice.VOICE_COPY.deniedWeb, /Allow the microphone in your browser to use voice typing/);
  assert.equal(voice.voiceErrorMessage("AI_OFF", 503), voice.VOICE_COPY.unavailable);
  assert.equal(voice.voiceErrorMessage(undefined, 503), voice.VOICE_COPY.unavailable);
  assert.equal(voice.voiceErrorMessage("AUDIO_TOO_LONG", 413), voice.VOICE_COPY.tooLong);
  assert.equal(voice.voiceErrorMessage("TRANSCRIBE_FAILED", 502), voice.VOICE_COPY.failed);
  for (const line of Object.values(voice.VOICE_COPY)) assert.doesNotMatch(line, /\b(error|failed|invalid)\b/i, line);
});

test("POST /api/ai/transcribe: any signed-in role, shared rate limit, metered, size/type/length checked, OpenAI only", () => {
  const route = read("src/app/api/ai/transcribe/route.ts");
  assert.match(route, /withAuth\(/);
  assert.doesNotMatch(route, /withSeller\(/, "suppliers and delivery partners use voice typing too");
  assert.match(route, /checkRateLimitShared\(rateLimitKey\("voice-typing", user\.id\)/);
  assert.match(route, /meterAi\(user\.id, "speech"\)/);
  assert.match(route, /audioProblem\(/);
  assert.match(route, /audioBytesMatch\(/);
  assert.match(route, /durationProblem\(audioDurationSeconds\(/);
  assert.match(route, /gpt-4o-mini-transcribe/);
  assert.match(route, /OPENAI_TRANSCRIBE_MODEL/);
  assert.match(route, /transcriptionPrompt\(language, context\)/);
  assert.match(route, /apiError\("AI_OFF", VOICE_COPY\.unavailable, 503\)/);
  assert.match(route, /data: \{ text \}, text/);
  const usage = read("src/lib/ai/usage.ts");
  assert.match(usage, /"speech"/);
  assert.match(usage, /speech: "Voice typing"/);
  // The browser may only use the microphone on our own pages.
  assert.match(read("next.config.ts"), /microphone=\(self\)/);
});

test("help topics: every screen maps to the right one-minute video (web and mobile paths)", () => {
  const { topicForPath } = videos;
  assert.equal(topicForPath("/products/new"), "add_product");
  assert.equal(topicForPath("/products"), "add_product");
  assert.equal(topicForPath("/add-products"), "add_product");
  assert.equal(topicForPath("/home/orders/new"), "record_sale", "the longest prefix wins over /home/orders");
  assert.equal(topicForPath("/home/orders/abc123"), "orders");
  assert.equal(topicForPath("/record-sale"), "record_sale");
  assert.equal(topicForPath("/home/payouts?tab=bank"), "get_paid");
  assert.equal(topicForPath("/home/domain/"), "web_address");
  assert.equal(topicForPath("/home/shipping/new"), "delivery");
  assert.equal(topicForPath("/home/marketing/whatsapp"), "whatsapp", "more specific than /home/marketing");
  assert.equal(topicForPath("/home/marketing/campaigns"), "get_customers");
  assert.equal(topicForPath("/supplier/orders"), "supplier_orders");
  assert.equal(topicForPath("/supplier/(tabs)/orders"), "supplier_orders", "Expo Router groups are ignored");
  assert.equal(topicForPath("/supplier/product/new"), "supplier_products");
  assert.equal(topicForPath("/logistics/job/42"), "partner_jobs");
  assert.equal(topicForPath("/logistics/earnings"), "get_paid");
  assert.equal(topicForPath("/rider/abc-token"), "rider_flow");
  assert.equal(topicForPath("/productsx"), null, "prefixes match whole segments only");
  assert.equal(topicForPath("/home/settings"), null);
  assert.equal(topicForPath(""), null);
  // Role-aware: a supplier on a seller screen gets nothing, and get_paid suits every business role.
  assert.equal(topicForPath("/products/new", "supplier"), null);
  assert.equal(topicForPath("/supplier/payouts", "supplier"), "get_paid");
  assert.equal(topicForPath("/rider", "rider"), "rider_flow");
  // Every topic the spec names exists, with a title and at least one screen.
  for (const key of ["add_product", "record_sale", "get_paid", "web_address", "delivery", "whatsapp", "supplier_orders", "partner_jobs", "rider_flow"]) {
    const topic = videos.HELP_TOPICS.find((item) => item.key === key);
    assert.ok(topic, key);
    assert.ok(topic.title && topic.paths.length && topic.roles.length, key);
  }
});

test("help videos: the person's language first, then English, else no option at all", () => {
  const rows = [
    { id: "1", topic: "add_product", language: "en", roles: ["seller"], published: true, videoUrl: "https://youtu.be/dQw4w9WgXcQ" },
    { id: "2", topic: "add_product", language: "yo", roles: ["seller"], published: true, videoUrl: "https://youtu.be/dQw4w9WgXcQ" },
    { id: "3", topic: "record_sale", language: "en", roles: ["seller"], published: false, videoUrl: "https://youtu.be/dQw4w9WgXcQ" },
    { id: "4", topic: "get_paid", language: "pcm", roles: ["seller", "supplier"], published: true, videoUrl: "https://vimeo.com/123456789" },
    { id: "5", topic: "delivery", language: "en", roles: ["seller"], published: true, videoUrl: null },
  ];
  assert.equal(videos.pickHelpVideo(rows, "add_product", "yo")?.id, "2");
  assert.equal(videos.pickHelpVideo(rows, "add_product", "ha")?.id, "1", "falls back to English");
  assert.equal(videos.pickHelpVideo(rows, "record_sale", "en"), null, "drafts are never offered");
  assert.equal(videos.pickHelpVideo(rows, "delivery", "en"), null, "a row with no video is never offered");
  assert.equal(videos.pickHelpVideo(rows, "get_paid", "en"), null, "Pidgin only, no English: hidden for English speakers");
  assert.equal(videos.pickHelpVideo(rows, "get_paid", "pcm")?.id, "4");
  assert.equal(videos.pickHelpVideo(rows, "add_product", "en", "supplier"), null, "role filter");
  assert.equal(videos.pickHelpVideo(rows, null, "en"), null);
  assert.deepEqual(videos.helpVideosForRole(rows, "seller", "yo").map((row) => row.id), ["2"]);
  assert.deepEqual(videos.helpVideosForRole(rows, "seller", "pcm").map((row) => row.id), ["1", "4"]);
  assert.deepEqual(videos.helpVideosForRole(rows, "supplier", "pcm").map((row) => row.id), ["4"]);
  assert.equal(videos.helpLanguage("yo-NG"), "yo");
  assert.equal(videos.helpLanguage("Hausa"), "ha");
  assert.equal(videos.helpLanguage("fr-FR"), "en");
  assert.equal(videos.helpLanguage(undefined), "en");
});

test("video links: only YouTube and Vimeo are accepted, and files only from our help-video folder", () => {
  const yt = videos.parseVideoLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10");
  assert.equal(yt?.kind, "youtube");
  assert.equal(yt?.id, "dQw4w9WgXcQ");
  assert.match(yt.embedUrl, /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
  for (const url of ["https://youtu.be/dQw4w9WgXcQ", "https://m.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube.com/embed/dQw4w9WgXcQ"]) {
    assert.equal(videos.parseVideoLink(url)?.id, "dQw4w9WgXcQ", url);
  }
  const vimeo = videos.parseVideoLink("https://vimeo.com/123456789/abcdef1234");
  assert.equal(vimeo?.kind, "vimeo");
  assert.equal(vimeo?.id, "123456789");
  assert.equal(vimeo?.hash, "abcdef1234");
  assert.equal(vimeo?.embedUrl, "https://player.vimeo.com/video/123456789?dnt=1&h=abcdef1234");
  assert.equal(videos.parseVideoLink("https://player.vimeo.com/video/987654321")?.id, "987654321");
  for (const bad of [
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    "https://evil.example/youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/playlist?list=PL123",
    "https://vimeo.com/channels/staffpicks",
    "https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.dailymotion.com/video/x7tgad0",
    "javascript:alert(1)",
    "not a url",
    "",
  ]) {
    assert.equal(videos.parseVideoLink(bad), null, bad);
  }
  const base = "https://abc.supabase.co/storage/v1/object/public/shopinbos-media/";
  assert.deepEqual(videos.videoSource(`${base}platform/help-videos/1-a.mp4`, base), { kind: "file", url: `${base}platform/help-videos/1-a.mp4` });
  assert.equal(videos.videoSource(`${base}products/1-a.mp4`, base), null, "other folders are not help videos");
  assert.equal(videos.videoSource(`${base}platform/help-videos/../products/x.mp4`, base), null);
  assert.equal(videos.videoSource("https://cdn.example/video.mp4", base), null);
  assert.equal(videos.videoSource("https://youtu.be/dQw4w9WgXcQ", base)?.kind, "youtube");
});

test("help-video uploads: MP4/WebM up to 50 MB, posters JPG/PNG/WebP up to 2 MB, bytes sniffed", () => {
  assert.equal(videos.helpUploadProblem("video", "video/mp4", 49 * 1024 * 1024), null);
  assert.equal(videos.helpUploadProblem("video", "video/webm", 1000), null);
  assert.match(videos.helpUploadProblem("video", "video/mp4", 50 * 1024 * 1024 + 1), /50 MB/);
  assert.match(videos.helpUploadProblem("video", "video/quicktime", 1000), /MP4 or WebM/);
  assert.match(videos.helpUploadProblem("video", "text/html", 1000), /MP4 or WebM/);
  assert.equal(videos.helpUploadProblem("poster", "image/png", 1000), null);
  assert.match(videos.helpUploadProblem("poster", "image/svg+xml", 1000), /JPG, PNG or WebP/);
  assert.match(videos.helpUploadProblem("poster", "image/jpeg", 3 * 1024 * 1024), /2 MB/);
  // The shared upload sniffing covers video: an .mp4 must start like one.
  assert.equal(sniff.uploadContentProblem("video/mp4", bytes(u32be(20), "ftypisom", u32be(0))), null);
  assert.equal(sniff.uploadContentProblem("video/webm", bytes([0x1a, 0x45, 0xdf, 0xa3], new Array(12).fill(0))), null);
  assert.ok(sniff.uploadContentProblem("video/mp4", bytes("<!doctype html><s")));
  assert.ok(sniff.uploadContentProblem("video/webm", bytes("RIFF....WEBPVP8 ")));
  const server = read("src/lib/help-videos.server.ts");
  assert.match(server, /uploadContentProblem\(type, head/);
  assert.match(server, /createSignedUploadUrl\(path\)/);
  assert.match(server, /HELP_VIDEO_FOLDER/);
  assert.equal(videos.HELP_VIDEO_FOLDER, "platform/help-videos");
});

test("help-video catalogue: model, idempotent migration with RLS and drafts, admin-only API and page", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model HelpVideo \{[\s\S]*?topic\s+String[\s\S]*?roles\s+String\[\][\s\S]*?language\s+String\s+@default\("en"\)[\s\S]*?videoUrl\s+String\?[\s\S]*?posterUrl\s+String\?[\s\S]*?durationSeconds\s+Int\?[\s\S]*?published\s+Boolean\s+@default\(false\)[\s\S]*?@@unique\(\[topic, language\]\)/);
  const sql = read("docs/migrations/2026-10-18-help-videos.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "HelpVideo"/);
  assert.match(sql, /ALTER TABLE "HelpVideo" ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ON CONFLICT \("topic", "language"\) DO NOTHING/);
  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|COLUMN)\b/i);
  for (const topic of videos.HELP_TOPICS) assert.match(sql, new RegExp(`'${topic.key}'`), `migration drafts ${topic.key}`);
  assert.match(read("prisma/seed.ts"), /HELP_TOPICS[\s\S]*helpVideo\.upsert[\s\S]*published: false/);
  for (const path of ["src/app/api/admin/help-videos/route.ts", "src/app/api/admin/help-videos/[id]/route.ts", "src/app/api/admin/help-videos/upload/route.ts"]) {
    const route = read(path);
    assert.match(route, /withAdmin\(/, path);
    assert.doesNotMatch(route, /withAuth\(|withSeller\(/, path);
  }
  assert.match(read("src/app/admin/help-videos/page.tsx"), /requireRole\(\["admin"\]/);
  const publicRoute = read("src/app/api/help-videos/route.ts");
  assert.match(publicRoute, /publishedHelpVideos\(/);
  assert.match(read("src/lib/help-videos.server.ts"), /published: true, videoUrl: \{ not: null \}/);
  assert.match(read("src/lib/nav.ts"), /href: "\/admin\/help-videos"/);
});

test("Help offers 'Watch a 1-minute video' on web and mobile, and hides it when there's none", () => {
  const web = read("src/components/help/HelpVideos.tsx");
  assert.match(web, /Watch a 1-minute video/);
  assert.match(web, /if \(!current && all\.length === 0\) return null/);
  assert.match(web, /All videos/);
  assert.match(web, /<video /);
  assert.match(web, /<iframe/);
  assert.match(read("src/components/shell/SupportChatModal.tsx"), /<HelpVideosSection role=\{role\} \/>/);
  const mobile = read("apps/mobile/src/components/Help.tsx");
  assert.match(mobile, /videos\?\.current \?/);
  assert.match(mobile, /Watch a 1-minute video/);
  assert.match(mobile, /All videos/);
  assert.match(mobile, /WebBrowser\.openBrowserAsync\(video\.source\.watchUrl\)/);
  assert.match(read("apps/mobile/src/components/HelpVideoPlayer.tsx"), /useVideoPlayer\(/);
  const config = read("next.config.ts");
  assert.match(config, /frame-src [^"]*https:\/\/www\.youtube-nocookie\.com https:\/\/player\.vimeo\.com/);
});

test("the mic sits next to every long text field in the seller, supplier and partner apps", () => {
  const web = {
    "src/app/products/new/NewProductForm.tsx": 'targetId="new-product-description"',
    "src/app/components/ProductForm.tsx": "onChange={setDescription}",
    "src/components/support/SetupHelpRequest.tsx": "onChange={setDetails}",
    "src/components/shell/SupportChatModal.tsx": "a message to the support team",
    "src/components/support/SupportThread.tsx": "onChange={setText}",
    "src/app/home/peggy/PeggyChat.tsx": "onChange={setDraft}",
    "src/components/builder/rex/RexChat.tsx": "a request for Rex",
    "src/components/builder/editor/RexPanel.tsx": "onChange={setInput}",
    "src/app/home/orders/new/RecordSaleForm.tsx": "a note about a sale",
    "src/app/home/messages/InboxThread.tsx": "a reply to a customer",
    "src/components/conversations/Thread.tsx": "a message to a business partner",
    "src/app/home/ads/AdsManager.tsx": "the text of an advert",
    "src/app/home/marketing/campaigns/[id]/CampaignEditor.tsx": "a text message to customers",
    "src/app/home/reviews/_components/ReplyForm.tsx": "a reply to a customer review",
    "src/app/supplier/reviews/SupplierReviewsClient.tsx": "a reply to a review",
    "src/components/supplier/SupplierProductForm.tsx": 'targetId="product-description"',
    "src/app/supplier/quote-requests/page.tsx": "a note with a bulk price",
    "src/app/logistics/quotes/page.tsx": "a note with a delivery price",
    "src/app/marketplace/_components/ProductDetail.tsx": "a message to a supplier",
  };
  for (const [path, marker] of Object.entries(web)) {
    const source = read(path);
    assert.match(source, /import \{ VoiceInputButton \} from "@\/components\/voice\/VoiceInputButton"/, path);
    assert.ok(source.includes("<VoiceInputButton") && source.includes(marker), `${path} has the mic (${marker})`);
  }
  const mobile = {
    "apps/mobile/src/components/ChatScreen.tsx": "a chat message", // inbox, partner messages, Rex, support chats
    "apps/mobile/src/components/SetupHelpRequest.tsx": "anything the team should know",
    "apps/mobile/src/app/help/chat.tsx": "a message to the support team",
    "apps/mobile/src/app/peggy.tsx": "a question for Peggy",
    "apps/mobile/src/app/onboarding/index.tsx": "what their shop sells",
    "apps/mobile/src/app/record-sale.tsx": "a note about a sale",
    "apps/mobile/src/app/supplier/product/new.tsx": "a product description",
    "apps/mobile/src/app/supplier/quote/[id].tsx": "a note with a bulk price",
    "apps/mobile/src/app/reviews/[key].tsx": "a reply to a customer review",
  };
  for (const [path, marker] of Object.entries(mobile)) {
    const source = read(path);
    assert.ok(source.includes("<VoiceInput") && source.includes(marker), `${path} has the mic (${marker})`);
  }
  // Short fields never get one.
  assert.doesNotMatch(read("apps/mobile/src/app/logistics/add-rider.tsx"), /VoiceInput/);
  assert.doesNotMatch(read("src/components/app-ui/index.tsx"), /VoiceInputButton/, "not baked into every TextInput");
});

test("voice components: states, timer, permission handling and the shared API client", () => {
  const web = read("src/components/voice/VoiceInputButton.tsx");
  assert.match(web, /new MediaRecorder\(/);
  assert.match(web, /fetch\("\/api\/ai\/transcribe"/);
  assert.match(web, /VOICE_COPY\.deniedWeb/);
  assert.match(web, /VOICE_COPY\.listening/);
  assert.match(web, /voiceTimer\(elapsed\)/);
  assert.match(web, /VOICE_MAX_SECONDS \* 1000\) stop\(\)/, "stops itself at one minute");
  const mobile = read("apps/mobile/src/components/VoiceInput.tsx");
  assert.match(mobile, /from "expo-audio"/);
  assert.match(mobile, /requestRecordingPermissionsAsync\(\)/);
  assert.match(mobile, /VOICE_COPY\.permissionWhy/);
  assert.match(mobile, /forDuration: VOICE_MAX_SECONDS/);
  assert.match(read("apps/mobile/src/lib/voice.ts"), /api<\{ text\?: string \}>\("\/api\/ai\/transcribe"/);
  const pkg = JSON.parse(read("apps/mobile/package.json"));
  assert.ok(pkg.dependencies["expo-audio"]?.startsWith("~57."), "expo-audio matches the Expo SDK");
  assert.ok(pkg.dependencies["expo-video"]?.startsWith("~57."), "expo-video matches the Expo SDK");
  const app = read("apps/mobile/app.json");
  assert.match(app, /"microphonePermission": "Shopinbos uses the microphone only when you tap the mic/);
  assert.ok(existsSync(new URL("../apps/mobile/src/components/HelpVideoPlayer.tsx", import.meta.url)));
});
