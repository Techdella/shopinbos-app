import Link from "next/link";
import { SecuritySettings } from "@/components/auth/SecuritySettings";
import { saveSupplierNotificationPreferences } from "@/app/actions/supplier";
import { AppPage, Card } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { buttonClass, supplierFrame } from "@/components/supplier/supplier-kit";
import { db } from "@/lib/db/client";
import { getSupplierForUser } from "@/lib/role-queries";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ saved?: string }>;
};

const LINKS: Array<{ label: string; hint: string; href: string; icon: IconName }> = [
  { label: "Supplier profile", hint: "Name, logo, about, contact", href: "/supplier/profile", icon: "shop" },
  { label: "Billing and plan", hint: "Free plan or Supplier Max", href: "/supplier/profile?tab=Billing%20%26%20Plan", icon: "card" },
  { label: "Payouts", hint: "Bank account for payments", href: "/supplier/payouts", icon: "bank" },
  { label: "Team", hint: "People who help you", href: "/supplier/team", icon: "users" },
  { label: "Verification", hint: "Documents and trust score", href: "/supplier/verification", icon: "shield" },
  { label: "Customise your menu", hint: "Switch off what you don't use; replay the walkthrough", href: "/supplier/features", icon: "settings" },
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
      title="Settings"
      sub="How Shopinbos lets you know when sellers message you."
    >
      {params?.saved && <div className="mb-4"><Notice tone="success">Notification settings saved.</Notice></div>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="p-5 sm:p-6">
          <form action={saveSupplierNotificationPreferences}>
            <h2 className="m-0 text-[17px] font-extrabold">Message notifications</h2>
            <p className="mb-0 mt-1 text-[14px] text-app-ink-soft">Choose how we tell you about new messages from sellers.</p>

            <div className="mt-2 divide-y divide-app-line">
              <ToggleRow
                name="messageInApp"
                label="In the app"
                description="Show a notification in your supplier portal."
                defaultChecked={preference?.inApp ?? true}
              />
              <ToggleRow
                name="messageEmail"
                label="Email"
                description={`Send alerts to ${user.email}.`}
                defaultChecked={preference?.email ?? false}
              />
              <ToggleRow
                name="messageSms"
                label="SMS"
                description={user.phone ? `Text alerts to ${user.phone}.` : "Add a phone number to your account first."}
                defaultChecked={preference?.sms ?? false}
              />
            </div>

            <p className="mb-0 mt-3 rounded-[16px] bg-app-canvas px-4 py-3 text-[13.5px] leading-[1.5] text-app-ink-soft">
              Email and SMS only go out when those services are switched on for Shopinbos. In-app alerts always work.
            </p>

            <div className="mt-5 flex justify-end">
              <button type="submit" className={buttonClass.ink}>
                <Icon name="check" size={15} /> Save
              </button>
            </div>
          </form>
        </Card>

        <nav aria-label="More settings">
          <Card className="overflow-hidden">
            <ul className="m-0 list-none divide-y divide-app-line p-0">
              {LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="flex min-h-[60px] items-center gap-3 px-5 py-3 text-app-ink no-underline hover:bg-app-canvas">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-app-canvas"><Icon name={link.icon} size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-bold">{link.label}</span>
                      <span className="block truncate text-[12.5px] text-app-ink-soft">{link.hint}</span>
                    </span>
                    <Icon name="chevRight" size={16} className="text-app-ink-soft" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </nav>
      </div>

      <SecuritySettings className="mt-5 p-5 sm:p-6" />
    </AppPage>
  );
}
