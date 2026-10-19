"use client";

import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";

// "Every screen has a Help button" (simplicity rules, section 8A). Opens the help panel the app shell already
// mounts (Sidebar → SupportChatModal: Peggy, a person, a setup request, or a one-minute video for this screen),
// so there is only ever one panel.
export const OPEN_HELP_EVENT = "shopinbos:open-help";

export function HelpButton({ className = "" }: { className?: string }) {
  const t = useT("common");
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_HELP_EVENT))}
      className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border border-app-line bg-white px-4 text-[14px] font-extrabold text-app-ink hover:border-app-line-strong ${className}`}
    >
      <Icon name="chat" size={16} /> {t("help")}
    </button>
  );
}
