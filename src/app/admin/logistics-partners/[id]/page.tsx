import { notFound } from "next/navigation";
import { updateLogisticsVerification } from "@/app/actions/admin";
import { AppPage, Pill, PillLink, StatTile, Thumb } from "@/components/app-kit";
import { DecisionButtons, VerificationPill, adminFrame, formatDate, formatMoney } from "@/components/admin/AdminKit";
import { AdminDocumentViewer } from "@/components/verification/AdminDocumentViewer";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { parseVerificationDocs } from "@/lib/verification-utils";
import { connectionsForPartner, rateCardsForPartner, statsForPartners } from "@/lib/delivery-market/manage.server";
import { adminIssueRows } from "../../delivery-issues/issues.server";
import { IssueList } from "../../delivery-issues/IssueList";
import { MarketplacePanel } from "./MarketplacePanel";

export default async function AdminLogisticsDetailPage(props: { params: Promise<{ id: string }>; searchParams?: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");

  const { id } = await props.params;
  const notice = (await props.searchParams) ?? {};

  const partner = await db.logisticsPartner.findUnique({
    where: { id },
    select: {
      userId: true,
      id: true,
      displayName: true,
      companyName: true,
      slug: true,
      country: true,
      city: true,
      logoUrl: true,
      verificationStatus: true,
      status: true,
      reliabilityScore: true,
      verificationDocuments: true,
      basePrice: true,
      payInCredit: true,
      codPaused: true,
      payInOverdueSince: true,
      payInOverdueAmount: true,
      payInEscalatedAt: true,
      payInReviewAt: true,
      payInPauseWaived: true,
      payInStrikes: true,
      address: true,
      cacNumber: true,
      contactName: true,
      contactPhone: true,
      contactEmail: true,
      services: true,
      pickupAreas: true,
      deliveryAreas: true,
      offersPayOnDelivery: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!partner) notFound();

  const docs = parseVerificationDocs(partner.verificationDocuments);


  // Logistics marketplace: rate cards, pickup points, connected businesses, in-app stats and customers' problems.
  const [rateCards, pickupPoints, connections, privateCards, stats, openIssues] = await Promise.all([
    rateCardsForPartner(partner.id),
    db.logisticsPickupPoint.findMany({
      where: { logisticsPartnerId: partner.id, active: true },
      orderBy: [{ state: "asc" }, { name: "asc" }],
      select: { id: true, name: true, address: true, state: true, area: true, hours: true, phone: true },
    }),
    connectionsForPartner(partner.id),
    db.logisticsRateCard.groupBy({ by: ["status"], where: { logisticsPartnerId: partner.id, ownerUserId: { not: null }, status: { in: ["proposed", "accepted"] } }, _count: { _all: true } }),
    statsForPartners([partner.id]).then((map) => map.get(partner.id) ?? { completed: 0, onTimeRate: null, failedRate: null }),
    adminIssueRows({ logisticsPartnerId: partner.id, status: "open" }, 20),
  ]);
  const privateCount = (status: string) => privateCards.find((row) => row.status === status)?._count._all ?? 0;
  const backHere = `/admin/logistics-partners/${partner.id}`;

  return (
    <AppPage
      frame={adminFrame(user, "Search logistics partners")}
      title={
        <span className="flex min-w-0 items-center gap-3">
          <Thumb src={partner.logoUrl} label={partner.displayName} size={48} />
          <span className="min-w-0 break-words">{partner.displayName}</span>
        </span>
      }
      sub={`${partner.companyName} · /${partner.slug} · ${partner.city}, ${partner.country}`}
      actions={
        <>
          <PillLink href="/admin/logistics-partners" icon="arrowLeft">All partners</PillLink>
          <PillLink href={`/admin/support/new?to=user:${partner.userId}`} icon="chat">Message</PillLink>
          {partner.verificationStatus !== "verified" && (
            <DecisionButtons
              action={updateLogisticsVerification}
              followUp
              fields={{ logisticsPartnerId: partner.id, reliabilityScore: String(partner.reliabilityScore ?? 0), redirectTo: `/admin/logistics-partners/${partner.id}` }}
              approve="verified"
              reject="rejected"
              subject={partner.displayName}
            />
          )}
        </>
      }
    >
      <section aria-label="Partner summary" className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <StatTile tone="card" label="Verification" value={<VerificationPill status={partner.verificationStatus} />} />
        <StatTile tone="card" label="Account" value={<Pill tone={partner.status === "active" ? (partner.codPaused ? "warning" : "success") : partner.status === "paused" ? "warning" : "danger"} dot>{partner.status === "active" ? (partner.codPaused ? "Active · prepaid only" : "Active") : partner.status === "paused" ? "Paused by partner" : partner.status}</Pill>} />
        <StatTile tone="card" label="Reliability score" value={`${partner.reliabilityScore ?? 0}/100`} />
        <StatTile tone="card" label="Base price" value={partner.basePrice ? formatMoney(partner.basePrice) : "-"} />
        <StatTile tone="card" label="Documents" value={docs.length} />
        <StatTile tone="card" label="Joined" value={<span className="text-[20px]">{formatDate(partner.createdAt)}</span>} />
      </section>

      {(notice.saved || notice.error) && (
        <p role="status" className={`mb-4 rounded-[14px] px-4 py-3 text-[14.5px] font-bold ${notice.error ? "bg-app-danger-tint text-app-danger" : "bg-app-success-tint text-app-success"}`}>
          {notice.error ?? notice.saved}
        </p>
      )}

      <AdminDocumentViewer
        role="logistics_partner"
        entityId={partner.id}
        docs={docs}
        verificationStatus={partner.verificationStatus}
        trustScore={partner.reliabilityScore ?? 0}
      />

      <MarketplacePanel
        partner={partner}
        rateCard={rateCards.publicCard ? { rows: rateCards.publicCard.rows, failedAttemptFee: rateCards.publicCard.failedAttemptFee, returnFee: rateCards.publicCard.returnFee, notes: rateCards.publicCard.notes, createdAt: rateCards.publicCard.createdAt } : null}
        retiredCount={rateCards.retiredCount}
        pickupPoints={pickupPoints}
        connections={connections.map((row) => ({ id: row.id, businessName: row.businessName, role: row.ownerRole, since: row.createdAt, services: row.services, pod: row.ownerPod && row.partnerPod, privateCards: row.privateCards.length }))}
        privateCards={{ proposed: privateCount("proposed"), accepted: privateCount("accepted") }}
        stats={stats}
      />

      <section id="issues" aria-labelledby="issues-title" className="mt-6 scroll-mt-6">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="issues-title" className="m-0 text-[20px] font-extrabold">Open delivery problems</h2>
          <PillLink href={`/admin/delivery-issues?partner=${partner.id}`} size="sm">All problems for this partner</PillLink>
        </div>
        {openIssues.length ? (
          <IssueList rows={openIssues} returnTo={backHere} showPartner={false} />
        ) : (
          <p className="m-0 rounded-[18px] border border-app-line bg-white px-4 py-3.5 text-[14px] text-app-ink-soft">No open problems from customers.</p>
        )}
      </section>

      {/* Cash from pay-on-delivery jobs is paid straight to sellers by the partner, and late partners are paused
          and resumed automatically (src/lib/logistics/payin-standing.server.ts): nothing for the team to manage. */}
      {partner.codPaused && (
        <p className="mt-6 rounded-[18px] border border-app-line bg-white px-4 py-3.5 text-[14px] text-app-ink-soft">
          Paused from pay-on-delivery jobs for cash paid late. It switches back on by itself once they pay the sellers.
        </p>
      )}

    </AppPage>
  );
}
