import Link from "next/link";
import { AppPage, Card, EmptyState, Pill, type Tone } from "@/components/app-kit";
import { adminFrame, formatDate, withParams } from "@/components/admin/AdminKit";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { maskAccountNumber } from "@/lib/wallet/rules";
import { businessRegistrationStatus, type BusinessRegistrationStatus } from "@/lib/wallet/wallet.server";
import { WalletActions } from "./WalletActions";
import { youverifyHealth } from "@/lib/youverify";
import { korapayIdentityHealth, korapayIdentityReady } from "@/lib/korapay";
import { adminRoleOf } from "@/lib/admin-team/service.server";
import { canUseSection } from "@/lib/admin-team/pure";
import { cacProviders } from "@/lib/kyb/verify-cac.server";

export const dynamic = "force-dynamic";

// Shopinbos Wallets: each business's check (none for sellers, CAC or BN for the others), settlement bank and Paystack subaccount. Shopinbos holds no money, so
// there are no balances here: the team approves bank accounts whose name isn't the verified owner's (e.g. a
// company account: check it belongs to them), and pauses a wallet (its Paystack subaccount is switched off and
// checkout stops splitting to it) if something looks wrong. Several wallets sharing one ID are flagged.
//
// Korapay checkout: add the wallet's checked bank as a recipient in the Korapay dashboard (Settlements → Split
// Payments; Korapay has no API for it), then paste its split account reference here. Only then can that business
// be paid through Korapay checkout.

const STATUS: Record<string, { label: string; tone: Tone }> = {
  none: { label: "Not set up", tone: "muted" },
  review: { label: "Check the account", tone: "warning" },
  active: { label: "Receiving payments", tone: "success" },
  failed: { label: "Paystack refused", tone: "danger" },
};

/** A supplier's CAC or BN registration (its wallet check). */
const REGISTRATION: Record<BusinessRegistrationStatus, { label: string; tone: Tone }> = {
  approved: { label: "CAC/BN verified", tone: "success" },
  pending: { label: "CAC/BN to review", tone: "warning" },
  rejected: { label: "CAC/BN rejected", tone: "danger" },
  missing: { label: "No CAC/BN yet", tone: "muted" },
};

const ROLE: Record<string, string> = { seller: "Seller", supplier: "Supplier", logistics_partner: "Delivery partner" };

const FILTERS = [
  { id: "", label: "All" },
  { id: "review", label: "Check the account" },
  { id: "active", label: "Receiving payments" },
  { id: "frozen", label: "Paused" },
] as const;

