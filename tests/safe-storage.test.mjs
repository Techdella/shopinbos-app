// Browsers that deny site storage throw on window.sessionStorage; the app swaps in memory storage instead.
import test from "node:test";
import assert from "node:assert/strict";

const { ensureUsableStorage, memoryStorage } = await import("../src/lib/safe-storage.ts");

function deniedWindow() {
  const denied = () => {
    throw new Error("SecurityError: Failed to read the 'sessionStorage' property from 'Window': Access is denied for this document.");
  };
  const target = {};
  Object.defineProperty(target, "sessionStorage", { get: denied, configurable: true });
  Object.defineProperty(target, "localStorage", { get: denied, configurable: true });
  return target;
}

test("safe storage: denied storage is replaced with working memory storage", () => {
  const target = deniedWindow();
  assert.deepEqual(ensureUsableStorage(target), ["sessionStorage", "localStorage"]);
  target.sessionStorage.setItem("intent", "add_product");
  assert.equal(target.sessionStorage.getItem("intent"), "add_product");
  assert.equal(target.sessionStorage.length, 1);
  target.sessionStorage.clear();
  assert.equal(target.sessionStorage.getItem("intent"), null);
  assert.equal(target.localStorage.getItem("missing"), null);
});

test("safe storage: working storage is left alone", () => {
  const session = memoryStorage();
  const target = { sessionStorage: session, localStorage: memoryStorage() };
  assert.deepEqual(ensureUsableStorage(target), []);
  assert.equal(target.sessionStorage, session);
  assert.deepEqual(ensureUsableStorage(undefined), []);
});
