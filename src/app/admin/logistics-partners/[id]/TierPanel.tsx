import type { ReactNode } from "react";
import { Card, CardHead, Pill, type Tone } from "@/components/app-kit";
import { formatDate, formatMoney } from "@/components/admin/AdminKit";
import { db } from "@/lib/db/client";
import { verificationFileHref } from "@/lib/security/private-files";
import { normalizeVerificationDocs, docHasFile, type VerificationDoc } from "@shared/verification-docs";
import {
  BADGE_LABELS,
  PARTNER_TERMS_VERSION,
  isPartnerBadge,
  partnerVerificationState,
  tier1Checklist,
  tier2Checklist,
  type ItemState,
  type PartnerState,
  FACE_MATCH_MIN_CONFIDENCE,
} from "@shared/partner-tiers";
import { checkGraduation, partnerTierSnapshot } from "@/lib/logistics/partner-tiers.server";
import { TierActionButton } from "./TierActionButton";

// Admin › Logistics partners › one partner: the tiered verification (shared/partner-tiers.ts). Every Tier 1 and
// Tier 2 item with its status and what was checked, the files to open, and a decision per item. Each decision
// goes through an /api/admin/logistics-partners/[id]/… route that re-computes the tier (refreshPartnerTier).

export const STATE_LABELS: Record<PartnerState, string> = {
  unverified: "Unverified",
  pending_review: "Pending review",
  tier1_verified: "Tier 1 · Verified Individual",
  tier2_verified: "Tier 2 · Registered Business",
  rejected: "Rejected",
  suspended: "Suspended",
};

export const STATE_TONES: Record<PartnerState, Tone> = {
  unverified: "muted",
  pending_review: "warning",
  tier1_verified: "success",
  tier2_verified: "success",
  rejected: "danger",
  suspended: "danger",
};

const ITEM_LABELS: Record<string, string> = {
  terms: "Partner terms",
  fullName: "Full name",
  phone: "Phone (code)",
  email: "Email",
  nin: "NIN",
  selfie: "Selfie (face match)",
  payout: "Bank account",
  address: "Address",
  coverage: "Coverage areas",
  methods: "Delivery methods",
  vehicles: "Vehicles",
  guarantor: "Guarantor",
  businessName: "Business name",
  cacType: "CAC registration type",
  cacNumber: "CAC number",
  cacCertificate: "CAC certificate",
};

const ITEM_TONE: Record<ItemState, Tone> = { approved: "success", pending: "warning", rejected: "danger", missing: "muted" };
const ITEM_WORD: Record<ItemState, string> = { approved: "Approved", pending: "Pending", rejected: "Rejected", missing: "Missing" };

function FileLink({ path, children }: { path: string | null | undefined; children: ReactNode }) {
  if (!path) return null;
  return <a href={verificationFileHref(path)} target="_blank" rel="noreferrer" className="font-bold text-app-accent-ink underline">{children}</a>;
}

