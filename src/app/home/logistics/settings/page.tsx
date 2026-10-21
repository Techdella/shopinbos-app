import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppPage, AssistantNote, Card, CardHead, PillLink } from "@/components/app-kit";
import { field, pillButton, sellerFrame } from "@/components/seller-core";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { deliverySettingsFor } from "@/lib/delivery-market/market.server";
import { saveDeliverySettingsAction } from "@/app/actions/delivery-market";
import { Field, FlashNotice, OriginFields, SizeBandSelect } from "@/components/delivery-market/bits";
import { SellAreaPicker } from "@/components/delivery-market/SellAreaPicker";
import { DeliveryTip } from "@/components/delivery-market/DeliveryTip";
import { Term } from "@/components/learn/Term";
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

/** A numbered step heading: "1  Where you send parcels from". */
function StepHead({ n, title, sub }: { n: number; title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-app-ink text-[14px] font-extrabold text-white">{n}</span>
      <CardHead title={title} sub={sub} />
    </div>
  );
}

// The shop's delivery settings for the logistics marketplace, as four plain steps: where parcels leave from, where
// the shop delivers to, what checkout offers (own prices per place, or delivery partners, plus pick up from me) and
// the usual parcel size. The fallback and who pays for a failed attempt sit under "More options".
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

        <DeliveryTip>
          <AssistantNote who="peggy">{t("settings.tip")}</AssistantNote>
        </DeliveryTip>

        <Card className="p-5">
          <StepHead n={1} title={t("settings.origin")} sub={t("settings.originSub")} />
          <div className="mt-4"><OriginFields settings={settings} /></div>
        </Card>

        <Card className="p-5">
          <StepHead n={2} title={t("settings.whereISell")} sub={t("settings.whereISellSub")} />
          <div className="mt-4">
            <SellAreaPicker sellArea={settings.sellArea} sellStates={settings.sellStates} />
          </div>
        </Card>

        <Card className="p-5">
          <StepHead n={3} title={<Term k="checkout">{t("settings.checkout")}</Term>} sub={t("settings.checkoutSub")} />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Choice name="checkoutMode" value="zones" checked={settings.checkoutMode !== "partners"} title={t("settings.zones")} hint={t("settings.zonesHint")} />
            <Choice name="checkoutMode" value="partners" checked={settings.checkoutMode === "partners"} title={t("settings.partnersChoice")} hint={t("settings.partnersHint")} />
          </div>
          <p className="mb-0 mt-3 text-[13px] text-app-ink-soft">
            {t("settings.editZonesIn")} <Link href="/home/shipping" className="font-bold text-app-accent-ink no-underline hover:underline">{t("settings.shipping")}</Link>. {t("settings.connectIn")} <Link href="/home/logistics/partners" className="font-bold text-app-accent-ink no-underline hover:underline">{t("partners.title")}</Link>.
          </p>

          <div className="mt-5 border-t border-app-line pt-4">
            <div className="text-[15px] font-extrabold">{t("settings.selfPickup")}</div>
            <p className="m-0 mt-0.5 text-[13px] text-app-ink-soft">{t("settings.selfPickupSub")}</p>
            <label className="mt-3 flex items-center gap-2 text-[14.5px] font-bold">
              <input type="checkbox" name="selfPickup" defaultChecked={settings.selfPickup} className={field.checkbox} />
              {t("settings.selfPickupLabel")}
            </label>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Field label={t("settings.pickupAddress")}>
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
          </div>
        </Card>

        <Card className="p-5">
          <StepHead n={4} title={t("settings.parcels")} sub={t("settings.parcelsSub")} />
          <div className="mt-4 max-w-[420px]">
            <Field label={t("settings.usualSize")} hint={t("settings.usualSizeHint")}>
              <SizeBandSelect defaultValue={settings.defaultSizeBand} />
            </Field>
          </div>
        </Card>

        <details className="group rounded-[18px] border border-app-line bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block text-[15.5px] font-extrabold">{t("settings.more")}</span>
              <span className="block text-[13px] text-app-ink-soft">{t("settings.moreSub")}</span>
            </span>
            <span aria-hidden className="text-[18px] font-bold text-app-ink-soft transition-transform group-open:rotate-45">+</span>
          </summary>
          <div className="grid gap-6 border-t border-app-line px-5 pb-5 pt-4">
            <div>
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
            </div>
            <div className="max-w-[420px]">
              <Field label={t("settings.failedPayer")} hint={t("settings.failedPayerHint")}>
                <select name="failedFeePayer" defaultValue={settings.failedFeePayer} className={field.select}>
                  <option value="seller">{t("settings.iPay")}</option>
                  <option value="customer">{t("settings.customerPays")}</option>
                </select>
              </Field>
            </div>
          </div>
        </details>

        <div className="flex justify-end">
          <button type="submit" className={pillButton.ink}>{t("settings.save")}</button>
        </div>
      </form>
    </AppPage>
  );
}
