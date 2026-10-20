import { notFound } from "next/navigation";
import { updateLogisticsVerification } from "@/app/actions/admin";
import { AppPage, Pill, PillLink, StatTile, Thumb } from "@/components/app-kit";
import { DecisionButtons, VerificationPill, adminFrame, formatDate, formatMoney } from "@/components/admin/AdminKit";
import { AdminDocumentViewer } from "@/components/verification/AdminDocumentViewer";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { parseVerificationDocs } from "@/lib/verification-utils";
import { PartnerPayInsPanel } from "../PayInsPanels";
import { PartnerLatePayInPanel } from "../LatePayInsPanels";
import { ridersHolding } from "@/lib/logistics/payin-standing.server";

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
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!partner) notFound();

  const docs = parseVerificationDocs(partner.verificationDocuments);

  const [payInAccount, payIns, remittances, lateEvents, riders] = await Promise.all([
    db.partnerPayInAccount.findUnique({
      where: { logisticsPartnerId: partner.id },
      select: { status: true, accountNumber: true, accountName: true, bankName: true, customerCode: true, lastError: true, updatedAt: true },
    }),
    db.partnerPayIn.findMany({
      where: { logisticsPartnerId: partner.id },
      orderBy: { paidAt: "desc" },
      take: 15,
      select: { id: true, amount: true, reference: true, senderName: true, paidAt: true, matchedBy: true },
    }),
    // Pay-ins the partner told us about (form or their software), not transfers to their account.
    db.codRemittance.findMany({
      where: { logisticsPartnerId: partner.id, method: { not: "account" } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, amount: true, method: true, createdAt: true, outcome: true, _count: { select: { bookings: true } } },
    }),
    db.partnerPayInEvent.findMany({
      where: { logisticsPartnerId: partner.id, kind: { not: "recheck" } },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, kind: true, amount: true, deadline: true, note: true, createdAt: true },
    }),
    ridersHolding(partner.id),
  ]);

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
        <StatTile tone="card" label="Account" value={<Pill tone={partner.status === "active" ? (partner.codPaused ? "warning" : "success") : "danger"} dot>{partner.status === "active" ? (partner.codPaused ? "Active · prepaid only" : "Active") : partner.status}</Pill>} />
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

      <PartnerPayInsPanel
        partnerId={partner.id}
        account={payInAccount}
        credit={partner.payInCredit}
        payIns={payIns}
        remittances={remittances.map(({ _count, ...row }) => ({ ...row, jobs: _count.bookings }))}
      />

      <PartnerLatePayInPanel partner={partner} riders={riders} events={lateEvents} now={new Date()} />

    </AppPage>
  );
}
