// Delivery partner updates to the buyer by WhatsApp/SMS (spec §6.3): which job step sends which order message,
// the dedupe keys, the partner label as checkout showed it, the delivery code and pickup point, failed-attempt
// reasons in plain words, the SMS text with its details filled in, and the ready-made WhatsApp templates.
// Pure helpers: src/lib/notifications/delivery-messages.ts, src/lib/marketing/text-channels.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dm = await import("../src/lib/notifications/delivery-messages.ts");
const tc = await import("../src/lib/marketing/text-channels.ts");
const flows = await import("../src/lib/marketing/flows.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const base = {
  bookingId: "job_1",
  storeName: "Adire House",
  orderNumber: "SIB-1042",
  orderLink: "https://adire.shopinbos.com/order/ord_1",
  storeLink: "https://adire.shopinbos.com",
  buyerName: "Ada Obi",
  deliveryCode: "4821",
  service: "doorstep",
  connection: { showPartnerName: true, label: null, partnerName: "Swift Riders" },
};
const sms = (event, vars) => flows.fillVariables(tc.CUSTOMER_EVENTS.find((e) => e.key === event).sms, vars, "text").replace(/\s{2,}/g, " ").trim();

test("job steps map to the delivery order messages; other steps send nothing here", () => {
  assert.equal(dm.deliveryEventFor("confirmed"), "delivery_accepted");
  assert.equal(dm.deliveryEventFor("out_for_delivery"), "delivery_out");
  assert.equal(dm.deliveryEventFor("at_pickup_point"), "delivery_at_point");
  assert.equal(dm.deliveryEventFor("failed"), "delivery_problem");
  assert.equal(dm.deliveryEventFor("returning"), "delivery_problem");
  for (const status of ["pending", "declined", "picked_up", "in_transit", "delivered", "returned", "cancelled"]) assert.equal(dm.deliveryEventFor(status), null, status);
  // Delivered stays the order's own message (updateOrderStatus), and order statuses never map to delivery events.
  assert.equal(tc.customerEventFor("delivered"), "order_delivered");
  assert.equal(tc.customerEventFor("out_for_delivery"), null);
  assert.equal(dm.deliveryMessage({ ...base, status: "delivered" }), null);
});

test("dedupe keys: per job, per attempt for out for delivery and failures, once for booked", () => {
  assert.equal(dm.deliveryRefId("confirmed", "job_1", 0), "job_1");
  assert.equal(dm.deliveryRefId("confirmed", "job_1", 1), "job_1", "a retry after a failed attempt doesn't say booked again");
  assert.equal(dm.deliveryRefId("out_for_delivery", "job_1", 0), "job_1:out:0");
  assert.equal(dm.deliveryRefId("out_for_delivery", "job_1", 1), "job_1:out:1", "the second try sends the code again");
  assert.equal(dm.deliveryRefId("failed", "job_1", 1), "job_1:failed:1");
  assert.equal(dm.deliveryRefId("failed", "job_1", 2), "job_1:failed:2");
  assert.equal(dm.deliveryRefId("returning", "job_1", 2), "job_1:returning");
  assert.equal(dm.deliveryRefId("at_pickup_point", "job_1", 0), "job_1");
  assert.notEqual(dm.deliveryRefId("confirmed", "job_2"), dm.deliveryRefId("confirmed", "job_1"), "a job handed to another partner messages again");
});

test("partner label: the name only when checkout shows it", () => {
  assert.equal(dm.deliveryPartnerLabel({ showPartnerName: true, label: "Express", partnerName: "Swift Riders" }, "doorstep"), "Swift Riders");
  assert.equal(dm.deliveryPartnerLabel({ showPartnerName: false, label: "Express delivery", partnerName: "Swift Riders" }, "doorstep"), "Express delivery");
  assert.equal(dm.deliveryPartnerLabel({ showPartnerName: false, label: "  ", partnerName: "Swift Riders" }, "doorstep"), "Standard delivery");
  assert.equal(dm.deliveryPartnerLabel({ showPartnerName: false, label: null, partnerName: "Swift Riders" }, "same_day"), "Same-day delivery");
  assert.equal(dm.deliveryPartnerLabel(null, "pickup_point"), "Pickup point delivery", "no connection: never the partner's name");
  const hidden = dm.deliveryMessage({ ...base, status: "out_for_delivery", connection: { showPartnerName: false, label: null, partnerName: "Swift Riders" } });
  assert.ok(!JSON.stringify(hidden).includes("Swift Riders"), "a hidden partner name appears nowhere in the message");
});

