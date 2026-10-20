import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { removePartnerPickupPoint, savePartnerPickupPoint } from "@/app/actions/delivery-market-partner";
import { Card, CardHead, EmptyState, ListCard, Pill, PillLink, TextLink } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { ActionNotice, PartnerPage, SubmitButton, inputClass, labelClass } from "@/components/logistics/kit";
import { NG_STATES, canonicalState } from "@shared/delivery-market";

// The partner's pickup points (logistics marketplace): places customers collect parcels from. Shops that offer
// pickup points show the ones in the customer's state at checkout.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pickup points" };

interface PointFields {
  id?: string;
  name: string;
  address: string;
  state: string;
  area: string | null;
  hours: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
}

const EMPTY: PointFields = { name: "", address: "", state: "", area: null, hours: null, phone: null, lat: null, lng: null };

function PointForm({ point, defaultState, submitLabel }: { point: PointFields; defaultState: string; submitLabel: string }) {
  const key = point.id ?? "new";
  return (
    <form action={savePartnerPickupPoint} className="grid gap-3 sm:grid-cols-2">
      {point.id && <input type="hidden" name="pointId" value={point.id} />}
      <div className="sm:col-span-2">
        <label htmlFor={`name-${key}`} className={labelClass}>Name</label>
        <input id={`name-${key}`} name="name" required maxLength={80} defaultValue={point.name} placeholder="Yaba hub" className={inputClass} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`address-${key}`} className={labelClass}>Address</label>
        <input id={`address-${key}`} name="address" required maxLength={200} defaultValue={point.address} placeholder="14 Commercial Avenue, Sabo" className={inputClass} />
      </div>
      <div>
        <label htmlFor={`state-${key}`} className={labelClass}>State</label>
        <select id={`state-${key}`} name="state" required defaultValue={point.state || defaultState} className={inputClass}>
          <option value="">Pick a state</option>
          {NG_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={`area-${key}`} className={labelClass}>Area or LGA</label>
        <input id={`area-${key}`} name="area" maxLength={80} defaultValue={point.area ?? ""} placeholder="Yaba" className={inputClass} />
      </div>
      <div>
        <label htmlFor={`hours-${key}`} className={labelClass}>Opening hours</label>
        <input id={`hours-${key}`} name="hours" maxLength={120} defaultValue={point.hours ?? ""} placeholder="Mon–Sat, 9am–6pm" className={inputClass} />
      </div>
      <div>
        <label htmlFor={`phone-${key}`} className={labelClass}>Phone</label>
        <input id={`phone-${key}`} name="phone" type="tel" maxLength={40} defaultValue={point.phone ?? ""} placeholder="0803 412 7790" className={inputClass} />
      </div>
      <details className="group sm:col-span-2">
        <summary className="cursor-pointer list-none text-[15px] font-bold text-app-ink-soft [&::-webkit-details-marker]:hidden">
          Map pin (optional) <span aria-hidden className="inline-block transition group-open:rotate-90">›</span>
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`lat-${key}`} className={labelClass}>Latitude</label>
            <input id={`lat-${key}`} name="lat" inputMode="decimal" defaultValue={point.lat ?? ""} placeholder="6.5095" className={inputClass} />
          </div>
          <div>
            <label htmlFor={`lng-${key}`} className={labelClass}>Longitude</label>
            <input id={`lng-${key}`} name="lng" inputMode="decimal" defaultValue={point.lng ?? ""} placeholder="3.3711" className={inputClass} />
          </div>
          <p className="m-0 text-[14px] text-app-ink-soft sm:col-span-2">In Google Maps, press and hold the spot, then copy the two numbers it shows.</p>
        </div>
      </details>
      <div className="sm:col-span-2">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

export default async function LogisticsPickupPointsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const { saved, error } = await searchParams;
  const points = await db.logisticsPickupPoint.findMany({
    where: { logisticsPartnerId: partner.id, active: true },
    orderBy: [{ state: "asc" }, { name: "asc" }],
  });
  const defaultState = canonicalState(partner.city) ?? "";
  const offersPoints = partner.services.includes("pickup_point");

  return (
    <PartnerPage
      frame={{ user, partner }}
      title="Pickup points"
      sub="Places customers can collect their parcels from. Shops show the ones in the customer's state at checkout."
      actions={<PillLink href="/logistics/rates" icon="coin">Rate card</PillLink>}
    >
      <ActionNotice saved={saved} error={error} savedText="Pickup points saved." />
      {!offersPoints && (
        <div className="mb-4">
          <Notice tone="info">
            Customers only see your pickup points when you offer the pickup point service. <TextLink href="/logistics/coverage#where-you-work">Turn it on in Coverage</TextLink>
          </Notice>
        </div>
      )}

      <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_420px]">
        <div className="min-w-0">
          {points.length === 0 ? (
            <EmptyState icon="pin" title="No pickup points yet">Add your first one: a hub, an office or a partner shop where customers can collect parcels.</EmptyState>
          ) : (
            <ListCard>
              {points.map((point) => (
                <li key={point.id} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-app-line bg-app-canvas text-app-ink-soft"><Icon name="pin" size={18} /></span>
                    <div className="min-w-0 flex-1 basis-[200px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-extrabold">{point.name}</span>
                        <Pill>{[point.area, point.state].filter(Boolean).join(", ")}</Pill>
                      </div>
                      <p className="m-0 mt-0.5 break-words text-[15px] text-app-ink-soft">{point.address}</p>
                      <p className="m-0 mt-0.5 text-[15px] text-app-ink-soft">{[point.hours, point.phone].filter(Boolean).join(" · ") || "Add opening hours and a phone number so customers know when to come."}</p>
                      {point.lat !== null && point.lng !== null && (
                        <a href={`https://www.google.com/maps?q=${point.lat},${point.lng}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[14px] font-extrabold text-app-accent-ink no-underline hover:underline">See on the map</a>
                      )}
                    </div>
                    <form action={removePartnerPickupPoint}>
                      <input type="hidden" name="pointId" value={point.id} />
                      <SubmitButton tone="white" size="sm" aria-label={`Remove ${point.name}`}>Remove</SubmitButton>
                    </form>
                  </div>
                  <details className="group mt-3">
                    <summary className="cursor-pointer list-none text-[15px] font-bold text-app-ink-soft [&::-webkit-details-marker]:hidden">
                      Edit <span aria-hidden className="inline-block transition group-open:rotate-90">›</span>
                    </summary>
                    <div className="mt-3">
                      <PointForm point={point} defaultState={defaultState} submitLabel="Save changes" />
                    </div>
                  </details>
                </li>
              ))}
            </ListCard>
          )}
        </div>

        <Card className="h-fit p-5">
          <CardHead title="Add a pickup point" sub="Orders already placed keep the point the customer chose." />
          <div className="mt-4">
            <PointForm point={EMPTY} defaultState={defaultState} submitLabel="Add pickup point" />
          </div>
        </Card>
      </div>
    </PartnerPage>
  );
}
