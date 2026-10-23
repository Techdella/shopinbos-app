// The "mail" namespace on its own (member emails, bell messages, WhatsApp wording) for server code and pure modules
// that shouldn't load every catalog: `mailT(locale)("foot.unsubscribe")`. Falls back to English per key.
import { createT, type Locale, type TFunction } from "./index.ts";
import mail from "./messages/mail/index.ts";
import type en from "./messages/mail/en.ts";

export type MailKey = keyof typeof en;
export type MailT = TFunction<MailKey>;

export function mailT(locale: Locale = "en"): MailT {
  return createT<MailKey>(locale, mail);
}