test("failed attempts in plain words; returns say it's coming back", () => {
  assert.equal(dm.plainFailReason("Customer not picking calls").clause, "the rider couldn't reach you on the phone");
  assert.equal(dm.plainFailReason("phone switched off").clause, "the rider couldn't reach you on the phone");
  assert.equal(dm.plainFailReason("Address not found").clause, "the rider couldn't find the address");
  assert.equal(dm.plainFailReason("nobody at home").clause, "nobody was there to receive it");
  assert.equal(dm.plainFailReason("Customer refused the parcel").clause, "the parcel was refused");
  assert.equal(dm.plainFailReason("asked to reschedule").clause, "a new delivery day was asked for");
  assert.deepEqual(dm.plainFailReason("  "), { clause: null, text: null });
  assert.equal(dm.deliveryProblemWords("failed", "Customer not picking calls"), "the delivery didn't go through today because the rider couldn't reach you on the phone");
  assert.equal(dm.deliveryProblemWords("failed", "Gate locked,\nsecurity said come back. "), "the delivery didn't go through today because a new delivery day was asked for");
  assert.equal(dm.deliveryProblemWords("failed", "Heavy rain flooded the road."), "the delivery didn't go through today. The rider said: Heavy rain flooded the road");
  assert.equal(dm.deliveryProblemWords("failed", "Call 0803 123 4567 at https://x.co"), "the delivery didn't go through today because the rider couldn't reach you on the phone");
  assert.equal(dm.deliveryProblemWords("failed", null), "the delivery didn't go through today");
  assert.match(dm.deliveryProblemWords("returning", "anything"), /on its way back/);
  assert.ok(!/0803/.test(dm.plainFailReason("Rider: 0803 123 4567 flood").text ?? ""), "phone numbers are taken out");
});

test("pickup point words: name, address, area and hours on one line", () => {
  assert.equal(dm.pickupPointWords({ name: "Ikeja Hub", address: "12 Allen Avenue", area: "Ikeja", hours: "Mon-Sat 9am-6pm" }), "Ikeja Hub, 12 Allen Avenue, Ikeja (open Mon-Sat 9am-6pm)");
  assert.equal(dm.pickupPointWords({ name: "Yaba Point", address: "3 Herbert Macaulay Way, Yaba", area: "Yaba", hours: null }), "Yaba Point, 3 Herbert Macaulay Way, Yaba", "an area already in the address isn't repeated");
  assert.equal(dm.pickupPointWords({ name: "Hub", address: "Line 1\nLine 2", hours: "" }), "Hub, Line 1 Line 2");
  assert.equal(dm.pickupPointWords(null), "the pickup point you chose");
  assert.ok(dm.pickupPointWords({ name: "X".repeat(300), address: "Y", hours: "Z" }).length <= 200);
});

