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

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Delivery settings" };

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

  return (
    <AppPage
      frame={sellerFrame(user, workspace.store)}
      title="Delivery settings"
      sub="Where you sell, where parcels leave from, and what customers can pick at checkout."
      actions={<PillLink href="/home/logistics" icon="arrowLeft">Logistics</PillLink>}
    >
      <FlashNotice saved={params.saved} error={params.error} />
      <form action={saveDeliverySettingsAction} className="grid max-w-[920px] gap-5">
        <input type="hidden" name="back" value="/home/logistics/settings" />

        <Card className="p-5">
          <CardHead title="Where I sell" sub="Customers outside these places can't order delivery (they can still pick up, if you allow it)." />
          <div className="mt-4">
            <SellAreaPicker sellArea={settings.sellArea} sellStates={settings.sellStates} />
          </div>
        </Card>

        <Card className="p-5">
          <CardHead title="Where parcels leave from" sub="Delivery partners use this to collect from you and price each delivery." />
          <div className="mt-4"><OriginFields settings={settings} /></div>
        </Card>

        <Card className="p-5">
          <CardHead title="Delivery at checkout" sub="How customers get delivery prices when they buy." />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Choice name="checkoutMode" value="zones" checked={settings.checkoutMode !== "partners"} title="My own delivery zones" hint="You set the prices per area in Shipping, and arrange delivery yourself." />
            <Choice name="checkoutMode" value="partners" checked={settings.checkoutMode === "partners"} title="Delivery partners" hint="Customers see doorstep and pickup-point options, with prices, from the partners you've connected." />
          </div>
          <p className="mb-0 mt-3 text-[13px] text-app-ink-soft">
            Edit your own zones in <Link href="/home/shipping" className="font-bold text-app-accent-ink no-underline hover:underline">Shipping</Link>. Connect partners in <Link href="/home/logistics/partners" className="font-bold text-app-accent-ink no-underline hover:underline">Delivery partners</Link>.
          </p>
        </Card>

        <Card className="p-5">
          <CardHead title="Pick up from me" sub="Customers collect their order from you, for free." />
          <label className="mt-4 flex items-center gap-2 text-[14.5px] font-bold">
            <input type="checkbox" name="selfPickup" defaultChecked={settings.selfPickup} className={field.checkbox} />
            Let customers pick up from me
          </label>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Field label="Pickup address">
                <input name="pickupAddress" defaultValue={settings.pickupAddress ?? ""} maxLength={200} className={field.input} placeholder="Shop 4, Computer Village, Ikeja" />
              </Field>
            </div>
            <Field label="Opening hours">
              <input name="pickupHours" defaultValue={settings.pickupHours ?? ""} maxLength={120} className={field.input} placeholder="Mon–Sat, 9am–6pm" />
            </Field>
            <Field label="Instructions">
              <input name="pickupInstructions" defaultValue={settings.pickupInstructions ?? ""} maxLength={300} className={field.input} placeholder="Call when you arrive" />
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <CardHead title="When no partner covers an address" sub="For delivery partners at checkout." />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Choice name="fallback" value="pickup_only" checked={settings.fallback !== "flat_fee"} title="Pickup only" hint="Customers there can only pick up from you (if you allow it)." />
            <Choice name="fallback" value="flat_fee" checked={settings.fallback === "flat_fee"} title="A flat delivery fee" hint="Customers pay this and you arrange the delivery yourself." />
          </div>
          <div className="mt-4 max-w-[260px]">
            <Field label="Flat fee (₦)">
              <input name="fallbackFee" inputMode="decimal" defaultValue={settings.fallbackFee > 0 ? String(settings.fallbackFee) : ""} className={field.input} placeholder="3000" />
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <CardHead title="Parcels" />
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Usual parcel size" hint="Used for products without a delivery size or weight.">
              <SizeBandSelect defaultValue={settings.defaultSizeBand} />
            </Field>
            <Field label="Who pays if a delivery attempt fails" hint="Partners may charge a fee to try again.">
              <select name="failedFeePayer" defaultValue={settings.failedFeePayer} className={field.select}>
                <option value="seller">I pay</option>
                <option value="customer">The customer pays</option>
              </select>
            </Field>
          </div>
        </Card>

        <div className="flex justify-end">
          <button type="submit" className={pillButton.ink}>Save delivery settings</button>
        </div>
      </form>
    </AppPage>
  );
}