export default async function AdminWalletsPage({ searchParams }: { searchParams?: Promise<{ status?: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");
  const canSeeDevelopers = canUseSection(await adminRoleOf(user.id), "developers");
  const filter = (await searchParams)?.status ?? "";
  const where = filter === "frozen" ? { status: "frozen" } : filter ? { subaccountStatus: filter } : {};
  // ID and CAC checks run through Korapay Identity when its key is set, else Youverify.
  const korapay = korapayIdentityReady();
  const [wallets, counts, idChecks] = await Promise.all([
    db.wallet.findMany({
      where,
      orderBy: [{ subaccountStatus: "asc" }, { updatedAt: "desc" }],
      take: 200,
      include: { user: { select: { name: true, email: true } } },
    }),
    db.wallet.groupBy({ by: ["kycIdHash"], where: { kycIdHash: { not: null } }, _count: { _all: true } }),
    korapay ? korapayIdentityHealth() : youverifyHealth(),
  ]);
  const shared = new Set(counts.filter((row) => row._count._all > 1).map((row) => row.kycIdHash));
  // A supplier's or delivery partner's check is its business registration (CAC or BN); sellers have none.
  const businesses = wallets.filter((wallet) => wallet.role === "supplier" || wallet.role === "logistics_partner");
  const registrations = new Map(
    await Promise.all(
      businesses.map(async (wallet) => [wallet.userId, await businessRegistrationStatus(wallet.userId, wallet.role as "supplier" | "logistics_partner").catch(() => "missing" as const)] as const),
    ),
  );

  return (
    <AppPage frame={adminFrame(user)} title="Wallets" sub="Where each business's card payments are settled. Shopinbos holds no money.">
      <ChecksSummary working={idChecks.state === "ok" && cacProviders().length > 0} developer={canSeeDevelopers} />
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <Link key={option.id} href={withParams("/admin/wallets", { status: option.id || undefined })} className={`rounded-full border px-3.5 py-1.5 text-[13px] font-bold no-underline ${filter === option.id ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink"}`}>
            {option.label}
          </Link>
        ))}
      </div>
      {wallets.length ? (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-[13.5px]">
            <thead className="text-[12px] uppercase tracking-[0.06em] text-app-ink-soft">
              <tr>
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Check</th>
                <th className="px-4 py-3">Bank</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-app-line">
              {wallets.map((wallet) => {
                const status = STATUS[wallet.subaccountStatus] ?? STATUS.none!;
                const kycName = [wallet.kycFirstName, wallet.kycLastName].filter(Boolean).join(" ");
                return (
                  <tr key={wallet.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-bold">{wallet.user.name}</div>
                      <div className="text-app-ink-soft">{ROLE[wallet.role] ?? wallet.role} · {wallet.user.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      {wallet.role === "seller" ? (
                        <span className="text-app-ink-soft">None needed</span>
                      ) : (
                        <Pill tone={REGISTRATION[registrations.get(wallet.userId) ?? "missing"]!.tone}>{REGISTRATION[registrations.get(wallet.userId) ?? "missing"]!.label}</Pill>
                      )}
                      {/* An ID verified before ID checks were removed: still shown, with several wallets on one ID flagged. */}
                      {wallet.kycStatus === "verified" ? (
                        <>
                          <div className="mt-1">{kycName}</div>
                          <div className="text-app-ink-soft">{wallet.kycIdType?.toUpperCase()} …{wallet.kycIdLast4} · {formatDate(wallet.kycVerifiedAt)}</div>
                          {wallet.kycIdHash && shared.has(wallet.kycIdHash) ? <Pill tone="warning">ID on several wallets</Pill> : null}
                        </>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {wallet.accountName ? (
                        <>
                          <div>{wallet.accountName}</div>
                          <div className="text-app-ink-soft">{wallet.bankName} {maskAccountNumber(wallet.accountNumber)}</div>
                          {wallet.nameCheck === "review" ? (
                            <div className="mt-1 text-[12.5px] text-app-ink-soft">
                              {`Not the owner's or the business's name: check it belongs to ${kycName || wallet.user.name || "the owner"}${wallet.role === "seller" ? "" : " or the registered business"}.`}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-app-ink-soft">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {wallet.status === "frozen" ? <Pill tone="danger">Paused</Pill> : <Pill tone={status.tone}>{status.label}</Pill>}
                      {wallet.subaccountError ? <div className="mt-1 max-w-[220px] text-[12.5px] text-app-ink-soft">{wallet.subaccountError}</div> : null}
                      {wallet.frozenReason ? <div className="mt-1 max-w-[220px] text-[12.5px] text-app-ink-soft">{wallet.frozenReason}</div> : null}
                    </td>
                    <td className="px-4 py-3">
                      <WalletActions
                        walletId={wallet.id}
                        review={wallet.subaccountStatus === "review" || wallet.subaccountStatus === "failed"}
                        frozen={wallet.status === "frozen"}
                        korapay={{ allowed: wallet.subaccountStatus === "active", reference: wallet.korapaySplitAccount }}
                      />
                      {wallet.subaccountStatus === "active" && !wallet.korapaySplitAccount && wallet.accountNumber ? (
                        <div className="mt-1 text-[12.5px] text-app-ink-soft">For Korapay: add {wallet.accountName}, {wallet.bankName} {wallet.accountNumber} as a split recipient.</div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <EmptyState icon="coin" title="No wallets here">Businesses set up their wallet from their Wallet page.</EmptyState>
      )}
    </AppPage>
  );
}

/** Whether ID and CAC checks work. The setup details (keys, providers, balances) are on Admin › Developers. */
function ChecksSummary({ working, developer }: { working: boolean; developer: boolean }) {
  return (
    <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
      <Pill tone={working ? "success" : "warning"} dot>{working ? "ID and CAC checks: working" : "ID and CAC checks: need attention"}</Pill>
      <span className="min-w-0 flex-1 basis-[240px] text-[13.5px] text-app-ink-soft">
        {working ? "Businesses can verify their ID and CAC from their Wallet page." : "Some businesses may be asked to upload documents instead."}{" "}
        {developer ? <Link href="/admin/developers#checks" className="font-bold text-app-ink underline">Setup details</Link> : !working ? "A developer on the team can fix it." : null}
      </span>
    </Card>
  );
}
