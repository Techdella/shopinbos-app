// When Meta won't deliver a team WhatsApp message (its limit on business messages to people who haven't written to
// us, or a WhatsApp experiment), the inbox sends the same words by SMS, once, and says why in plain words
// (src/lib/support/whatsapp-pure.ts, src/lib/support/service.server.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const wa = await import("../src/lib/support/whatsapp-pure.ts");

test("Meta's refusals are told apart from other failures", () => {
  assert.ok(wa.metaRefusedDelivery("This message was not delivered to maintain healthy ecosystem engagement."));
  assert.ok(wa.metaRefusedDelivery("User's number is part of an experiment"));
  assert.ok(wa.metaRefusedDelivery("(#131049) blocked"));
  assert.ok(!wa.metaRefusedDelivery("Message failed to send because more than 24 hours have passed"));
  assert.ok(!wa.metaRefusedDelivery(null));
  assert.match(wa.whatsappFailureText("This message was not delivered to maintain healthy ecosystem engagement."), /haven't written to us/);
  assert.match(wa.whatsappFailureText("User's number is part of an experiment"), /experiment/);
  assert.equal(wa.whatsappFailureText("Something else"), "Something else");
  assert.equal(wa.whatsappFailureText(null), "WhatsApp couldn't deliver it.");
});

test("the SMS copy drops the WhatsApp-only reply line and fits in three texts", () => {
  const body = "Hi Oliver, it's Tech from the Shopinbos team. Please accept the partner terms.\n\nReply to this message and we'll carry on the conversation here.";
  assert.equal(wa.smsFallbackText(body), "Hi Oliver, it's Tech from the Shopinbos team. Please accept the partner terms.");
  assert.equal(wa.smsFallbackText("Your order is ready."), "Shopinbos: Your order is ready.");
  const long = wa.smsFallbackText(`Shopinbos ${"word ".repeat(200)}`);
  assert.ok(long.length <= 459 && long.endsWith("…"));
});

test("wiring: first Meta refusal sends the SMS once; the inbox has a Send by SMS button", () => {
  const service = read("src/lib/support/service.server.ts");
  assert.match(service, /const firstFailure = status === "failed" && message\.deliveryStatus !== "failed";/);
  assert.match(service, /if \(firstFailure && metaRefusedDelivery\(error\)\) \{\n\s+await sendSupportMessageBySms\(message\.id\)/);
  assert.match(service, /if \(copy\) return \{ ok: false, error: "Already sent by SMS\." \}/, "never twice");
  assert.match(service, /await sendSms\(\{ to: \[phone\], message: text \}\)/, "platform SMS (Brevo first)");
  assert.match(read("src/app/api/admin/support/tickets/[id]/messages/[messageId]/sms/route.ts"), /withAdmin\(/);
  const ui = read("src/components/support/admin/TicketWorkspace.tsx");
  assert.match(ui, /<SmsFallbackButton ticketId=\{ticketId\} messageId=\{message\.id\} \/>/);
  assert.match(ui, /whatsappFailureText\(message\.deliveryError\)/);
});
