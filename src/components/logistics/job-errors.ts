import type { TFunction } from "@shared/i18n";

// The plain-English errors the job and quote rules return (src/lib/logistics/jobs.ts, job-rules.ts, quotes.ts).
// Those stay English for the partner API and the phone app; partner and rider screens translate them here
// ("logistics" namespace, jobErrors.* keys). Anything not listed shows as it came.

type Translate = Pick<TFunction, "dynamic">;

const KEYS: Record<string, string> = {
  "We couldn't find that job. It may have been cancelled. Refresh to check.": "jobErrors.notFound",
  "This job isn't assigned to you.": "jobErrors.notYours",
  "This job is already finished, so it can't be changed.": "jobErrors.finished",
  "That rider is inactive. Pick an active rider.": "jobErrors.riderInactive",
  "This job has already moved on, so that step isn't possible now. Refresh to see where it is.": "jobErrors.movedOn",
  "Say why you couldn't deliver it, for example \"Customer not picking calls\".": "jobErrors.sayWhy",
  "That code doesn't match. Ask the customer for the 4-digit code on their phone.": "jobErrors.codeMismatch",
  "Type how much the customer paid.": "jobErrors.typeAmount",
  "Pick how the customer paid: cash or transfer.": "jobErrors.pickMethod",
  "We couldn't find that quote request. Refresh the page.": "jobErrors.quoteNotFound",
  "You've already answered this quote request.": "jobErrors.quoteAnswered",
  "Check the quote details.": "jobErrors.checkQuote",
};

/** A job or quote error in the person's language, or the message as it came. */
export function jobErrorWords(t: Translate, error: string) {
  const key = KEYS[error];
  return key ? t.dynamic(key, error) : error;
}
