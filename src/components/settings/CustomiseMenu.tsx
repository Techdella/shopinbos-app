"use client";

import { useState } from "react";
import { Notice, PillButton, Toggle } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { usePreferences } from "@/components/shell/useShellCounts";
import { NAV_BY_ROLE, type Role } from "@/lib/nav";
import { useT } from "@/components/i18n/I18nProvider";
import { navGroupLabel, navLabel } from "@shared/i18n/nav";

// "Customise your menu": switch off the parts of the app you don't use. Switched-off items leave the
// sidebar (and search); the pages and their data stay, so switching back on restores everything.
export function CustomiseMenu({ role }: { role: Role }) {
  const t = useT("account", "common");
  const tNav = useT("nav");
  const label = (item: { id: string; label: string }) => navLabel(tNav, role, item);
  const { prefs, loaded, save } = usePreferences();
  const [error, setError] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);
  const hidden = new Set(prefs?.hiddenNav ?? []);

  async function toggle(id: string, on: boolean) {
    setError(null);
    const next = on ? [...hidden].filter((value) => value !== id) : [...hidden, id];
    try {
      await save({ hiddenNav: next });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("menu.saveFailed"));
    }
  }

  async function replayTour() {
    setReplaying(true);
    try {
      await save({ tour: null });
      window.location.assign(NAV_BY_ROLE[role][0]?.items[0]?.href ?? "/");
    } catch {
      setReplaying(false);
      setError(t("menu.restartFailed"));
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid content-start gap-4">
        {error && <Notice>{error}</Notice>}
        {NAV_BY_ROLE[role].map((group) => (
          <section key={group.group} className="rounded-[22px] border border-app-line bg-white">
            <h2 className="m-0 border-b border-app-line px-5 py-4 text-[16px] font-extrabold">{group.label ? navGroupLabel(tNav, { group: group.group, label: group.label }) : group.pinBottom ? t("menu.account") : t("menu.main")}</h2>
            <ul className="m-0 list-none divide-y divide-app-line p-0">
              {group.items.map((item) => {
                const on = !hidden.has(item.id);
                return (
                  <li key={item.id} className="flex min-h-[64px] items-center gap-3 px-5 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-app-canvas"><Icon name={item.icon} size={17} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-bold">{label(item)}</span>
                      {item.children?.length ? (
                        <span className="block truncate text-[12.5px] text-app-ink-soft">{item.children.map((child) => label(child)).join(" · ")}</span>
                      ) : null}
                    </span>
                    {item.core ? (
                      <span className="shrink-0 text-[12.5px] font-semibold text-app-ink-soft">{t("menu.alwaysOn")}</span>
                    ) : (
                      <span className="flex shrink-0 items-center gap-2 text-[13px] font-bold">
                        <span className="hidden sm:inline">{on ? t("menu.on") : t("menu.off")}</span>
                        <Toggle on={on} onChange={(value) => void toggle(item.id, value)} label={t("menu.show", { name: label(item) })} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {!loaded && <p className="m-0 text-[13px] text-app-ink-soft">{t("menu.loading")}</p>}
      </div>
      <aside className="grid content-start gap-4">
        <section className="rounded-[22px] bg-app-mint p-5">
          <h2 className="m-0 text-[16px] font-extrabold">{t("menu.onlyUse")}</h2>
          <p className="mb-0 mt-2 text-[14px] leading-[1.55]">
            {t("menu.onlyUseSub")}
          </p>
        </section>
        <section className="rounded-[22px] border border-app-line bg-white p-5">
          <h2 className="m-0 text-[16px] font-extrabold">{t("menu.walkthrough")}</h2>
          <p className="mb-3 mt-2 text-[14px] leading-[1.55] text-app-ink-soft">{t("menu.walkthroughSub")}</p>
          <PillButton size="md" tone="white" busy={replaying} onClick={() => void replayTour()}>{t("menu.replay")}</PillButton>
        </section>
      </aside>
    </div>
  );
}
