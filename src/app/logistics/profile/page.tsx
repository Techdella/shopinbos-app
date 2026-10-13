import type { Metadata } from "next";
import { SecuritySettings } from "@/components/auth/SecuritySettings";
import { updateLogisticsProfile } from "@/app/actions/logistics";
import { requireRole } from "@/lib/server-auth";
import { userLinks } from "@/lib/email/compliance.server";
import { getLogisticsWorkspace } from "@/lib/workspace";
import { Card, CardHead, Pill, PillLink, TextLink } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { logisticsRouteLimitMessage } from "@/lib/plan-limits";
import { KeyValue, PartnerPage, SubmitButton, inputClass, labelClass, naira, textareaClass } from "@/components/logistics/kit";
import { LogoUploadForm } from "./LogoUploadForm";
import { IdentityImageUploader } from "@/components/profile/IdentityImageUploader";
import { CoverImageUpload } from "./CoverImageUpload";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Company" };

type PageProps = {
  searchParams?: Promise<{ tab?: string; limit?: string; saved?: string; error?: string; verification?: string }>;
};

interface ServiceHours {
  day: string;
  open: string;
  close: string;
  cutoff: string;
  active: boolean;
}

const DEFAULT_HOURS: ServiceHours[] = [
  { day: "Mon-Fri", open: "08:00", close: "20:00", cutoff: "16:00", active: true },
  { day: "Saturday", open: "09:00", close: "18:00", cutoff: "14:00", active: true },
  { day: "Sunday", open: "10:00", close: "16:00", cutoff: "12:00", active: false },
];

function serviceHours(onboardingState: unknown): ServiceHours[] {
  const saved = onboardingState && typeof onboardingState === "object" ? (onboardingState as { serviceHours?: unknown }).serviceHours : null;
  return Array.isArray(saved) && saved.length ? (saved as ServiceHours[]) : DEFAULT_HOURS;
}

