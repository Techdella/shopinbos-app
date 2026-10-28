// The WhatsApp templates behind automatic alerts (notify(): verification, new jobs, messages, other updates). WhatsApp
// only lets a business start a chat with an approved template, so plain text from notify() would only reach people who
// messaged our number in the last 24 hours. Pure, unit-tested in tests/notifications.test.mjs.
//
// Same shape and rules as the team's templates (src/lib/support/whatsapp-pure.ts): {{1}} first name, {{2}} the
// business, {{3}} what happened plus the link, never a variable at the very start or end. They're submitted to Meta
// with the inbox templates (Admin › Lead campaigns › WhatsApp › "Submit the inbox templates to Meta"); the two
// verification ones are the team's own shopinbos_account_approved / shopinbos_account_update.

import { teamTemplate, teamTemplateParams, templateVariable, type TeamTemplate } from "../support/whatsapp-pure.ts";

export const NOTIFY_TEMPLATES: TeamTemplate[] = [
  {
    name: "shopinbos_new_job",
    purpose: "Alert: a new delivery job or price request for a delivery partner",
    category: "UTILITY",
    language: "en",
    body: "Hi {{1}}, there's a new delivery job for {{2}} on Shopinbos. {{3}}\n\nOpen your jobs on Shopinbos to accept it before it goes to another partner.",
    params: ["first_name", "business", "note"],
    sample: ["Ada", "Ada's Logistics", "Yaba to Lekki Phase 1, pick up today 12-4pm. https://app.shopinbos.com/logistics/jobs"],
  },
  {
    name: "shopinbos_new_message",
    purpose: "Alert: a new chat message on Shopinbos",
    category: "UTILITY",
    language: "en",
    body: "Hi {{1}}, {{2}} has a new message on Shopinbos. {{3}}\n\nOpen your messages on Shopinbos to reply.",
    params: ["first_name", "business", "note"],
    sample: ["Ada", "Ada's Logistics", "From Kemi's Fabrics: Can you pick up 3 parcels this afternoon? https://app.shopinbos.com/logistics/messages"],
  },
  {
    name: "shopinbos_update",
    purpose: "Alert: an update about orders, deliveries or payments",
    category: "UTILITY",
    language: "en",
    body: "Hi {{1}}, an update from Shopinbos for {{2}}: {{3}}\n\nOpen Shopinbos to see the details.",
    params: ["first_name", "business", "note"],
    sample: ["Ada", "Ada's Logistics", "Delivery fees paid: 18,500 naira for 7 deliveries is on its way to your bank. https://app.shopinbos.com/logistics/earnings"],
  },
];

const notifyTemplate = (name: string) => NOTIFY_TEMPLATES.find((template) => template.name === name) ?? teamTemplate(name);

/**
 * Which template carries an alert, and the values to fill in. `status` is the verification decision for
 * "verification.update" (verified → the approval template, anything else → the update one).
 */
export function notifyWhatsAppTemplate(input: {
  event: string;
  category: string;
  status?: string | null;
  title: string;
  description: string;
  url?: string | null;
  name?: string | null;
  business?: string | null;
}): { template: TeamTemplate; params: string[] } {
  const verified = input.event === "verification.update" && input.status === "verified";
  const name =
    input.event === "verification.update" ? (verified ? "shopinbos_account_approved" : "shopinbos_account_update")
    : input.event === "job.new" ? "shopinbos_new_job"
    : input.category === "messages" ? "shopinbos_new_message"
    : "shopinbos_update";
  const template = notifyTemplate(name)!;
  // The approval template already says "is now verified", so only the rest of the description goes in.
  const what = verified ? input.description : `${input.title.replace(/[.!]$/, "")}. ${input.description}`;
  const note = templateVariable(`${what}${input.url ? ` ${input.url}` : ""}`);
  return { template, params: teamTemplateParams(template, { name: input.name ?? null, agent: "", business: input.business ?? null, note }) };
}
