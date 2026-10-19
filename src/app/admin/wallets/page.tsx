import Link from "next/link";
import { AppPage, Card, EmptyState, Pill, type Tone } from "@/components/app-kit";
import { adminFrame, formatDate, withParams } from "@/components/admin/AdminKit";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { maskAccountNumber } from "@/lib/wallet/rules";
import { WalletActions } from "./WalletActions";
import { youverifyHealth, type YouverifyHealth } from "@/lib/youverify";
import { korapayIdentityReady } from "@/lib/korapay";

export const dynamic = "force-dynamic";

// Shopinbos Wallets: each business's KYC, settlement bank and Paystack subaccount. Shopinbos holds no money, so
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
  const [wallets, counts, idChecks] = await Promise.all([
    db.wallet.findMany({
      where,
      orderBy: [{ subaccountStatus: "asc" }, { updatedAt: "desc" }],
      take: 200,
      include: { user: { select: { name: true, email: true } } },
    }),
    db.wallet.groupBy({ by: ["kycIdHash"], where: { kycIdHash: { not: null } }, _count: { _all: true } }),
    youverifyHealth(),
  ]);
  const shared = new Set(counts.filter((row) => row._count._all > 1).map((row) => row.kycIdHash));

  return (
    <AppPage frame={adminFrame(user)} title="Wallets" sub="Where each business's card payments are settled. Shopinbos holds no money.">
      <IdChecksStatus health={idChecks} korapay={korapayIdentityReady()} />
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

/** Why ID checks work or don't (Youverify answers a free request with the key), so the team can fix the setup. */
function IdChecksStatus({ health, korapay }: { health: YouverifyHealth; korapay: boolean }) {
  const words: Record<YouverifyHealth["state"], { tone: Tone; text: string }> = {
    ok: { tone: "success", text: "Youverify is connected. ID and CAC checks run through it." },
    not_set: { tone: korapay ? "info" : "danger", text: korapay ? "Youverify isn't set (YOUVERIFY_SECRET_KEY). ID checks use Korapay; CAC checks use Dojah if set." : "No ID checks are set up: add YOUVERIFY_SECRET_KEY in Vercel, then redeploy. Until then people see “ID checks are being switched on”." },
    key_rejected: { tone: "danger", text: "Youverify rejects the key (401) on both sandbox and live. Copy the secret key again from cowork.youverify.co → Settings → API Keys (not the public merchant key), update YOUVERIFY_SECRET_KEY in Vercel and redeploy." },
    no_balance: { tone: "danger", text: "Youverify says the account has no funds (402). Top up the Youverify wallet or plan." },
    plan_limit: { tone: "danger", text: "Youverify refuses on plan grounds (403). Ask Youverify to enable NIN, BVN and business checks for this account." },
    unreachable: { tone: "warning", text: "Youverify couldn't be reached just now. Refresh in a minute." },
    other: { tone: "warning", text: "Youverify answered with an unexpected error." },
  };
  const shown = words[health.state];
  const detail = "status" in health || "message" in health ? [("status" in health && health.status) ? `HTTP ${health.status}` : "", "message" in health && health.message ? health.message : ""].filter(Boolean).join(" · ") : "";
  return (
    <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
      <Pill tone={shown.tone} dot>{health.state === "ok" ? `ID checks: on (${health.environment})` : "ID checks"}</Pill>
      <span className="min-w-0 flex-1 basis-[280px] text-[13.5px] leading-[1.45]">
        {shown.text}
        {detail ? <span className="block text-[12.5px] text-app-ink-soft">Youverify said: {detail}</span> : null}
      </span>
    </Card>
  );
}
