// The "Shopinbos User" stand-in: never shown as a name, never written over a real one (shared/person-name.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const names = await import("../shared/person-name.ts");

test("person name: the stand-in and empty names read as no name", () => {
  assert.equal(names.isPlaceholderName("Shopinbos User"), true);
  assert.equal(names.isPlaceholderName("  shopinbos user "), true);
  assert.equal(names.isPlaceholderName(""), true);
  assert.equal(names.isPlaceholderName(null), true);
  assert.equal(names.isPlaceholderName("Olabimpe Salami"), false);
  assert.equal(names.realName("Shopinbos User"), "");
  assert.equal(names.realName(" Ada Okafor "), "Ada Okafor");
});

test("person name: sign-in fills the stand-in but never overwrites a real name", () => {
  const appUser = read("src/lib/auth/app-user.ts");
  assert.match(appUser, /typedName && \(isPlaceholderName\(existingUser\?\.name\)/);
  assert.doesNotMatch(appUser, /\.\.\.\(input\.fullName \? \{ name: fullName \} : \{\}\)/);
  const sync = read("src/app/api/auth/sync-user/route.ts");
  assert.match(sync, /meta\.full_name/, "the phone app saves the name as full_name");
  assert.doesNotMatch(sync, /"Shopinbos User"/);
});

test("person name: the apps never greet with the stand-in", () => {
  for (const file of ["src/lib/dashboard/index.ts", "src/lib/onboarding-status.ts", "src/app/api/mobile/wallet/route.ts"]) {
    assert.match(read(file), /ownerName: realName\(/, file);
  }
  const home = read("apps/mobile/src/app/(tabs)/home.tsx");
  assert.match(home, /realName\(data\?\.ownerName\)/);
  assert.match(home, /greeting\.addName/);
});
