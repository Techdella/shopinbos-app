// Inbox times are rendered on the server (UTC) and again in the browser (Lagos): they must name the same zone, or
// React throws a hydration mismatch (#418) on /home/messages.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("inbox times: every clock time and date names the app's time zone", () => {
  const ui = read("src/components/messaging/inbox-ui.tsx");
  const calls = ui.match(/toLocale(Time|Date)?String\([^;]*\)/g) ?? [];
  assert.ok(calls.length >= 7);
  for (const call of calls) assert.match(call, /timeZone: APP_TIME_ZONE/, call);
});

test("inbox times: relative times may tick over between server and browser", () => {
  for (const path of ["src/app/home/messages/UnifiedInbox.tsx", "src/app/home/messages/InboxThread.tsx"]) {
    for (const line of read(path).split("\n").filter((l) => /\{formatWhen\(/.test(l))) assert.match(line, /suppressHydrationWarning/, `${path}: ${line.trim()}`);
  }
});
