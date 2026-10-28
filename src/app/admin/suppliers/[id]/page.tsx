import { notFound } from "next/navigation";
import { updateSupplierVerification } from "@/app/actions/admin";
import { setSupplierAcceptHours, setSupplierMarketplaceVisible } from "@/app/actions/admin-supplier-orders";
import { AppPage, Pill, PillLink, StatTile, Thumb } from "@/components/app-kit";
import { DecisionButtons, VerificationPill, adminFrame, formatDate } from "@/components/admin/AdminKit";
import { AdminDocumentViewer } from "@/components/verification/AdminDocumentViewer";
import { PeggyCallNotes } from "@/components/admin/PeggyCallNotes";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { parseVerificationDocs } from "@/lib/verification-utils";
import { ID_TYPE_LABELS, readSupplierIdentity, sourceForBusinessType, supplierTiers } from "@shared/supplier-onboarding";

export default async function AdminSupplierDetailPage(props: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");

  const { id } = await props.params;

  const supplier = await db.supplier.findUnique({
    where: { id },
    select: {
      userId: true,
      id: true,
      displayName: true,
      businessName: true,
      slug: true,
      country: true,
      city: true,
      logoUrl: true,
      verificationStatus: true,
      status: true,
      marketplaceVisible: true,
      trustScore: true,
      acceptHoursDropship: true,
      acceptHoursWholesale: true,
      missedOrders: true,
      verificationDocuments: true,
      identityChecks: true,
      onboardingState: true,
      businessType: true,
      buyModes: true,
      minimumOrder: true,
      pickupLat: true,
      pickupLng: true,
      address: true,
      payoutAccount: { select: { verificationStatus: true } },
      createdAt: true,
      updatedAt: true,
      _count: { select: { products: true } },
    },
  });

  if (!supplier) notFound();

  const docs = parseVerificationDocs(supplier.verificationDocuments);
  const identity = readSupplierIdentity(supplier.identityChecks);
  const tiers = supplierTiers({ verificationStatus: String(supplier.verificationStatus), docs, identity, payoutVerified: supplier.payoutAccount?.verificationStatus === "verified" });
  const onboarding = supplier.onboardingState && typeof supplier.onboardingState === "object" && !Array.isArray(supplier.onboardingState) ? (supplier.onboardingState as Record<string, unknown>) : {};
  const selfie = docs.find((doc) => doc.type === "selfie");
  const source = sourceForBusinessType(supplier.businessType);

  return (
    <AppPage
      frame={adminFrame(user, "Search suppliers")}
      title={
        <span className="flex min-w-0 items-center gap-3">
          <Thumb src={supplier.logoUrl} label={supplier.displayName} size={48} />
          <span className="min-w-0 break-words">{supplier.displayName}</span>
        </span>
      }
      sub={`${supplier.businessName} · /${supplier.slug} · ${supplier.city}, ${supplier.country}`}
      actions={
        <>
          <PillLink href="/admin/suppliers" icon="arrowLeft" iconOnlyOnPhone>All suppliers</PillLink>
          <PillLink href={`/admin/support/new?to=user:${supplier.userId}`} icon="chat">Message</PillLink>
          {supplier.verificationStatus !== "verified" && (
            <DecisionButtons
              action={updateSupplierVerification}
              followUp
              fields={{ supplierId: supplier.id, trustScore: String(supplier.trustScore ?? 0), redirectTo: `/admin/suppliers/${supplier.id}` }}
              approve="verified"
              reject="rejected"
              subject={supplier.displayName}
            />
          )}
        </>
      }
    >
      <section aria-label="Supplier summary" className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <StatTile tone="card" label="Verification" value={<VerificationPill status={supplier.verificationStatus} />} />
        <StatTile tone="card" label="Account" value={<Pill tone={supplier.status === "active" ? "success" : "danger"} dot>{supplier.status === "active" ? "Active" : supplier.status}</Pill>} />
        <StatTile tone="card" label="Trust score" value={`${supplier.trustScore ?? 0}/100`} />
        <StatTile tone="card" label="Products" value={supplier._count.products} />
        <StatTile tone="card" label="Documents" value={docs.length} />
        <StatTile tone="card" label="Joined" value={<span className="text-[20px]">{formatDate(supplier.createdAt)}</span>} />
      </section>

      <section aria-labelledby="marketplace-visible" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-app-line bg-white p-5">
        <div className="min-w-0">
          <h2 id="marketplace-visible" className="m-0 flex flex-wrap items-center gap-2 text-[17px] font-extrabold">
            Show in marketplace
            <Pill tone={supplier.marketplaceVisible ? "success" : "muted"} dot>{supplier.marketplaceVisible ? "Shown" : "Hidden"}</Pill>
          </h2>
          <p className="m-0 mt-1 text-[14px] text-app-ink-soft">
            {supplier.marketplaceVisible
              ? "Sellers can find this supplier and their products in Suppliers, Find products and Wholesale."
              : "Sellers can't find this supplier or their products. Products already in shops and orders already placed keep working."}
          </p>
        </div>
        <form action={setSupplierMarketplaceVisible}>
          <input type="hidden" name="supplierId" value={supplier.id} />
          <input type="hidden" name="visible" value={supplier.marketplaceVisible ? "0" : "1"} />
          <button type="submit" className={`inline-flex min-h-[40px] items-center rounded-full px-4 text-[13.5px] font-bold ${supplier.marketplaceVisible ? "border border-app-line bg-white text-app-ink hover:border-app-line-strong" : "bg-app-ink text-white"}`}>
            {supplier.marketplaceVisible ? "Hide from marketplace" : "Show in marketplace"}
          </button>
        </form>
      </section>

      <section aria-labelledby="accept-hours" className="mb-5 rounded-[18px] border border-app-line bg-white p-5">
        <h2 id="accept-hours" className="m-0 text-[17px] font-extrabold">Time to accept new orders</h2>
        <p className="m-0 mt-1 text-[14px] text-app-ink-soft">
          Leave empty for the default ({process.env.SUPPLIER_ACCEPT_HOURS_DROPSHIP || "4"} h for orders shops sold, {process.env.SUPPLIER_ACCEPT_HOURS_WHOLESALE || "24"} h for bulk orders). Missed so far: {supplier.missedOrders}.
        </p>
        <form action={setSupplierAcceptHours} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="supplierId" value={supplier.id} />
          <label className="grid gap-1 text-[13.5px] font-bold">Orders shops sold (hours)
            <input name="acceptHoursDropship" type="number" min={1} max={168} defaultValue={supplier.acceptHoursDropship ?? ""} className="min-h-[40px] w-[140px] rounded-full border border-app-line px-4 font-normal" />
          </label>
          <label className="grid gap-1 text-[13.5px] font-bold">Bulk orders (hours)
            <input name="acceptHoursWholesale" type="number" min={1} max={168} defaultValue={supplier.acceptHoursWholesale ?? ""} className="min-h-[40px] w-[140px] rounded-full border border-app-line px-4 font-normal" />
          </label>
          <button type="submit" className="inline-flex min-h-[40px] items-center rounded-full bg-app-ink px-4 text-[13.5px] font-bold text-white">Save</button>
        </form>
      </section>

      <section aria-labelledby="identity" className="mb-5 rounded-[18px] border border-app-line bg-white p-5">
        <h2 id="identity" className="m-0 text-[17px] font-extrabold">Onboarding answers and ID check</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <Pill tone={tiers.verifiedIndividual ? "success" : "muted"} dot>Verified Individual</Pill>
          <Pill tone={tiers.registeredBusiness ? "success" : "muted"} dot>Registered Business</Pill>
          <Pill tone={tiers.payoutReady ? "success" : "muted"} dot>Payout ready</Pill>
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-[14px] sm:grid-cols-2">
          <div><dt className="font-bold">ID</dt><dd className="m-0 text-app-ink-soft">{identity.idType ? ID_TYPE_LABELS[identity.idType] : "Not sent yet"}{identity.fullName ? ` · ${identity.fullName}` : ""}</dd></div>
          <div>
            <dt className="font-bold">NIN check</dt>
            <dd className="m-0 text-app-ink-soft">
              {identity.nin ? `Ending ${identity.nin.last4} · ${identity.nin.status}${identity.nin.provider ? ` (${identity.nin.provider})` : ""}${identity.nin.nameOnRecord ? ` · on record: ${identity.nin.nameOnRecord}` : ""}` : "No NIN (another ID: compare the ID photo with the selfie)"}
            </dd>
          </div>
          <div>
            <dt className="font-bold">Selfie</dt>
            <dd className="m-0 text-app-ink-soft">
              {selfie ? `${selfie.status}${selfie.faceMatch ? ` · face match ${selfie.faceMatch.match === null ? "no result" : selfie.faceMatch.match ? "yes" : "no"}${selfie.faceMatch.confidence !== null ? ` (${selfie.faceMatch.confidence}%)` : ""}` : " · no face match: compare it yourself"}${selfie.liveness ? " · liveness passed" : ""}` : "Not taken yet"}
            </dd>
          </div>
          <div><dt className="font-bold">CAC</dt><dd className="m-0 text-app-ink-soft">{onboarding.cacAnswer === "yes" ? "Registered" : onboarding.cacAnswer === "registering" ? "Registering now" : onboarding.cacAnswer === "no" ? "Works as an individual" : "Not answered"}</dd></div>
          <div><dt className="font-bold">Makes, imports or resells</dt><dd className="m-0 text-app-ink-soft">{source === "make" ? "Makes it" : source === "import" ? "Imports it" : "Resells it"}</dd></div>
          <div><dt className="font-bold">How shops can buy</dt><dd className="m-0 text-app-ink-soft">{supplier.buyModes.length ? supplier.buyModes.join(", ") : "Not answered"}{supplier.minimumOrder ? ` · minimum order ${supplier.minimumOrder}` : ""}</dd></div>
          <div>
            <dt className="font-bold">Goods leave from</dt>
            <dd className="m-0 text-app-ink-soft">
              {supplier.address || supplier.city}
              {supplier.pickupLat !== null && supplier.pickupLng !== null && (
                <>
                  {" · "}
                  <a className="font-bold text-app-ink underline" href={`https://www.google.com/maps?q=${supplier.pickupLat},${supplier.pickupLng}`} target="_blank" rel="noopener noreferrer">Map</a>
                </>
              )}
            </dd>
          </div>
          {typeof onboarding.catalogueRequestedAt === "string" && <div><dt className="font-bold">WhatsApp catalogue</dt><dd className="m-0 text-app-ink-soft">Asked us to list it ({formatDate(new Date(onboarding.catalogueRequestedAt))})</dd></div>}
        </dl>
        <p className="m-0 mt-3 text-[13px] text-app-ink-soft">The ID photo and selfie are in the documents below. Approving both (or Verify above) lists the supplier to shops.</p>
      </section>

      <PeggyCallNotes userId={supplier.userId} />

      <AdminDocumentViewer
        role="supplier"
        entityId={supplier.id}
        docs={docs}
        verificationStatus={supplier.verificationStatus}
        trustScore={supplier.trustScore ?? 0}
      />
    </AppPage>
  );
}
