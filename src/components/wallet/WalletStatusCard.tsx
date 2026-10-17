import { Card, CardHead, Pill, PillLink } from "@/components/app-kit";
import { db } from "@/lib/db/client";
import { maskAccountNumber } from "@/lib/wallet/rules";

// The Shopinbos Wallet in one card, for the Payouts and Earnings pages: where Paystack settles this business's
// money, or the nudge to set it up. Shopinbos never holds or sends the money itself.

export async function walletReady(userId: string) {
  return (await db.wallet.count({ where: { userId, status: "active", subaccountStatus: "active", subaccountCode: { not: null } } })) > 0;
}

export async function WalletStatusCard({ userId, href, what }: { userId: string; href: string; what: string }) {
  const wallet = await db.wallet.findUnique({ where: { userId }, select: { status: true, subaccountStatus: true, bankName: true, accountName: true, accountNumber: true } });
  const ready = wallet?.status === "active" && wallet.subaccountStatus === "active";
  return (
    <Card className="grid gap-3 p-5">
      <CardHead
        title="Shopinbos Wallet"
        action={ready ? <Pill tone="success" dot>Receiving payments</Pill> : wallet?.subaccountStatus === "review" ? <Pill tone="warning" dot>Being checked</Pill> : <Pill tone="muted" dot>Not set up</Pill>}
      />
      {ready && wallet ? (
        <p className="m-0 text-[14px]"><strong>{wallet.accountName}</strong> · {wallet.bankName} {maskAccountNumber(wallet.accountNumber)}</p>
      ) : null}
      <p className="m-0 text-[13.5px] leading-[1.5] text-app-ink-soft">
        {ready
          ? `${what} go straight to this bank through Paystack, usually the next working day. Shopinbos never holds your money.`
          : `Verify your ID and add your bank, and ${what.toLowerCase()} go straight to your bank through Paystack. Shopinbos never holds your money.`}
      </p>
      <div><PillLink href={href} tone={ready ? "white" : "ink"} size="sm">{ready ? "Open your wallet" : "Set up your wallet"}</PillLink></div>
    </Card>
  );
}
