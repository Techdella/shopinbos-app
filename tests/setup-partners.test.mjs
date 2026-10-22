// Start here's optional "Choose a delivery company" step (src/lib/setup/checklist.ts): where it sits, that it is
// optional, that a connected delivery company ticks it, and that the page connects through the shared paths.
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
const partnersStep = (checklist) => checklist.steps.find((step) => step.key === "partners");

test("the delivery company step comes right after delivery areas, is optional and done from connected companies", () => {
  const keys = [...setup.SETUP_STEP_KEYS];
  assert.equal(keys.indexOf("partners"), keys.indexOf("delivery") + 1);

  const fresh = setup.buildSetupChecklist(empty, none);
  const step = partnersStep(fresh);
  assert.equal(step.title, "Choose a delivery company");
  assert.equal(step.optional, true);
  assert.equal(step.done, false);
  assert.equal(step.action.kind, "inline");

  const connected = setup.buildSetupChecklist({ ...empty, deliveryPartners: 1 }, none);
  assert.equal(partnersStep(connected).done, true, "one active delivery connection is enough");
  assert.equal(connected.total, fresh.total, "optional: doesn't change the required count");
  assert.equal(connected.done, fresh.done, "optional: doesn't count towards progress");
  assert.equal(setup.isSetupStepKey("partners"), true, "it can be skipped like the others");
});

test("the fact comes from active delivery connections, and Start here connects through the shared paths", () => {
  const server = read("src/lib/setup/server.ts");
  assert.match(server, /db\.deliveryConnection\.count\(\{ where: \{ ownerUserId: userId, status: "active" \} \}\)\.catch\(\(\) => 0\)/);
  assert.match(server, /deliveryPartners,/);

  const actions = read("src/app/home/start/actions.ts");
  assert.match(actions, /deliveryPartnerProblem\(user\.id, id\)/, "the plan's delivery-partner limit");
  assert.match(actions, /connectPartner\(\{ id: user\.id, role: user\.role, name: user\.name \}, id\)/, "the same connect as the partners page");
  assert.match(actions, /saveDeliverySettings\(userId, \{ checkoutMode: partners \? "partners" : "zones" \}\)/, "the logistics settings save path");

  const page = read("src/app/home/start/StartHere.tsx");
  assert.match(page, /step\.key === "partners"/);
  assert.match(page, /AssistantNote/);
  assert.match(page, /href="\/home\/logistics\/partners"/);

  const en = read("shared/i18n/messages/home/en.ts");
  assert.match(en, /"start\.partners\.tip": "A delivery company picks up the parcel from you and takes it to your customer\. You can change this any time\."/);
  for (const locale of ["pcm", "yo", "ha", "ig"]) assert.match(read(`shared/i18n/messages/home/${locale}.ts`), /"step\.Choose a delivery company":/, locale);

  // The onboarding checklist (the app's last onboarding step) lists it too.
  assert.match(read("shared/onboarding.ts"), /key: "delivery", label: "Choose a delivery company"/);
  assert.match(read("src/lib/onboarding-status.ts"), /delivery: deliveryPartners > 0/);
});
