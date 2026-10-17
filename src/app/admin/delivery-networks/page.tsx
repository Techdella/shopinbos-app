import { setDeliveryNetworkEnabled } from "@/app/actions/admin";
import { AppPage, ListCard, Pill } from "@/components/app-kit";
import { CountRow, adminFrame, buttonClass, formatMoney } from "@/components/admin/AdminKit";
import { requireRole } from "@/lib/server-auth";
import { networkFeeRule } from "@/lib/logistics/carriers/fee";
import { canStoreNetworkAccounts } from "@/lib/logistics/carriers/accounts.server";
import { adminNetworks, refundsToCheck } from "@/lib/logistics/networks.server";

export const dynamic = "force-dynamic";

// Delivery networks (Kwik, Fez, Sendstack, Sendbox) booked through their own API, apart from the logistics partners
// who sign up and work jobs in the partner portal. A network shows to sellers once it's switched on here and either
// Shopinbos's keys for it are set (env, see .env.local.example) or the seller connected their own account.
export default async function AdminDeliveryNetworksPage(props: { searchParams?: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");
  const searchParams = await props.searchParams;
  const [networks, refunds] = await Promise.all([adminNetworks(), refundsToCheck()]);
  const fee = networkFeeRule();
  const ownAccounts = canStoreNetworkAccounts();

  return (
    <AppPage
      frame={adminFrame(user, "Search delivery networks")}
      title="Delivery networks"
      sub="Kwik, Fez and other networks sellers book inside Shopinbos at the network's own price. Bookings on Shopinbos's account add the Shopinbos fee on top."
    >
      {(searchParams?.saved || searchParams?.error) && (
        <p role="status" className={`mb-4 rounded-[14px] px-4 py-3 text-[14.5px] font-bold ${searchParams.error ? "bg-app-danger-tint text-app-danger" : "bg-app-success-tint text-app-success"}`}>
          {searchParams.error ?? searchParams.saved}
        </p>
      )}

      <CountRow
        items={[
          { label: "Switched on", value: networks.filter((n) => n.enabled).length },
          { label: "Paid bookings", value: networks.reduce((n, row) => n + row.paidBookings, 0) },
          { label: "Fees earned", value: formatMoney(networks.reduce((n, row) => n + row.feesEarned, 0)) },
          { label: "Seller accounts", value: networks.reduce((n, row) => n + row.sellerAccounts, 0) },
          { label: "Refunds to check", value: refunds.length },
        ]}
      />

      {refunds.length > 0 && (
        <section className="mb-5 rounded-[18px] border border-app-line bg-white px-5 py-4">
          <h2 className="m-0 text-[15px] font-extrabold">Refunds to check</h2>
          <p className="mt-1 text-[13px] text-app-ink-soft">Sellers paid, the delivery wasn&apos;t booked (or was cancelled) and Paystack didn&apos;t take the refund. Refund these from the Paystack dashboard.</p>
          <ul className="m-0 mt-3 grid list-none gap-1.5 p-0 text-[13.5px]">
            {refunds.map((row) => (
              <li key={row.id}>
                <b>{formatMoney(row.total)}</b> · {row.network} · Paystack ref <code>{row.paymentRef}</code> · {row.createdAt.toISOString().slice(0, 10)}
                {row.error ? ` · ${row.error}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mb-4 text-[14px] text-app-ink-soft">
        Shopinbos fee: {fee.percent}% of the network&apos;s price, at least {formatMoney(fee.min)} and at most {formatMoney(fee.max)} (DELIVERY_NETWORK_FEE_PERCENT, _MIN, _MAX). No fee on a seller&apos;s own account.
        {ownAccounts ? "" : " Sellers can't connect their own accounts until INBOX_ENCRYPTION_KEY is set."}
      </p>

      <ListCard>
        {networks.map((network) => (
          <li key={network.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
            <div className="min-w-0 flex-1 basis-[240px]">
              <div className="flex flex-wrap items-center gap-2 text-[15px] font-extrabold">
                {network.name}
                <Pill tone={network.enabled ? "success" : "muted"} dot>{network.enabled ? "On" : "Off"}</Pill>
                <Pill tone={network.configured ? "info" : "warning"}>{network.configured ? "Shopinbos keys set" : "No Shopinbos keys"}</Pill>
              </div>
              <div className="text-[13px] text-app-ink-soft">
                {network.bookings} bookings · {network.paidBookings} paid through Shopinbos · {formatMoney(network.feesEarned)} in fees · {network.sellerAccounts} seller accounts
              </div>
              {network.enabled && !network.configured && <div className="text-[12.5px] text-app-ink-soft">Only sellers who connected their own {network.name} account can book it until its keys are set.</div>}
            </div>
            <form action={setDeliveryNetworkEnabled}>
              <input type="hidden" name="network" value={network.id} />
              <input type="hidden" name="enabled" value={network.enabled ? "off" : "on"} />
              <button type="submit" className={buttonClass(network.enabled ? "white" : "ink")}>{network.enabled ? "Switch off" : "Switch on"}</button>
            </form>
          </li>
        ))}
      </ListCard>
    </AppPage>
  );
}
