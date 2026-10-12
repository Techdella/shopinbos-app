// Plain-words versions of technical messages for the seller apps (simplicity rules, section 8A: "Error, failed,
// invalid" become a plain reason plus what to do). Pure: safe in server and client code, unit tested.

const META_PERMISSION = /permission|\(#10\)|\(#200\)|\(#3\)|oauth|access token|session has expired|not authorized|catalog_management|business_management|whatsapp_business/i;

/** A Meta (Facebook, Instagram, WhatsApp) error in plain words. The raw text belongs in a technical fold. */
export function plainMetaError(raw: string | null | undefined) {
  const text = String(raw ?? "");
  if (META_PERMISSION.test(text)) return "We need your permission on Facebook to do this. Ask us to help and we'll sort it out with you.";
  if (/rate|too many|limit/i.test(text)) return "Facebook is busy right now. Try again in a few minutes.";
  if (/timeout|timed out|network|fetch failed|ECONN|ENOTFOUND/i.test(text)) return "We couldn't reach Facebook just now. Check back in a few minutes.";
  return "Facebook didn't accept the update. Ask us to help and we'll check it for you.";
}

