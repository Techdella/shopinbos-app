// Start here's optional "Get subscribers or send a first campaign" step (src/lib/setup/checklist.ts): its button asks
// the seller to add a sign-up form, so a live form ticks it, even before anyone has signed up.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const setup = await import("../src/lib/setup/checklist.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const empty = {
  lookChosen: false, products: 0, productsWithPhotos: 0, paymentMethodsOn: 0, activeDeliveryZones: 0, deliveryPartners: 0,
  payoutBank: false, live: false, socialsConnected: 0, shared: false, customDomain: false, subscribers: 0, campaignsSent: 0,
};
const none = { skipped: [], dismissed: false, sharedAt: null };
const audience = (facts, choices = none) => setup.buildSetupChecklist(facts, choices).steps.find((step) => step.key === "audience");

test("a live sign-up form ticks the step, even with no subscribers yet", () => {
  assert.equal(audience(empty).done, false);
  assert.equal(audience(empty).action.label, "Add a sign-up form");
  const withForm = audience({ ...empty, signupForms: 1 });
  assert.equal(withForm.done, true);
  assert.match(withForm.hint, /sign-up form is live/);
  assert.equal(withForm.action.href, "/home/marketing/forms");
});

test("a skipped step with a live form shows as done, not skipped", () => {
  const step = audience({ ...empty, signupForms: 1 }, { ...none, skipped: ["audience"] });
  assert.equal(step.done, true);
  assert.equal(step.skipped, false);
});

test("subscribers or a sent campaign still tick it; older facts without signupForms still work", () => {
  assert.equal(audience({ ...empty, subscribers: 3 }).done, true);
  assert.equal(audience({ ...empty, subscribers: 3 }).action.label, "Send a campaign");
  assert.equal(audience({ ...empty, campaignsSent: 1 }).done, true);
});

test("Start here counts the store's live sign-up forms and pop-ups", () => {
  const server = read("src/lib/setup/server.ts");
  assert.match(server, /db\.storeForm\.count\(\{ where: \{ storeId: store\.id, active: true/);
  assert.match(server, /signupForms,/);
});
