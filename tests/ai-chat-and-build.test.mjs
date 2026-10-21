// Rex and Peggy's replies show as rich text (no raw **), the builder chat scrolls only its list, and store
// building runs on Claude with room to finish (pictures stay on OpenAI).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("every Rex and Peggy chat draws replies with ChatText (Markdown as rich text)", () => {
  for (const path of ["src/components/builder/ChipBuilder.tsx", "src/components/builder/rex/RexChat.tsx", "src/components/builder/editor/RexPanel.tsx", "src/app/home/peggy/PeggyChat.tsx", "src/app/components/product-form/ProductPeggy.tsx"]) {
    assert.match(read(path), /<ChatText /, path);
  }
  const chat = read("src/components/chat/ChatText.tsx");
  assert.match(chat, /sanitizeDoc\(markdownToDoc\(text\)\)/);
  assert.doesNotMatch(chat, /dangerouslySetInnerHTML/);
});

test("Rex and Peggy are told to write light Markdown", () => {
  for (const path of ["src/lib/ai/rex/agent.ts", "src/lib/ai/peggy/prompt.ts", "src/lib/ai/client.ts"]) assert.match(read(path), /light Markdown/, path);
});

test("the builder chat scrolls its own list, not the page", () => {
  const chip = read("src/components/builder/ChipBuilder.tsx");
  assert.doesNotMatch(chip, /\.scrollIntoView\(/);
  assert.match(chip, /list\?\.scrollTo\(\{ top: list\.scrollHeight/);
  assert.doesNotMatch(read("src/app/home/peggy/PeggyChat.tsx"), /\.scrollIntoView\(/);
});

test("store building runs on Claude first, with room and time to finish the design", () => {
  const route = read("src/app/api/ai/store-builder/route.ts");
  assert.match(route, /max_tokens: 64000/);
  assert.match(route, /export const maxDuration = 300/);
  assert.match(route, /providerOrder\("anthropic"\)/);
  const build = read("src/lib/ai/rex/build-store.ts");
  assert.match(build, /maxTokens: 32000/);
  assert.match(build, /prefer: "anthropic"/);
  assert.match(read("src/lib/ai/rex/studio-edit.server.ts"), /prefer: "anthropic"/);
  assert.match(read("src/app/api/ai/video-script/route.ts"), /prefer: "anthropic"/);
  const text = read("src/lib/ai/text.ts");
  assert.match(text, /messages\.stream\(/);
  assert.match(text, /stop_reason === "max_tokens"/);
  assert.match(text, /providerOrder\(options\.prefer\)/);
});

test("the builder prompt has one output format and asks for a short reply", () => {
  const prompts = read("src/lib/ai/rex/prompts.ts");
  assert.match(prompts, /CHIP_SYSTEM_PROMPT\.replace\(\/Your response MUST end with exactly this format/);
  assert.match(read("src/lib/ai/client.ts"), /Your response MUST end with exactly this format/);
  assert.match(prompts, /under 120 words/);
  assert.doesNotMatch(prompts, /NGN 2500/);
});

test("pictures are made with OpenAI, and the labels say so", () => {
  assert.match(read("src/lib/ai/images.ts"), /OPENAI_IMAGE_MODEL/);
  assert.doesNotMatch(read("shared/i18n/messages/shell/en.ts"), /DALL/);
  assert.match(read("shared/i18n/messages/shell/en.ts"), /made with OpenAI/);
});
