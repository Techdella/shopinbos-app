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
  type IdType,
  type ItemState,
  type PartnerState,
  FACE_MATCH_MIN_CONFIDENCE,
  readFlowAnswers,
  vehiclesState,
} from "@shared/partner-tiers";
import { checkGraduation, partnerTierSnapshot } from "@/lib/logistics/partner-tiers.server";
import { TierActionButton } from "./TierActionButton";

// Admin › Logistics partners › one partner: the tiered verification (shared/partner-tiers.ts). Every Tier 1 and
// Tier 2 item with its status and what was checked, the files to open, and a decision per item. Each decision
// goes through an /api/admin/logistics-partners/[id]/… route that re-computes the tier (refreshPartnerTier).

export const STATE_LABELS: Record<PartnerState, string> = {
  unverified: "Unverified",
  pending_review: "Pending review",
  tier1_verified: "Verified Individual (ID checks)",
  tier2_verified: "Registered Business (CAC)",
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
  phone: "Phone (code)",
  idDocument: "ID photo",
  selfie: "Selfie (face match)",
  coverage: "Coverage areas",
  methods: "Delivers with",
  base: "Base",
  payout: "Bank account",
  vehicles: "Vehicles",
  businessName: "Business name",
  cacType: "CAC registration type",
  cacNumber: "CAC number",
  cacCertificate: "CAC certificate",
};

