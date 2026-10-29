// People see friendly words; technical errors go to Admin › App errors.
import test from "node:test";
import assert from "node:assert/strict";

const f = await import("../src/lib/errors/friendly.ts");

test("friendly errors: technical messages become plain words", () => {
  const storage = new Error("Failed to read the 'sessionStorage' property from 'Window': Access is denied for this document.");
  storage.name = "SecurityError";
  assert.equal(f.errorKind(storage), "storage");
  assert.equal(f.friendlyText(storage).text, f.FRIENDLY_TEXT.storage);
  assert.equal(f.errorKind(new TypeError("Failed to fetch")), "network");
  assert.equal(f.errorKind(new Error("Load failed")), "network");
  // Chrome, when a response body is cut off (the tab went to the background mid-request).
  assert.equal(f.errorKind(new TypeError("network error")), "network");
  assert.equal(f.errorKind(new Error("Loading chunk 9114 failed.")), "update");
  assert.equal(f.errorKind(new Error("NotAllowedError: Permission denied")), "permission");
  assert.equal(f.errorKind(new TypeError("Cannot read properties of undefined (reading 'id')")), "code");
  assert.equal(f.errorKind(new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON")), "code");
  assert.equal(f.errorKind(new Error("x".repeat(300))), "code");
  assert.equal(f.errorKind(new Error("")), "code");
  // An API reply that isn't ours (a timeout page, a too-big request): the status is kept for the team, not shown.
  const status = new Error("HTTP 504 from POST /api/logistics/kyc/nin");
  assert.equal(f.errorKind(status), "code");
  assert.equal(f.friendlyText(status, "That didn't work. Try again.").text, "That didn't work. Try again.");
});

test("friendly errors: our own plain messages pass through, and a caller's fallback is used for bugs", () => {
  const plain = new Error("Enter a valid Nigerian phone number.");
  assert.equal(f.errorKind(plain), null);
  assert.equal(f.friendlyText(plain).text, "Enter a valid Nigerian phone number.");
  assert.equal(f.errorKind(new Error("You've opened a few conversations already.")), null);
  const bug = new TypeError("x is not a function");
  assert.equal(f.friendlyText(bug).text, f.FRIENDLY_TEXT.code);
  assert.equal(f.friendlyText(bug, "Couldn't save the product.").text, "Couldn't save the product.");
  // A network problem keeps the connection words even when the caller gave a fallback.
  assert.equal(f.friendlyText(new TypeError("Failed to fetch"), "Couldn't save.").text, f.FRIENDLY_TEXT.network);
  assert.equal(f.friendlyText("Plain string from somewhere").text, "Plain string from somewhere");
});

test("friendly errors: a rejected DOM Event says what failed to load", () => {
  class Event { constructor(type, target) { this.type = type; this.target = target; } }
  const script = new Event("error", { tagName: "SCRIPT", src: "https://example.com/widget.js" });
  assert.equal(f.errorDetails(script).message, 'Event "error" on <script src=https://example.com/widget.js>');
  assert.equal(f.errorDetails(new Event("close", { url: "wss://example.com/live" })).message, 'Event "close" from wss://example.com/live');
  assert.equal(f.errorDetails(new Event("error", null)).message, 'Event "error"');
});

test("friendly errors: the same problem groups together, whoever and wherever", () => {
  assert.equal(f.pagePattern("/s/ada-fashion/products/clx9a8b7c6d5?x=1"), "/s/:slug/products/:id");
  assert.equal(f.pagePattern("/signup"), "/signup");
  assert.equal(f.errorFingerprint("Order 123 failed", "/home/orders/clx9a8b7c6d5"), f.errorFingerprint("Order 456 failed", "/home/orders/clz0000000001"));
  assert.notEqual(f.errorFingerprint("Order 1 failed", "/signup"), f.errorFingerprint("Order 1 failed", "/login"));
  const details = f.errorDetails(new TypeError("boom"));
  assert.equal(details.name, "TypeError");
  assert.equal(details.message, "TypeError: boom");
});

test("friendly errors: browser labels for the admin page", () => {
  assert.equal(f.browserLabel("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36"), "Chrome 155 · Android 10");
  assert.equal(f.browserLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1"), "Safari 18 · iOS 18");
  assert.equal(f.browserLabel(null), "Unknown browser");
});
