// Every platform WhatsApp message goes through WhatsApp Cloud (our own number on Meta's Cloud API): alerts, sign-in
// codes, lead messages, review requests and supplier reminders. SMS providers (Brevo, Termii, Sendchamp, …) are SMS only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("platform WhatsApp sends only through WhatsApp Cloud", () => {
  const service = read("src/lib/notifications/service.ts");
  const body = (name) => service.slice(service.indexOf(`export async function ${name}`), service.indexOf("\n}\n", service.indexOf(`export async function ${name}`)));
  for (const name of ["sendWhatsAppMessage", "sendWhatsAppTemplate"]) {
    assert.match(body(name), /metaWhatsAppConfig\(\)/, `${name} uses WhatsApp Cloud`);
    assert.doesNotMatch(body(name), /getProviderInstance|sendchamp|africastalking/i, `${name} never uses an SMS provider`);
  }
  assert.match(service, /export function platformWhatsAppReady\(\) \{\n  return metaWhatsAppConfig\(\) !== null;/);
  // Callers with their own fallback no longer fall back to an SMS provider's WhatsApp.
  assert.doesNotMatch(read("src/lib/lead-growth/send.server.ts"), /sendWhatsAppTemplate\(|sendWhatsAppMessage\(/);
  assert.doesNotMatch(read("src/lib/reviews/requests.ts"), /SENDCHAMP_API_KEY/);
  assert.doesNotMatch(read("src/lib/auth/otp-delivery.server.ts"), /termiiWhatsAppRequest|sendchampWhatsAppRequest/);
});