const ID_TYPE_WORDS: Record<IdType, string> = { nin_slip: "NIN slip", drivers_licence: "Driver's licence", voters_card: "Voter's card", passport: "International passport" };

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
  const [extra, vehicles] = await Promise.all([
    db.logisticsPartner.findUnique({
      where: { id: partnerId },
      select: { verificationStatus: true, verificationTier: true, kycSubmittedAt: true, statusReason: true, termsAcceptedAt: true, businessAddress: true, badges: true, limitsLiftedAt: true, onboardingState: true, basePrice: true, services: true },
    }),
    db.logisticsVehicle.findMany({ where: { logisticsPartnerId: partnerId }, orderBy: { createdAt: "asc" } }),
  ]);
  if (!extra) return null;
  const { progress, rules, limited } = await checkGraduation({ id: partnerId, verificationTier: extra.verificationTier, limitsLiftedAt: extra.limitsLiftedAt });

  const t1 = tier1Checklist(snapshot);
  const t2 = tier2Checklist(snapshot);
  const id = snapshot.identity;
  const docs = normalizeVerificationDocs(found.row.verificationDocuments);
  const selfie = latestDoc(docs, "selfie");
  const idPhoto = latestDoc(docs, "identity");
  const basePhoto = latestDoc(docs, "base-photo");
  const utility = latestDoc(docs, "utility");
  const answers = readFlowAnswers(extra.onboardingState);
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
            <CardHead title="Verified Individual (ID checks)" sub="All approved and sent → the partner can take jobs, within the safety limits." className="px-4 pt-4 sm:px-5" />
            <ul className="m-0 mt-3 list-none divide-y divide-app-line border-t border-app-line p-0">
              <Row item="terms" state={t1.terms}>{snapshot.termsVersion ? `Version ${snapshot.termsVersion}${snapshot.termsVersion !== PARTNER_TERMS_VERSION ? " (old)" : ""}${extra.termsAcceptedAt ? ` · ${formatDate(extra.termsAcceptedAt)}` : ""}` : "Not accepted"}</Row>
              <Row item="phone" state={t1.phone}>{id.phone ? `${id.phone.value}${id.phone.verifiedAt ? ` · code checked ${formatDate(id.phone.verifiedAt)}` : ""}` : "-"}</Row>
              <Row
                item="idDocument"
                state={t1.idDocument}
                actions={(
                  <>
                    <DocDecision partnerId={partnerId} doc={idPhoto} />
                    {id.nin && id.nin.status !== "approved" && <TierActionButton url={`${base}/identity`} body={{ check: "nin", action: "approve" }} label="Approve NIN" confirm="Approve this NIN? Only if you checked it matches their name." />}
                    {id.nin && id.nin.status !== "rejected" && <TierActionButton url={`${base}/identity`} body={{ check: "nin", action: "reject" }} label="Reject NIN" tone="danger" reason={reject("NIN")} />}
                  </>
                )}
              >
                {id.idDocument ? ID_TYPE_WORDS[id.idDocument.type] : idPhoto ? "ID" : "No ID photo"}
                {idPhoto && docHasFile(idPhoto) ? <> · <FileLink path={idPhoto.filePath}>Open ID photo</FileLink> ({idPhoto.status})</> : null}
                {id.fullName ? <span className="block">Name: {id.fullName}</span> : null}
                {id.nin ? (
                  <span className="block">
                    NIN •••••••{id.nin.last4} ({id.nin.status})
                    {id.nin.nameOnRecord ? ` · on record: ${id.nin.nameOnRecord}` : ""}
                    {id.nin.provider ? ` · checked by ${id.nin.provider}` : " · no provider: check the NIN slip photo"}
                    {id.nin.checkedAt ? ` · ${formatDate(id.nin.checkedAt)}` : ""}
                    {id.nin.rejectionReason && <span className="block text-app-danger">Rejected: {id.nin.rejectionReason}</span>}
                  </span>
                ) : idPhoto ? <span className="block">No ID lookup: check the photo is a real, readable ID and the face matches the selfie.</span> : null}
                {idPhoto?.rejectionReason && <span className="block text-app-danger">Rejected: {idPhoto.rejectionReason}</span>}
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
                <span className="block">Check it's a live photo of the same face as the ID photo{id.nin ? " and the NIN record" : ""}.</span>
              </Row>
              <Row item="coverage" state={t1.coverage}>
                {snapshot.deliveryAreas.join(", ") || "-"}
                <span className="block">Other states: {extra.services.includes("interstate") ? "yes" : answers.interstate === false ? "no" : "not answered"}</span>
                <span className="block">Charges: {answers.charge === "quote" ? "quotes per order in chat" : extra.basePrice > 0 ? `${formatMoney(extra.basePrice)} per delivery` : "not answered"}</span>
              </Row>
              <Row item="methods" state={t1.methods}>{snapshot.deliveryMethods.join(", ") || "-"}</Row>
              <Row item="base" state={t1.base} actions={<DocDecision partnerId={partnerId} doc={basePhoto} />}>
                {id.base ? `${id.base.address}${id.base.state ? `, ${id.base.state}` : ""}` : id.address ? `${id.address.value}${id.address.state ? `, ${id.address.state}` : ""} (home address, older sign-up)` : "-"}
                {id.base?.lat !== undefined && id.base.lng !== undefined ? (
                  <span className="block">
                    <a href={`https://www.google.com/maps?q=${id.base.lat},${id.base.lng}`} target="_blank" rel="noreferrer" className="font-bold text-app-accent-ink underline">Open the pin on a map</a>
                  </span>
                ) : id.base ? <span className="block">Typed, no location shared.</span> : null}
                {basePhoto && docHasFile(basePhoto) ? <span className="block"><FileLink path={basePhoto.filePath}>Photo of the base</FileLink> ({basePhoto.status}). Approving it with the address earns Address Verified.</span> : id.base ? <span className="block">No photo of the base (optional).</span> : null}
                {utility && docHasFile(utility) && <span className="block"><FileLink path={utility.filePath}>Utility bill</FileLink> ({utility.status})</span>}
                {utility && docHasFile(utility) && <span className="block"><DocDecision partnerId={partnerId} doc={utility} /></span>}
              </Row>
            </ul>
          </Card>

          <Card className="overflow-hidden">
            <CardHead title="Registered Business (CAC)" sub="ID checks plus CAC → no safety limits, Registered Business badge." className="px-4 pt-4 sm:px-5" />
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
            <CardHead title="Optional" sub="Not needed to take jobs. A bank account checked by name shows Payout ready (asked at the first withdrawal)." className="px-4 pt-4 sm:px-5" />
            <ul className="m-0 mt-3 list-none divide-y divide-app-line border-t border-app-line p-0">
              <Row item="Licensed Courier (NIPOST)" state={snapshot.docs["courier-licence"] ?? "missing"} actions={<DocDecision partnerId={partnerId} doc={courier} />}>
                {courier && docHasFile(courier) ? <FileLink path={courier.filePath}>Open licence</FileLink> : "Not uploaded (never required)"}
              </Row>
              <Row
                item="payout"
                state={id.payout?.status ?? (snapshot.payoutAccount?.verified ? "approved" : "missing")}
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
              <Row item="vehicles" state={vehiclesState(vehicles)}>
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
              <Row item="Verified Payout" state={extra.badges.includes("verified_payout") ? "approved" : "missing"}>
                {snapshot.payoutAccount ? `Payout account: ${snapshot.payoutAccount.accountName} (${snapshot.payoutAccount.verified ? "verified" : "not verified"}). Needs a Registered Business and the account in the registered business name.` : "No payout account yet."}
              </Row>
            </ul>
          </Card>
        </div>

        <Card className="content-start p-5">
          <CardHead title="Safety limits" sub={extra.verificationTier === "tier1" ? undefined : "Safety limits only apply to Verified Individuals (no CAC)."} />
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
                <TierActionButton url={`${base}/limits`} body={{ action: "lift" }} label="Lift limits now" confirm="Lift this partner's safety limits for good?" />
              ) : (
                <TierActionButton url={`${base}/limits`} body={{ action: "restore" }} label="Restore limits" tone="white" confirm="Put the safety limits back? They lift again on their own at the thresholds." />
              )}
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}
