import type { TFunction } from "@shared/i18n";
import type { MessageKey } from "@shared/i18n/catalog";

/** formatMinutes() (lib/marketing/flows) in the person's language: "2 days", "1 hour", "30 minutes". */
export function durationText(minutes: number, t: TFunction<MessageKey<"emailBuilder">>) {
  if (minutes % 1440 === 0) return t("dur.days", { count: minutes / 1440 });
  if (minutes % 60 === 0) return t("dur.hours", { count: minutes / 60 });
  return t("dur.minutes", { count: minutes });
}