function latestDoc(docs: VerificationDoc[], type: string) {
  return docs.filter((doc) => doc.type === type && docHasFile(doc)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? docs.find((doc) => doc.type === type);
}

/** Approve / reject buttons for a document, through the existing documents route. */
function DocDecision({ partnerId, doc }: { partnerId: string; doc: VerificationDoc | undefined }) {
  if (!doc || !docHasFile(doc)) return null;
  const url = `/api/admin/logistics-partners/${partnerId}/documents`;
  return (
    <span className="flex flex-wrap gap-2">
      {doc.status !== "approved" && <TierActionButton url={url} body={{ docId: doc.id, action: "approve" }} label="Approve" />}
      {doc.status !== "rejected" && <TierActionButton url={url} body={{ docId: doc.id, action: "reject" }} label="Reject" tone="danger" reason={{ title: `Reject the ${doc.label.toLowerCase()}?`, key: "rejectionReason" }} />}
    </span>
  );
}

function Row({ item, state, children, actions }: { item: string; state: ItemState; children?: ReactNode; actions?: ReactNode }) {
  return (
    <li className="grid gap-2 px-4 py-3 sm:grid-cols-[200px_minmax(0,1fr)_auto] sm:items-start sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-extrabold">{ITEM_LABELS[item] ?? item}</span>
        <Pill tone={ITEM_TONE[state]}>{ITEM_WORD[state]}</Pill>
      </div>
      <div className="min-w-0 break-words text-[13.5px] text-app-ink-soft">{children}</div>
      {actions && <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div>}
    </li>
  );
}

export async function TierPanel({ partnerId }: { partnerId: string }) {
  const found = await partnerTierSnapshot(partnerId);
  if (!found) return null;
  const { snapshot } = found;
  const [extra, vehicles, guarantor] = await Promise.all([
    db.logisticsPartner.findUnique({
      where: { id: partnerId },
      select: { verificationStatus: true, verificationTier: true, kycSubmittedAt: true, statusReason: true, termsAcceptedAt: true, businessAddress: true, badges: true, limitsLiftedAt: true },
    }),
    db.logisticsVehicle.findMany({ where: { logisticsPartnerId: partnerId }, orderBy: { createdAt: "asc" } }),
    db.logisticsGuarantor.findUnique({ where: { logisticsPartnerId: partnerId } }),
  ]);
  if (!extra) return null;
  const { progress, rules, limited } = await checkGraduation({ id: partnerId, verificationTier: extra.verificationTier, limitsLiftedAt: extra.limitsLiftedAt });

  const t1 = tier1Checklist(snapshot);
  const t2 = tier2Checklist(snapshot);
  const id = snapshot.identity;
  const docs = normalizeVerificationDocs(found.row.verificationDocuments);
  const selfie = latestDoc(docs, "selfie");
  const utility = latestDoc(docs, "utility");
  const cac = latestDoc(docs, "cac");
  const courier = latestDoc(docs, "courier-licence");
  const state = partnerVerificationState(extra);
  const base = `/api/admin/logistics-partners/${partnerId}`;
  const reject = (what: string) => ({ title: `Reject the ${what}?` });

  return (
    <section id="tiers" aria-labelledby="tiers-title" className="mb-6 scroll-mt-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id="tiers-title" className="m-0 mr-1 text-[20px] font-extrabold">Tier verification</h2>
        <Pill tone={STATE_TONES[state]} dot>{STATE_LABELS[state]}</Pill>
        {extra.badges.filter(isPartnerBadge).map((badge) => <Pill key={badge} tone="info">{BADGE_LABELS[badge]}</Pill>)}
        {extra.kycSubmittedAt && <span className="text-[13px] text-app-ink-soft">Sent {formatDate(extra.kycSubmittedAt)}</span>}
      </div>
      {extra.statusReason && (state === "rejected" || state === "suspended") && (
        <p className="mb-3 rounded-[14px] bg-app-danger-tint px-4 py-3 text-[14px] font-bold text-app-danger">Reason given: {extra.statusReason}</p>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 content-start gap-4">
          <Card className="overflow-hidden">
            <CardHead title="Tier 1 · Verified Individual" sub="All approved and sent → the partner can take jobs, with limits." className="px-4 pt-4 sm:px-5" />
            <ul className="m-0 mt-3 list-none divide-y divide-app-line border-t border-app-line p-0">
              <Row item="terms" state={t1.terms}>{snapshot.termsVersion ? `Version ${snapshot.termsVersion}${snapshot.termsVersion !== PARTNER_TERMS_VERSION ? " (old)" : ""}${extra.termsAcceptedAt ? ` · ${formatDate(extra.termsAcceptedAt)}` : ""}` : "Not accepted"}</Row>
              <Row item="fullName" state={t1.fullName}>{id.fullName ?? "-"}</Row>
              <Row item="phone" state={t1.phone}>{id.phone ? `${id.phone.value}${id.phone.verifiedAt ? ` · code checked ${formatDate(id.phone.verifiedAt)}` : ""}` : "-"}</Row>
              <Row item="email" state={t1.email}>{id.email ? `${id.email.value}${id.email.verifiedAt ? ` · confirmed ${formatDate(id.email.verifiedAt)}` : ""}` : "-"}</Row>
              <Row
                item="nin"
                state={t1.nin}
                actions={id.nin && (
                  <>
                    {id.nin.status !== "approved" && <TierActionButton url={`${base}/identity`} body={{ check: "nin", action: "approve" }} label="Approve" confirm="Approve this NIN? Only if you checked it matches their name." />}
                    {id.nin.status !== "rejected" && <TierActionButton url={`${base}/identity`} body={{ check: "nin", action: "reject" }} label="Reject" tone="danger" reason={reject("NIN")} />}
                  </>
                )}
              >
                {id.nin ? (
                  <>
                    NIN •••••••{id.nin.last4}
                    {id.nin.nameOnRecord ? ` · on record: ${id.nin.nameOnRecord}` : ""}
                    {id.nin.provider ? ` · checked by ${id.nin.provider}` : " · no provider (check the NIN slip in Documents)"}
                    {id.nin.checkedAt ? ` · ${formatDate(id.nin.checkedAt)}` : ""}
                    {id.nin.rejectionReason && <span className="block text-app-danger">Rejected: {id.nin.rejectionReason}</span>}
                  </>
                ) : "-"}
              </Row>
              <Row item="selfie" state={t1.selfie} actions={<DocDecision partnerId={partnerId} doc={selfie} />}>
                {selfie && docHasFile(selfie) ? <FileLink path={selfie.filePath}>Open selfie</FileLink> : "-"}
                {selfie?.faceMatch ? (
                  <span className="block">
                    Korapay face match with the NIN photo: {selfie.faceMatch.match === null ? "no result" : selfie.faceMatch.match ? "match" : "no match"}
                    {selfie.faceMatch.confidence !== null ? ` (${selfie.faceMatch.confidence}% confidence; auto-approved from ${FACE_MATCH_MIN_CONFIDENCE}%)` : ""}
                  </span>
                ) : selfie ? (
                  <span className="block">No face match result: compare the selfie with the person yourself.</span>
                ) : null}
                {selfie?.liveness ? <span className="block">Liveness passed in the browser · Korapay reference {selfie.liveness.reference}</span> : selfie ? <span className="block">No liveness check was run for this selfie.</span> : null}
                {selfie?.rejectionReason && <span className="block text-app-danger">Rejected: {selfie.rejectionReason}</span>}
                <span className="block">Check it's a live photo of the same face as the NIN record.</span>
              </Row>
              <Row
                item="payout"
                state={t1.payout}
                actions={id.payout && (
                  <>
                    {id.payout.status !== "approved" && <TierActionButton url={`${base}/identity`} body={{ check: "payout", action: "approve" }} label="Approve" confirm="Approve this payout check?" />}
                    {id.payout.status !== "rejected" && <TierActionButton url={`${base}/identity`} body={{ check: "payout", action: "reject" }} label="Reject" tone="danger" reason={reject("BVN or bank check")} />}
                  </>
                )}
              >
                {id.payout ? (
                  <>
                    {id.payout.method === "bvn" ? `BVN •••••••${id.payout.last4}` : `${id.payout.bankName ?? "Bank"} ••••${id.payout.last4}`}
                    {id.payout.accountName ? ` · ${id.payout.accountName}` : ""}
                    {` · name ${id.payout.nameMatched ? "matches" : "doesn't match"} the NIN`}
                    {id.payout.rejectionReason && <span className="block text-app-danger">Rejected: {id.payout.rejectionReason}</span>}
                  </>
                ) : "-"}
              </Row>
              <Row item="address" state={t1.address} actions={<DocDecision partnerId={partnerId} doc={utility} />}>
                {id.address ? `${id.address.value}${id.address.state ? `, ${id.address.state}` : ""}` : "-"}
                {utility && docHasFile(utility) && <span className="block"><FileLink path={utility.filePath}>Utility bill</FileLink> ({utility.status})</span>}
              </Row>
              <Row item="coverage" state={t1.coverage}>{snapshot.deliveryAreas.join(", ") || "-"}</Row>
              <Row item="methods" state={t1.methods}>{snapshot.deliveryMethods.join(", ") || "-"}</Row>
              <Row item="vehicles" state={t1.vehicles}>
                {vehicles.length ? (
                  <ul className="m-0 grid list-none gap-2 p-0">
                    {vehicles.map((vehicle) => (
                      <li key={vehicle.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[14px] bg-app-canvas px-3 py-2 text-app-ink">
                        <span className="font-bold capitalize">{vehicle.type}</span>
                        <span className="font-mono text-[13px]">{vehicle.plateNumber}</span>
                        <Pill tone={vehicle.status === "approved" ? "success" : vehicle.status === "rejected" ? "danger" : "warning"}>{vehicle.status}</Pill>
                        <FileLink path={vehicle.photoPath}>Photo</FileLink>
                        <FileLink path={vehicle.licencePath}>Licence</FileLink>
                        {vehicle.rejectionReason && <span className="w-full text-[13px] text-app-danger">Rejected: {vehicle.rejectionReason}</span>}
                        <span className="ml-auto flex flex-wrap gap-2">
                          {vehicle.status !== "approved" && <TierActionButton url={`${base}/vehicles`} body={{ vehicleId: vehicle.id, action: "approve" }} label="Approve" />}
                          {vehicle.status !== "rejected" && <TierActionButton url={`${base}/vehicles`} body={{ vehicleId: vehicle.id, action: "reject" }} label="Reject" tone="danger" reason={reject("vehicle")} />}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : "No vehicles added"}
              </Row>
              <Row
                item="guarantor"
                state={t1.guarantor}
                actions={guarantor && (
                  <>
                    {guarantor.status !== "confirmed" && <TierActionButton url={`${base}/guarantor`} body={{ action: "confirm" }} label="Confirmed by call" confirm={`Did ${guarantor.fullName} confirm on the phone that they guarantee this partner?`} />}
                    {guarantor.status !== "declined" && <TierActionButton url={`${base}/guarantor`} body={{ action: "decline" }} label="Declined" tone="danger" confirm={`Mark ${guarantor.fullName} as declined?`} />}
                    {guarantor.status !== "pending" && <TierActionButton url={`${base}/guarantor`} body={{ action: "reset" }} label="Reset" tone="white" confirm="Put the guarantor back to waiting? The partner can send the code again." />}
                  </>
                )}
              >
                {guarantor ? (
                  <>
                    {guarantor.fullName} · {guarantor.relationship} · {guarantor.phone}
                    <span className="block">{guarantor.address}</span>
                    {guarantor.respondedAt && <span className="block">{guarantor.status} {guarantor.respondedVia === "call" ? "by call" : "with the texted code"} · {formatDate(guarantor.respondedAt)}</span>}
                  </>
                ) : "No guarantor added"}
              </Row>
            </ul>
          </Card>

          <Card className="overflow-hidden">
            <CardHead title="Tier 2 · Registered Business" sub="Tier 1 plus CAC → no limits, Registered Business badge." className="px-4 pt-4 sm:px-5" />
            <ul className="m-0 mt-3 list-none divide-y divide-app-line border-t border-app-line p-0">
              <Row item="businessName" state={t2.businessName}>{snapshot.registeredName ?? "-"}{extra.businessAddress ? <span className="block">{extra.businessAddress}</span> : null}</Row>
              <Row item="cacType" state={t2.cacType}>{snapshot.cacType === "BN" ? "Business Name (BN)" : snapshot.cacType === "RC" ? "Company (RC)" : "-"}</Row>
              <Row item="cacNumber" state={t2.cacNumber}>{snapshot.cacNumber ?? "-"}</Row>
              <Row item="cacCertificate" state={t2.cacCertificate} actions={<DocDecision partnerId={partnerId} doc={cac} />}>
                {snapshot.cacRegistryVerified ? "Matched on the CAC registry. " : ""}
                {cac && docHasFile(cac) ? <FileLink path={cac.filePath}>Open certificate</FileLink> : snapshot.cacRegistryVerified ? null : "-"}
                {cac?.registry && <span className="block">Registry: {cac.registry.registeredName} ({cac.registry.registryStatus}) · name {cac.registry.nameMatched ? "matches" : "differs"} · owner {cac.registry.ownerMatched ? "listed" : "not listed"}</span>}
                {cac?.rejectionReason && <span className="block text-app-danger">Rejected: {cac.rejectionReason}</span>}
              </Row>
            </ul>
          </Card>

          <Card className="overflow-hidden">
            <CardHead title="Optional badges" className="px-4 pt-4 sm:px-5" />
            <ul className="m-0 mt-3 list-none divide-y divide-app-line border-t border-app-line p-0">
              <Row item="Licensed Courier (NIPOST)" state={snapshot.docs["courier-licence"] ?? "missing"} actions={<DocDecision partnerId={partnerId} doc={courier} />}>
                {courier && docHasFile(courier) ? <FileLink path={courier.filePath}>Open licence</FileLink> : "Not uploaded (never required)"}
              </Row>
              <Row item="Verified Payout" state={extra.badges.includes("verified_payout") ? "approved" : "missing"}>
                {snapshot.payoutAccount ? `Payout account: ${snapshot.payoutAccount.accountName} (${snapshot.payoutAccount.verified ? "verified" : "not verified"}). Needs Tier 2 and the account in the registered business name.` : "No payout account yet."}
              </Row>
            </ul>
          </Card>
        </div>

        <Card className="content-start p-5">
          <CardHead title="Limits and graduation" sub={extra.verificationTier === "tier1" ? undefined : "Limits only apply to Tier 1."} />
          <dl className="m-0 mt-3 grid gap-2 text-[14px]">
            <div className="flex justify-between gap-3"><dt className="text-app-ink-soft">Limits</dt><dd className="m-0 font-bold">{limited ? "On" : extra.limitsLiftedAt ? `Lifted ${formatDate(extra.limitsLiftedAt)}` : "None"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-app-ink-soft">Max order value</dt><dd className="m-0 font-bold">{formatMoney(rules.maxOrderValue)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-app-ink-soft">Max open jobs</dt><dd className="m-0 font-bold">{rules.maxActiveOrders}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-app-ink-soft">Deliveries</dt><dd className="m-0 font-bold">{progress.deliveries.have} / {progress.deliveries.need}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-app-ink-soft">Rating</dt><dd className="m-0 font-bold">{progress.rating.have.toFixed(1)} (needs {progress.rating.need.toFixed(1)})</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-app-ink-soft">Disputes / failed</dt><dd className="m-0 font-bold">{progress.disputeRate.have}% (max {progress.disputeRate.max}%)</dd></div>
          </dl>
          {extra.verificationTier === "tier1" && (
            <div className="mt-4 flex flex-wrap gap-2">
              {limited ? (
                <TierActionButton url={`${base}/limits`} body={{ action: "lift" }} label="Lift limits now" confirm="Lift this partner's Tier 1 limits for good?" />
              ) : (
                <TierActionButton url={`${base}/limits`} body={{ action: "restore" }} label="Restore limits" tone="white" confirm="Put the Tier 1 limits back? They lift again on their own at the graduation thresholds." />
              )}
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}
