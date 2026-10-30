import Link from "next/link";
import { LanguageSettingsCard } from "@/components/i18n/LanguagePicker";
import { SecuritySettings } from "@/components/auth/SecuritySettings";
import { saveSupplierNotificationPreferences } from "@/app/actions/supplier";
import { AppPage, Card } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { buttonClass, supplierFrame } from "@/components/supplier/supplier-kit";
import { db } from "@/lib/db/client";
import { getSupplierForUser } from "@/lib/role-queries";
import { requireRole } from "@/lib/server-auth";
import { userLinks } from "@/lib/email/compliance.server";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ saved?: string }>;
};

// Labels and hints are "supplier" keys: settings.link.<key>.label / .hint.
const LINKS: Array<{ key: string; href: string; icon: IconName }> = [
  // My details: the person's name, email and phone, and the business's phone and address.
  { key: "details", href: "/supplier/details", icon: "user" },
  { key: "profile", href: "/supplier/profile", icon: "shop" },
  { key: "billing", href: "/supplier/profile?tab=Billing%20%26%20Plan", icon: "card" },
  { key: "payouts", href: "/supplier/payouts", icon: "bank" },
  { key: "team", href: "/supplier/team", icon: "users" },
  { key: "verification", href: "/supplier/verification", icon: "shield" },
  { key: "notifications", href: "/home/notifications/preferences", icon: "bell" },
  { key: "features", href: "/supplier/features", icon: "settings" },
];

function ToggleRow({
  name,
  label,
  description,
  defaultChecked,
}: {
  name: string;
  label: string;
  description: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex min-h-[64px] cursor-pointer items-center gap-4 py-3.5">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold">{label}</span>
        <span className="mt-0.5 block text-[13.5px] text-app-ink-soft">{description}</span>
      </span>
      <input name={name} type="checkbox" defaultChecked={defaultChecked} className="peer sr-only" />
      <span
        aria-hidden
        className="relative h-[30px] w-[52px] shrink-0 rounded-full bg-app-toggle-off transition peer-checked:bg-app-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-app-ink after:absolute after:left-[3px] after:top-[3px] after:h-[24px] after:w-[24px] after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:after:left-[25px]"
      />
    </label>
  );
}

export default async function SupplierSettingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  const emailPreferencesUrl = userLinks(user.id)?.preferences ?? null;
  const t = await getT("supplier", "common");
  const preference = await db.notificationPreference.findUnique({
    where: {
      userId_eventKey_category: {
        userId: user.id,
        eventKey: "message_received",
        category: "marketplace",
      },
    },
  });

  return (
    <AppPage
      frame={supplierFrame(user, supplier)}
      title={t("settings")}
      sub={t("settings.sub")}
    >
      {params?.saved && <div className="mb-4"><Notice tone="success">{t("settings.saved")}</Notice></div>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="p-5 sm:p-6">
          <form action={saveSupplierNotificationPreferences}>
            <h2 className="m-0 text-[17px] font-extrabold">{t("settings.messageNotifications")}</h2>
            <p className="mb-0 mt-1 text-[14px] text-app-ink-soft">{t("settings.chooseHow")}</p>

            <div className="mt-2 divide-y divide-app-line">
              <ToggleRow
                name="messageInApp"
                label={t("settings.inApp")}
                description={t("settings.inAppHint")}
                defaultChecked={preference?.inApp ?? true}
              />
              <ToggleRow
                name="messageEmail"
                label={t("team.email")}
                description={t("settings.emailHint", { email: user.email })}
                defaultChecked={preference?.email ?? false}
              />
              <ToggleRow
                name="messageSms"
                label={t("settings.sms")}
                description={user.phone ? t("settings.smsHint", { phone: user.phone }) : t("settings.addPhone")}
                defaultChecked={preference?.sms ?? false}
              />
            </div>

            <p className="mb-0 mt-3 rounded-[16px] bg-app-canvas px-4 py-3 text-[13.5px] leading-[1.5] text-app-ink-soft">
              {t("settings.channelsNote")}
            </p>

            <div className="mt-5 flex justify-end">
              <button type="submit" className={buttonClass.ink}>
                <Icon name="check" size={15} /> {t("save")}
              </button>
            </div>
          </form>
        </Card>

        <nav aria-label={t("settings.more")}>
          <Card className="overflow-hidden">
            <ul className="m-0 list-none divide-y divide-app-line p-0">
              {LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="flex min-h-[60px] items-center gap-3 px-5 py-3 text-app-ink no-underline hover:bg-app-canvas">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-app-canvas"><Icon name={link.icon} size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-bold">{t.dynamic(`settings.link.${link.key}.label`)}</span>
                      <span className="block truncate text-[12.5px] text-app-ink-soft">{t.dynamic(`settings.link.${link.key}.hint`)}</span>
                    </span>
                    <Icon name="chevRight" size={16} className="text-app-ink-soft" />
                  </Link>
                </li>
              ))}
              {emailPreferencesUrl && (
                <li>
                  <a href={emailPreferencesUrl} className="flex min-h-[60px] items-center gap-3 px-5 py-3 text-app-ink no-underline hover:bg-app-canvas">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-app-canvas"><Icon name="mail" size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-bold">{t("settings.emailPrefs")}</span>
                      <span className="block truncate text-[12.5px] text-app-ink-soft">{t("settings.emailPrefsHint")}</span>
                    </span>
                    <Icon name="chevRight" size={16} className="text-app-ink-soft" />
                  </a>
                </li>
              )}
            </ul>
          </Card>
        </nav>
      </div>

      <LanguageSettingsCard className="mt-5 sm:p-6" />
      <SecuritySettings className="mt-5 p-5 sm:p-6" />
    </AppPage>
  );
}
