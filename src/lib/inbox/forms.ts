import "server-only";

import { ingestInbound } from "./service";
import { normaliseEmail, normalisePhone } from "./pure";

/** A storefront form submission with a message becomes (or continues) a "Contact form" conversation. */
export async function ingestFormMessage(input: { storeId: string; submissionId: string | null; type: string; name?: string | null; email?: string | null; phone?: string | null; message: string; visitorId?: string | null }) {
  const email = normaliseEmail(input.email);
  const phone = normalisePhone(input.phone);
  const threadId = email ?? phone ?? (input.submissionId ? `submission:${input.submissionId}` : null);
  if (!threadId) return null;
  return ingestInbound({
    storeId: input.storeId,
    channel: "form",
    threadId,
    subject: input.type === "contact" ? "Contact form" : `${input.type} form`,
    contact: { name: input.name || null, email, phone, visitorId: input.visitorId ?? null },
    message: { body: input.message, kind: "form", externalId: input.submissionId ? `form:${input.submissionId}` : null, meta: { formType: input.type, submissionId: input.submissionId } },
    // The forms route already emails the seller about every submission.
    notify: false,
  });
}
