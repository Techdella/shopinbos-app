import type { Metadata } from "next";
import Link from "next/link";
import { AppPage, Card, CardHead, PillLink } from "@/components/app-kit";
import { field, pillButton, sellerFrame } from "@/components/seller-core";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { deliverySettingsFor } from "@/lib/delivery-market/market.server";
import { saveDeliverySettingsAction } from "@/app/actions/delivery-market";
import { Field, FlashNotice, OriginFields, SizeBandSelect } from "@/components/delivery-market/bits";
import { SellAreaPicker } from "@/components/delivery-market/SellAreaPicker";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("delivery"))("settings.title") };
}

type Search = { saved?: string; error?: string };

function Choice({ name, value, checked, title, hint }: { name: string; value: string; checked: boolean; title: string; hint: string }) {
  return (
    <label className="flex cursor-pointer gap-2.5 rounded-[14px] border border-app-line p-3.5 has-[:checked]:border-app-ink">
      <input type="radio" name={name} value={value} defaultChecked={checked} className={`${field.checkbox} mt-0.5`} />
      <span>
        <span className="block text-[14.5px] font-bold">{title}</span>
        <span className="block text-[12.5px] leading-[1.45] text-app-ink-soft">{hint}</span>
      </span>
    </label>
  );
}

// The shop's delivery settings for the logistics marketplace: where it sells, where parcels leave from, what
// checkout offers (own zones or delivery partners), pick up from the seller, the fallback, sizes and failed fees.
export default async function DeliverySettingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  const settings = await deliverySettingsFor(user.id);
  const t = await getT("delivery");

  return (
    <AppPage
      frame={sellerFrame(user, workspace.store)}
      title={t("settings.title")}
      sub={t("settings.sub")}
      actions={<PillLink href="/home/logistics" icon="arrowLeft">{t("logistics")}</PillLink>}
    >
      <FlashNotice saved={params.saved} error={params.error} />
      <form action={saveDeliverySettingsAction} className="grid max-w-[920px] gap-5">
        <input type="hidden" name="back" value="/home/logistics/settings" />

        <Card className="p-5">
          <CardHead title={t("settings.whereISell")} sub={t("settings.whereISellSub")} />
          <div className="mt-4">
            <SellAreaPicker sellArea={settings.sellArea} sellStates={settings.sellStates} />
          </div>
        </Card>

        <Card className="p-5">
          <CardHead title={t("settings.origin")} sub={t("settings.originSub")} />
          <div className="mt-4"><OriginFields settings={settings} /></div>
        </Card>

        <Card className="p-5">
          <CardHead title={t("settings.checkout")} sub={t("settings.checkoutSub")} />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Choice name="checkoutMode" value="zones" checked={settings.checkoutMode !== "partners"} title={t("settings.zones")} hint={t("settings.zonesHint")} />
            <Choice name="checkoutMode" value="partners" checked={settings.checkoutMode === "partners"} title={t("partners.title")} hint={t("settings.partnersHint")} />
          </div>
          <p className="mb-0 mt-3 text-[13px] text-app-ink-soft">
            {t("settings.editZonesIn")} <Link href="/home/shipping" className="font-bold text-app-accent-ink no-underline hover:underline">{t("settings.shipping")}</Link>. {t("settings.connectIn")} <Link href="/home/logistics/partners" className="font-bold text-app-accent-ink no-underline hover:underline">{t("partners.title")}</Link>.
          </p>
        </Card>

        <Card className="p-5">
          <CardHead title={t("settings.selfPickup")} sub={t("settings.selfPickupSub")} />
          <label className="mt-4 flex items-center gap-2 text-[14.5px] font-bold">
            <input type="checkbox" name="selfPickup" defaultChecked={settings.selfPickup} className={field.checkbox} />
            {t("settings.selfPickupLabel")}
          </label>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Field label={t("origin.address")}>
                <input name="pickupAddress" defaultValue={settings.pickupAddress ?? ""} maxLength={200} className={field.input} placeholder="Shop 4, Computer Village, Ikeja" />
              </Field>
            </div>
            <Field label={t("settings.hours")}>
              <input name="pickupHours" defaultValue={settings.pickupHours ?? ""} maxLength={120} className={field.input} placeholder={t("settings.hoursPlaceholder")} />
            </Field>
            <Field label={t("settings.instructions")}>
              <input name="pickupInstructions" defaultValue={settings.pickupInstructions ?? ""} maxLength={300} className={field.input} placeholder={t("settings.instructionsPlaceholder")} />
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <CardHead title={t("settings.fallback")} sub={t("settings.fallbackSub")} />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Choice name="fallback" value="pickup_only" checked={settings.fallback !== "flat_fee"} title={t("settings.pickupOnly")} hint={t("settings.pickupOnlyHint")} />
            <Choice name="fallback" value="flat_fee" checked={settings.fallback === "flat_fee"} title={t("settings.flatFee")} hint={t("settings.flatFeeHint")} />
          </div>
          <div className="mt-4 max-w-[260px]">
            <Field label={t("settings.flatFeeLabel")}>
              <input name="fallbackFee" inputMode="decimal" defaultValue={settings.fallbackFee > 0 ? String(settings.fallbackFee) : ""} className={field.input} placeholder="3000" />
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <CardHead title={t("settings.parcels")} />
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label={t("settings.usualSize")} hint={t("settings.usualSizeHint")}>
              <SizeBandSelect defaultValue={settings.defaultSizeBand} />
            </Field>
            <Field label={t("settings.failedPayer")} hint={t("settings.failedPayerHint")}>
              <select name="failedFeePayer" defaultValue={settings.failedFeePayer} className={field.select}>
                <option value="seller">{t("settings.iPay")}</option>
                <option value="customer">{t("settings.customerPays")}</option>
              </select>
            </Field>
          </div>
        </Card>

        <div className="flex justify-end">
          <button type="submit" className={pillButton.ink}>{t("settings.save")}</button>
        </div>
      </form>
    </AppPage>
  );
}