test("SMS texts fill in the delivery details", () => {
  const booked = dm.deliveryMessage({ ...base, status: "confirmed" });
  assert.equal(booked.event, "delivery_accepted");
  assert.equal(booked.refId, "job_1");
  assert.equal(sms("delivery_accepted", booked.smsVars), "Adire House: order SIB-1042 is booked for delivery (Swift Riders). We'll text you when it's on the way. https://adire.shopinbos.com/order/ord_1");

  const out = dm.deliveryMessage({ ...base, status: "out_for_delivery", failedAttempts: 1 });
  assert.equal(out.refId, "job_1:out:1");
  assert.equal(sms("delivery_out", out.smsVars), "Adire House: order SIB-1042 is out for delivery (Swift Riders). Give the rider this code when you get it: 4821 https://adire.shopinbos.com/order/ord_1");
  assert.equal(out.values.delivery_code, "4821");

  const point = dm.deliveryMessage({ ...base, status: "at_pickup_point", service: "pickup_point", point: { name: "Ikeja Hub", address: "12 Allen Avenue", area: "Ikeja", hours: "Mon-Sat 9am-6pm" } });
  assert.equal(sms("delivery_at_point", point.smsVars), "Adire House: order SIB-1042 is ready to collect at Ikeja Hub, 12 Allen Avenue, Ikeja (open Mon-Sat 9am-6pm). Show code 4821 to collect it. https://adire.shopinbos.com/order/ord_1");

  const failed = dm.deliveryMessage({ ...base, status: "failed", failedAttempts: 1, failedReason: "Customer not picking calls" });
  assert.equal(failed.refId, "job_1:failed:1");
  assert.equal(sms("delivery_problem", failed.smsVars), "Adire House: order SIB-1042: the delivery didn't go through today because the rider couldn't reach you on the phone. We'll contact you about what happens next. https://adire.shopinbos.com/order/ord_1");

  const returning = dm.deliveryMessage({ ...base, status: "returning", failedAttempts: 2 });
  assert.match(sms("delivery_problem", returning.smsVars), /on its way back to us\. We'll contact you/);

  const noCode = dm.deliveryMessage({ ...base, status: "out_for_delivery", deliveryCode: null, buyerName: null });
  assert.equal(noCode.smsVars.delivery_code, "on your order page");
  assert.equal(noCode.values.first_name, "there");
  for (const message of [booked, out, point, failed, returning]) {
    for (const value of Object.values(message.values)) assert.ok(!/[\n\t]| {5,}/.test(value), `WhatsApp parameters stay on one line: ${value}`);
  }
});

test("delivery events are order messages: off by default, SMS defaults, WhatsApp templates that pass our checks", () => {
  const delivery = tc.CUSTOMER_EVENTS.filter((e) => e.group === "delivery").map((e) => e.key);
  assert.deepEqual(delivery, ["delivery_accepted", "delivery_out", "delivery_at_point", "delivery_problem"]);
  const settings = tc.readTransactional({});
  for (const key of delivery) {
    assert.equal(settings[key].whatsapp, false, `${key} is off until the seller (or WhatsApp setup) turns it on`);
    assert.equal(settings[key].sms, false);
    assert.ok(settings[key].smsText.includes("{{order_number}}"));
  }
  assert.match(settings.delivery_out.smsText, /\{\{delivery_code\}\}/);
  assert.match(settings.delivery_at_point.smsText, /\{\{pickup_point\}\}.*\{\{delivery_code\}\}/);
  assert.match(settings.delivery_problem.smsText, /\{\{delivery_problem\}\}/);

  for (const event of tc.CUSTOMER_EVENTS) assert.ok(tc.presetTemplate(event.preset), `${event.key} has a ready-made template`);
  assert.deepEqual([...tc.DELIVERY_MESSAGE_PRESETS], tc.DELIVERY_TEMPLATE_PRESETS.map((p) => p.key));
  for (const preset of tc.DELIVERY_TEMPLATE_PRESETS) {
    assert.equal(preset.category, "UTILITY");
    const problems = tc.templateProblems({ name: preset.name, category: preset.category, language: "en", content: preset.content, variables: [...preset.variables] });
    assert.deepEqual(problems, [], `${preset.key}: ${problems.join("; ")}`);
    assert.equal(preset.variables.length, tc.variableCount(preset.content), `${preset.key} maps every variable`);
    assert.ok(!tc.TEMPLATE_PRESETS.includes(preset), "not in the campaign gallery");
  }
  assert.ok(tc.presetTemplate("delivery_out").variables.includes("delivery_code"));
  assert.ok(tc.presetTemplate("delivery_at_point").variables.includes("pickup_point"));
  assert.ok(tc.presetTemplate("delivery_problem").variables.includes("delivery_problem"));
  for (const event of tc.DELIVERY_MESSAGE_EVENTS_ON) {
    const preset = tc.CUSTOMER_EVENTS.find((e) => e.key === event).preset;
    assert.ok(tc.DELIVERY_MESSAGE_PRESETS.includes(preset), `${event} uses a template the setup submits`);
  }

  // A filled template: every parameter has a value.
  const out = dm.deliveryMessage({ ...base, status: "out_for_delivery" });
  const preset = tc.presetTemplate("delivery_out");
  const { params, missing } = tc.fillTemplateVariables([...preset.variables], tc.variableCount(preset.content), out.values);
  assert.deepEqual(missing, []);
  assert.match(tc.renderTemplateText(preset.content, params), /Hi Ada, your order SIB-1042 from Adire House is out for delivery \(Swift Riders\)\. Give the rider this delivery code when you receive your parcel: 4821\./);
});

test("wiring: transitionJob tells the buyer after saving, the settings API accepts the new events, setup submits the templates", () => {
  const jobs = read("src/lib/logistics/jobs.ts");
  assert.match(jobs, /notifyDeliveryStage\(job\.id, input\.to\)/);
  assert.ok(jobs.indexOf("notifyDeliveryStage(") > jobs.indexOf("db.deliveryBooking.update({ where: { id: job.id }, data })"), "after the status is saved");
  assert.match(jobs, /job\.orderId && DELIVERY_STAGE_MESSAGES\.has\(input\.to\)/);
  const messages = read("src/lib/notifications/customer-messages.ts");
  assert.match(messages, /export async function notifyDeliveryStage/);
  assert.match(messages, /job\.replacedById/);
  const schemas = read("src/app/api/app/marketing/schemas.ts");
  for (const key of ["delivery_accepted", "delivery_out", "delivery_at_point", "delivery_problem"]) assert.match(schemas, new RegExp(`${key}: EventSettingSchema`));
  assert.match(read("src/lib/marketing/order-messages-setup.server.ts"), /\.\.\.DELIVERY_MESSAGE_PRESETS\]/);
});
