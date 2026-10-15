"use client";

import { useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { FIELD_HELP, FIELD_INPUT, FIELD_LABEL } from "@/components/seller-settings/fields";
import { normalizeStoreSlug, SLUG_CHANGE_COOLDOWN_DAYS } from "@shared/store-address";

/**
 * Store name and web address (Settings › Store details). The name can change freely; it never moves the
 * address. A new address shows what happens to the old one and needs an explicit "I understand" before it saves.
 */
export function StoreAddressFields({ name, slug, rootDomain, live, daysLeft }: { name: string; slug: string; rootDomain: string; live: boolean; daysLeft: number }) {
  const t = useT("account", "common");
  const [value, setValue] = useState(slug);
  const next = normalizeStoreSlug(value);
  const changing = Boolean(next) && next !== slug;
  const locked = live && daysLeft > 0;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="min-w-0">
        <label htmlFor="storeName" className={FIELD_LABEL}>{t("details.name")}</label>
        <input id="storeName" name="storeName" className={FIELD_INPUT} defaultValue={name} />
        <p className={FIELD_HELP}>{t("details.nameHelp")}</p>
      </div>
      <div className="min-w-0">
        <label htmlFor="slug" className={FIELD_LABEL}>{t("details.slug")}</label>
        <div className="flex items-center gap-2">
          <input
            id="slug"
            name="slug"
            className={FIELD_INPUT}
            value={value}
            disabled={locked}
            onChange={(event) => setValue(event.target.value)}
            onBlur={() => setValue(next || slug)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby="slug-help"
          />
        </div>
        <p id="slug-help" className={`${FIELD_HELP} break-all`}>
          {locked ? t("details.slugLocked", { days: daysLeft }) : t("details.address", { url: `${next || slug}.${rootDomain}` })}
        </p>
      </div>

      {changing && !locked ? (
        <div className="grid gap-3 rounded-[16px] border border-app-danger/30 bg-app-danger-tint p-4 text-[14px] leading-[1.55] md:col-span-2" role="alert">
          <strong className="text-[15px]">{t("details.slugWarnTitle")}</strong>
          <p className="m-0">
            {t(live ? "details.slugWarnLive" : "details.slugWarnDraft", { old: `${slug}.${rootDomain}`, new: `${next}.${rootDomain}`, days: SLUG_CHANGE_COOLDOWN_DAYS })}
          </p>
          <label className="flex cursor-pointer items-start gap-2.5 font-bold">
            <input type="checkbox" name="confirmSlugChange" value="yes" required className="mt-1 h-4 w-4 shrink-0" />
            <span>{t("details.slugConfirm", { new: `${next}.${rootDomain}` })}</span>
          </label>
        </div>
      ) : null}
    </div>
  );
}