export default async function LogisticsProfilePage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const emailPreferencesUrl = userLinks(user.id)?.preferences ?? null;
  const workspace = await getLogisticsWorkspace(user.id);
  if (!workspace) return null;
  const { partner } = workspace;

  const hours = serviceHours(partner.onboardingState);
  const isVerified = partner.verificationStatus === "verified";
  const limitMessage =
    params.limit === "routes"
      ? logisticsRouteLimitMessage()
      : params.limit === "team"
        ? "Starter includes a small team. Move to Pro to add more riders and dispatchers."
        : null;

  return (
    <PartnerPage
      frame={{ user, partner }}
      title="Company"
      sub="Your company details and the public page sellers see when they choose a delivery partner."
      actions={
        <>
          {isVerified && <PillLink href={`/logistics/partners/${partner.slug}`} icon="eye">See your page</PillLink>}
        </>
      }
    >
      <div className="mb-4 grid gap-3 empty:hidden">
        {params.saved && <Notice tone="success">Saved.</Notice>}
        {params.error && <Notice tone="error">{params.error}</Notice>}
        {limitMessage && <Notice tone="info">{limitMessage}</Notice>}
        {params.verification === "pending" && !isVerified && (
          <Notice tone="info">You can take jobs once your company is verified. <TextLink href="/logistics/verification">Finish verification</TextLink></Notice>
        )}
      </div>

      <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_400px]">
        <div className="grid min-w-0 content-start gap-5">
          <Card className="overflow-hidden">
            <CoverImageUpload currentBanner={partner.bannerUrl ?? null} displayName={partner.displayName} city={partner.city ?? ""} />
            <div className="-mt-9 flex flex-wrap items-end gap-4 px-5 pb-5">
              <LogoUploadForm currentLogo={partner.logoUrl ?? null} displayName={partner.displayName} />
              <div className="min-w-0 pb-1">
                <div className="truncate text-[17px] font-extrabold">{partner.displayName}</div>
                <div className="text-[15px] text-app-ink-soft">Logo and cover save as soon as you pick a picture.</div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <CardHead title="Your photo" sub="Shows in the top bar, the menu and your messages with sellers." />
            <div className="mt-4">
              <IdentityImageUploader kind="avatar" initialUrl={user.avatarUrl ?? null} name={user.name} title="Your photo" hideTitle />
            </div>
          </Card>

          <form id="profile-form" action={updateLogisticsProfile} className="grid gap-5">
            <Card className="p-5">
              <CardHead title="About your company" />
              <div className="mt-4 grid gap-3">
                <div>
                  <label htmlFor="displayName" className={labelClass}>Company name</label>
                  <input id="displayName" name="displayName" defaultValue={partner.displayName} required className={inputClass} />
                </div>
                <div>
                  <label htmlFor="description" className={labelClass}>About</label>
                  <textarea id="description" name="description" rows={4} defaultValue={partner.description ?? ""} placeholder="Who you are, where you deliver and what you're good at." className={textareaClass} />
                  <VoiceInputButton targetId="description" context="a description of a delivery business" className="mt-2" />
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <CardHead title="Contact and pricing" />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="name" className={labelClass}>Your name</label>
                  <input id="name" name="name" defaultValue={user.name} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="whatsappNumber" className={labelClass}>WhatsApp</label>
                  <input id="whatsappNumber" name="whatsappNumber" type="tel" defaultValue={partner.whatsappNumber ?? ""} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="city" className={labelClass}>City</label>
                  <input id="city" name="city" defaultValue={partner.city} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="country" className={labelClass}>Country</label>
                  <input id="country" name="country" defaultValue={partner.country} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="pricingModel" className={labelClass}>How you charge</label>
                  <select id="pricingModel" name="pricingModel" defaultValue={partner.pricingModel} className={inputClass}>
                    <option value="fixed">Fixed price per delivery</option>
                    <option value="weight_based">Based on weight</option>
                    <option value="distance_based">Based on distance</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="basePrice" className={labelClass}>Starting price (₦)</label>
                  <input id="basePrice" name="basePrice" type="number" min="0" inputMode="numeric" defaultValue={partner.basePrice} className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="estimatedSpeed" className={labelClass}>Delivery speed</label>
                  <input id="estimatedSpeed" name="estimatedSpeed" defaultValue={partner.estimatedSpeed ?? ""} placeholder="Same day within Lagos" className={inputClass} />
                </div>
              </div>
            </Card>

            <details className="group rounded-[22px] border border-app-line bg-white p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="block text-[17px] font-extrabold">Opening hours (optional)</span>
                  <span className="block text-[15px] text-app-ink-soft">When you work, and the latest time a seller can book a pickup for the same day.</span>
                </span>
                <span aria-hidden className="text-[20px] text-app-ink-soft transition group-open:rotate-90">›</span>
              </summary>
              <div className="mt-4 grid gap-3">
                {hours.map((row, index) => (
                  <fieldset key={index} className="m-0 grid min-w-0 grid-cols-3 items-end gap-3 rounded-[16px] border border-app-line p-3 sm:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))_auto]">
                    <legend className="sr-only">{row.day}</legend>
                    <input type="hidden" name={`hours_${index}_day`} value={row.day} />
                    <div className="col-span-3 self-center text-[15px] font-extrabold sm:col-span-1">{row.day}</div>
                    <div className="min-w-0">
                      <label htmlFor={`hours_${index}_open`} className="mb-1 block text-[15px] text-app-ink-soft">Opens</label>
                      <input id={`hours_${index}_open`} name={`hours_${index}_open`} type="time" defaultValue={row.open} className={`${inputClass} px-2.5`} />
                    </div>
                    <div className="min-w-0">
                      <label htmlFor={`hours_${index}_close`} className="mb-1 block text-[15px] text-app-ink-soft">Closes</label>
                      <input id={`hours_${index}_close`} name={`hours_${index}_close`} type="time" defaultValue={row.close} className={`${inputClass} px-2.5`} />
                    </div>
                    <div className="min-w-0">
                      <label htmlFor={`hours_${index}_cutoff`} className="mb-1 block text-[15px] text-app-ink-soft">Last same-day booking</label>
                      <input id={`hours_${index}_cutoff`} name={`hours_${index}_cutoff`} type="time" defaultValue={row.cutoff} className={`${inputClass} px-2.5`} />
                    </div>
                    <label className="col-span-3 flex min-h-[44px] items-center gap-2 text-[15px] font-bold sm:col-span-1">
                      <input type="checkbox" name={`hours_${index}_active`} defaultChecked={row.active} className="h-5 w-5 accent-[#16141F]" />
                      Open
                    </label>
                  </fieldset>
                ))}
              </div>
            </details>

            <div className="flex justify-end">
              <SubmitButton>Save</SubmitButton>
            </div>
          </form>
        </div>

        <div className="grid min-w-0 content-start gap-5">
          <Card className="overflow-hidden">
            <div
              className="h-[90px] bg-app-ink bg-cover bg-center"
              style={partner.bannerUrl ? { backgroundImage: `url(${partner.bannerUrl})` } : undefined}
              aria-hidden
            />
            <div className="p-5">
              <CardHead title="How sellers see you" />
              <div className="mt-3 flex items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[14px] bg-app-canvas text-[18px] font-extrabold">
                  {partner.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={partner.logoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    partner.displayName.charAt(0).toUpperCase()
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-extrabold">{partner.displayName}</span>
                    {isVerified && <Pill tone="success">Verified</Pill>}
                  </div>
                  <div className="truncate text-[15px] text-app-ink-soft">{[partner.city, ...partner.vehicleTypes].filter(Boolean).join(" · ")}</div>
                </div>
              </div>
              <div className="mt-3 divide-y divide-app-line">
                <KeyValue label="Rating">{partner.ratingCount ? `${partner.rating.toFixed(1)} ★ (${partner.ratingCount})` : "No reviews yet"}</KeyValue>
                <KeyValue label="Reliability">{partner.reliabilityScore ? `${partner.reliabilityScore} / 100` : "Builds up with deliveries"}</KeyValue>
                <KeyValue label="From">{partner.basePrice > 0 ? naira(partner.basePrice) : "Price on request"}</KeyValue>
              </div>
              {partner.deliveryTypes.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {partner.deliveryTypes.slice(0, 6).map((type) => <Pill key={type}>{type.replace(/_/g, " ")}</Pill>)}
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <CardHead title="Verification" action={<TextLink href="/logistics/verification">{isVerified ? "Details" : "Finish"}</TextLink>} />
            <p className="m-0 mt-2 text-[15px] leading-[1.5] text-app-ink-soft">
              {isVerified
                ? "Your company is verified. Sellers see the verified badge on your page."
                : "Upload your business papers so Shopinbos can verify you. You can take jobs once you're verified."}
            </p>
          </Card>

          <Card className="p-5">
            <CardHead title="Where you deliver" action={<TextLink href="/logistics/coverage">Edit</TextLink>} />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {partner.coverageZones.length ? partner.coverageZones.map((zone) => <Pill key={zone}>{zone}</Pill>) : <span className="text-[15px] text-app-ink-soft">No areas yet</span>}
            </div>
          </Card>
        </div>
      </div>

      {emailPreferencesUrl && (
        <Card className="mt-5 p-5">
          <CardHead title="Emails from Shopinbos" sub="Product news and tips, setup nudges and weekly summaries. Security, billing and booking emails always arrive." action={<PillLink href={emailPreferencesUrl} size="sm">Email preferences</PillLink>} />
        </Card>
      )}
      <SecuritySettings className="mt-5 p-5" />
    </PartnerPage>
  );
}
