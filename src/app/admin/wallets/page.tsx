import Link from "next/link";
import { AppPage, Card, EmptyState, Pill, type Tone } from "@/components/app-kit";
import { adminFrame, formatDate, withParams } from "@/components/admin/AdminKit";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { maskAccountNumber } from "@/lib/wallet/rules";
import { WalletActions } from "./WalletActions";

export const dynamic = "force-dynamic";

// Shopinbos Wallets: each business's KYC, settlement bank and Paystack subaccount. Shopinbos holds no money, so
// there are no balances here: the team approves bank accounts whose name isn't the verified owner's (e.g. a
// company account: check it belongs to them), and pauses a wallet (its Paystack subaccount is switched off and
// checkout stops splitting to it) if something looks wrong. Several wallets sharing one ID are flagged.

const STATUS: Record<string, { label: string; tone: Tone }> = {
  none: { label: "Not set up", tone: "muted" },
  review: { label: "Check the account", tone: "warning" },
  active: { label: "Receiving payments", tone: "success" },
  failed: { label: "Paystack refused", tone: "danger" },
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
  const filter = (await searchParams)?.status ?? "";
  const where = filter === "frozen" ? { status: "frozen" } : filter ? { subaccountStatus: filter } : {};
  const [wallets, counts] = await Promise.all([
    db.wallet.findMany({
      where,
      orderBy: [{ subaccountStatus: "asc" }, { updatedAt: "desc" }],
      take: 200,
      include: { user: { select: { name: true, email: true } } },
    }),
    db.wallet.groupBy({ by: ["kycIdHash"], where: { kycIdHash: { not: null } }, _count: { _all: true } }),
  ]);
  const shared = new Set(counts.filter((row) => row._count._all > 1).map((row) => row.kycIdHash));

  return (
    <AppPage frame={adminFrame(user)} title="Wallets" sub="Where each business's card payments are settled. Shopinbos holds no money.">
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
                <th className="px-4 py-3">ID</th>
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
                      {wallet.kycStatus === "verified" ? (
                        <>
                          <div>{kycName}</div>
                          <div className="text-app-ink-soft">{wallet.kycIdType?.toUpperCase()} …{wallet.kycIdLast4} · {formatDate(wallet.kycVerifiedAt)}</div>
                          {wallet.kycIdHash && shared.has(wallet.kycIdHash) ? <Pill tone="warning">ID on several wallets</Pill> : null}
                        </>
                      ) : (
                        <span className="text-app-ink-soft">Not verified</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {wallet.accountName ? (
                        <>
                          <div>{wallet.accountName}</div>
                          <div className="text-app-ink-soft">{wallet.bankName} {maskAccountNumber(wallet.accountNumber)}</div>
                          {wallet.nameCheck === "review" ? <div className="mt-1 text-[12.5px] text-app-ink-soft">Not the name on the ID: check it belongs to {kycName || "the owner"}.</div> : null}
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
                      <WalletActions walletId={wallet.id} review={wallet.subaccountStatus === "review" || wallet.subaccountStatus === "failed"} frozen={wallet.status === "frozen"} />
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
