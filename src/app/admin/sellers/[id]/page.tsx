import { notFound } from "next/navigation";
import { AppPage, Pill, PillLink, StatTile, Thumb } from "@/components/app-kit";
import { PeggyCallNotes } from "@/components/admin/PeggyCallNotes";
import { adminFrame, buttonClass, fieldClass, formatDate, formatMoney } from "@/components/admin/AdminKit";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { accessLogFor, activeReveal } from "@/lib/admin/data-access.server";
import { sellerDetail, sellerNotices } from "@/lib/admin/sellers.server";
import { storeUrl } from "@/lib/marketing/brand";
import { ACCESS_ACTION_LABELS, REVEAL_MINUTES, REVEAL_REASONS, SHOP_ACTION_REASONS, accessReasonLabel, maskAccount, maskEmail, maskPhone } from "@shared/privacy";
import { revealSellerContact, sendSellerNoticeOnWhatsApp, setSellerShopStatus } from "../actions";

// One shop in Admin › Sellers. The owner's email and phone are masked; "Show contact details" asks why (logged), then
// shows them on this admin's screen only, for REVEAL_MINUTES. Bank: name and last 4 digits only. Customers: a count.

const card = "mb-5 rounded-[18px] border border-app-line bg-white p-5";

export default async function AdminSellerPage(props: { params: Promise<{ id: string }>; searchParams?: Promise<{ reveal?: string; error?: string; saved?: string; wa?: string }> }) {
  const admin = await requireAdminSection("partners");
  const { id } = await props.params;
  const params = await props.searchParams;
  const seller = await sellerDetail(id);
  if (!seller) notFound();

  const [reveal, log, notices] = await Promise.all([activeReveal(params?.reveal, admin.id, seller.userId), accessLogFor(seller.userId), sellerNotices(seller.userId)]);
  const owner = seller.user;
  const wallet = owner.wallet;
  const live = seller.status === "active";
  const until = reveal ? new Date(reveal.createdAt.getTime() + REVEAL_MINUTES * 60_000) : null;

  return (
    <AppPage
      frame={adminFrame(admin, "Search shops")}
      title={
        <span className="flex min-w-0 items-center gap-3">
          <Thumb src={seller.logoUrl} label={seller.name} size={48} />
          <span className="min-w-0 break-words">{seller.name}</span>
        </span>
      }
      sub={`${seller.customDomain ?? `/s/${seller.slug}`}${seller.city ? ` · ${seller.city}` : ""}, ${seller.country}`}
      actions={
        <>
          <PillLink href="/admin/sellers" icon="arrowLeft" iconOnlyOnPhone>All sellers</PillLink>
          <PillLink href={storeUrl(seller)} icon="globe">Open shop</PillLink>
          <PillLink href={`/admin/support/new?to=user:${seller.userId}`} icon="chat">Message</PillLink>
          <PillLink href={`/admin/accounts?user=${seller.userId}#account`} icon="settings">Manage account</PillLink>
        </>
      }
    >
      <section aria-label="Shop summary" className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <StatTile tone="card" label="Shop" value={<Pill tone={live ? "success" : "danger"} dot>{live ? "Live" : "Paused"}</Pill>} />
        <StatTile tone="card" label="Plan" value={<span className="text-[20px]">{seller.plan}</span>} hint={owner.planStatus ? `${owner.planInterval ?? ""} ${owner.planStatus}${owner.planPaidUntil ? `, paid to ${formatDate(owner.planPaidUntil)}` : ""}` : seller.giftNote ?? undefined} />
        <StatTile tone="card" label="Products" value={seller.stats.products} />
        <StatTile tone="card" label="Paid orders (30 days)" value={seller.stats.orders30} hint={formatMoney(seller.stats.sales30, seller.currency)} />
        <StatTile tone="card" label="Paid orders (all time)" value={seller.stats.orders} hint={formatMoney(seller.stats.sales, seller.currency)} />
        <StatTile tone="card" label="Customers" value={seller.stats.customers} hint="A count only" />
      </section>

      <section id="owner" aria-labelledby="owner-title" className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="owner-title" className="m-0 text-[17px] font-extrabold">Owner</h2>
            <p className="m-0 mt-1 text-[14px] text-app-ink-soft">
              Joined {formatDate(owner.createdAt)} · {seller.stats.lastActive ? `last active ${formatDate(seller.stats.lastActive)}` : "not active yet"}
            </p>
          </div>
          {reveal && until && <Pill tone="warning" dot>Shown to you until {until.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })}</Pill>}
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-3 text-[14px] sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-[12.5px] text-app-ink-soft">Name</dt><dd className="m-0 font-bold">{owner.name}</dd></div>
          <div><dt className="text-[12.5px] text-app-ink-soft">Email</dt><dd className="m-0 break-all font-bold">{(reveal ? owner.email : maskEmail(owner.email)) ?? "None"}</dd></div>
          <div><dt className="text-[12.5px] text-app-ink-soft">Phone / WhatsApp</dt><dd className="m-0 font-bold">{(reveal ? owner.phone : maskPhone(owner.phone)) ?? "None"}</dd></div>
          <div>
            <dt className="text-[12.5px] text-app-ink-soft">Bank for payouts</dt>
            <dd className="m-0 font-bold">{wallet?.bankName ? `${wallet.bankName} ${maskAccount(wallet.accountNumber) ?? ""}` : "Not added"}</dd>
            {wallet && <dd className="m-0 text-[12.5px] text-app-ink-soft">ID check {wallet.kycStatus === "verified" ? "done" : "not done"}{wallet.status === "frozen" ? " · wallet paused" : ""}</dd>}
          </div>
        </dl>

        {!reveal && (owner.email || owner.phone) && (
          <details className="group mt-4" open={params?.error === "reason"}>
            <summary className="inline-flex min-h-[40px] cursor-pointer list-none items-center gap-1.5 rounded-full border border-app-line px-4 text-[13.5px] font-extrabold hover:border-app-line-strong [&::-webkit-details-marker]:hidden">
              Show contact details
            </summary>
            <form action={revealSellerContact} className="mt-3 grid max-w-[560px] gap-3 rounded-[16px] bg-app-canvas p-4">
              <input type="hidden" name="storeId" value={seller.id} />
              <label className="grid gap-1 text-[13.5px] font-bold">
                Why do you need them?
                <select name="reason" required defaultValue="" className={fieldClass}>
                  <option value="" disabled>Choose a reason</option>
                  {REVEAL_REASONS.map((reason) => <option key={reason.key} value={reason.key}>{reason.label}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-[13.5px] font-bold">
                Note (optional, e.g. the support request)
                <input name="note" maxLength={300} className={fieldClass} />
              </label>
              {params?.error === "reason" && <p role="alert" className="m-0 text-[13px] font-bold text-app-danger">Choose a reason first.</p>}
              <p className="m-0 text-[12.5px] text-app-ink-soft">
                This is logged with your name and shown below. The details stay on your screen for {REVEAL_MINUTES} minutes; use them only for this reason.
              </p>
              <button type="submit" className={buttonClass("ink", "sm")}>Show for {REVEAL_MINUTES} minutes</button>
            </form>
          </details>
        )}
      </section>

      <PeggyCallNotes userId={seller.userId} />

      <section id="notices" aria-labelledby="notices-title" className={card}>
        <h2 id="notices-title" className="m-0 flex flex-wrap items-center gap-2 text-[17px] font-extrabold">
          Notices to the owner
          {params?.saved === "whatsapp" && <Pill tone="success">Sent on WhatsApp</Pill>}
        </h2>
        <p className="m-0 mt-1 text-[14px] text-app-ink-soft">
          The latest messages in their bell. Send one on WhatsApp when they might not see it, for example when they have no email.
        </p>
        {params?.wa && <p role="alert" className="m-0 mt-2 text-[13px] font-bold text-app-danger">WhatsApp: {params.wa}</p>}
        {notices.length === 0 ? (
          <p className="m-0 mt-3 text-[14px] text-app-ink-soft">No notices yet.</p>
        ) : (
          <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0 text-[14px]">
            {notices.map((notice) => (
              <li key={notice.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5">
                <span className="min-w-0">
                  <strong className="break-words">{notice.title}</strong>
                  <span className="block text-[13px] text-app-ink-soft">
                    {formatDate(notice.createdAt)}
                    {notice.whatsapp ? ` · WhatsApp ${notice.whatsapp.status === "ok" ? "sent" : `failed${notice.whatsapp.error ? `: ${notice.whatsapp.error}` : ""}`}` : ""}
                  </span>
                </span>
                {owner.phone && notice.whatsapp?.status !== "ok" && (
                  <form action={sendSellerNoticeOnWhatsApp}>
                    <input type="hidden" name="storeId" value={seller.id} />
                    <input type="hidden" name="notificationId" value={notice.id} />
                    <button type="submit" className={buttonClass("white", "sm")}>Send on WhatsApp</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="shop-status" aria-labelledby="shop-status-title" className={card}>
        <h2 id="shop-status-title" className="m-0 flex flex-wrap items-center gap-2 text-[17px] font-extrabold">
          {live ? "Pause this shop" : "Restore this shop"}
          {params?.saved === "shop" && <Pill tone="success">Saved</Pill>}
        </h2>
        <p className="m-0 mt-1 text-[14px] text-app-ink-soft">
          {live
            ? "The storefront goes offline for buyers until you restore it. The seller can still sign in, and orders already placed carry on. Message them to say why."
            : "The storefront is offline for buyers. Restoring puts it back online straight away."}
        </p>
        <form action={setSellerShopStatus} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="storeId" value={seller.id} />
          <input type="hidden" name="status" value={live ? "suspended" : "active"} />
          <label className="grid min-w-[220px] flex-1 gap-1 text-[13.5px] font-bold sm:flex-none">
            Reason
            <select name="reason" required defaultValue="" className={fieldClass}>
              <option value="" disabled>Choose a reason</option>
              {SHOP_ACTION_REASONS.filter((reason) => (live ? reason.key !== "resolved" : true)).map((reason) => <option key={reason.key} value={reason.key}>{reason.label}</option>)}
            </select>
          </label>
          <label className="grid min-w-[240px] flex-1 gap-1 text-[13.5px] font-bold">
            What happened
            <input name="note" required minLength={5} maxLength={300} className={fieldClass} />
          </label>
          <button type="submit" className={buttonClass(live ? "white" : "ink", "sm")}>{live ? "Pause shop" : "Restore shop"}</button>
        </form>
        {params?.error === "shop" && <p role="alert" className="m-0 mt-2 text-[13px] font-bold text-app-danger">Choose a reason and say what happened.</p>}
      </section>

      <section aria-labelledby="access-log" className={card}>
        <h2 id="access-log" className="m-0 text-[17px] font-extrabold">Who looked at or changed this account</h2>
        <p className="m-0 mt-1 text-[14px] text-app-ink-soft">Every time someone on the team views the owner&apos;s contact details, sends a notice to their WhatsApp or pauses the shop. Kept for accountability; it can&apos;t be edited.</p>
        {log.length === 0 ? (
          <p className="m-0 mt-3 text-[14px] text-app-ink-soft">Nobody yet.</p>
        ) : (
          <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0 text-[14px]">
            {log.map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                <span>
                  <strong>{row.adminName}</strong> · {ACCESS_ACTION_LABELS[row.action] ?? row.action} · {accessReasonLabel(row.reason)}
                  {row.note && <span className="text-app-ink-soft"> · {row.note}</span>}
                </span>
                <span className="text-[13px] text-app-ink-soft">
                  {row.createdAt.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="max-w-[760px] text-[12.5px] leading-[1.6] text-app-ink-soft">
        Nigeria Data Protection Act 2023: we hold this seller&apos;s details to run their account (contract) and keep the
        platform safe (legitimate interest). Their customers&apos; details belong to the seller and aren&apos;t shown here.
        If the seller asks to see, correct or delete their data, handle it through Support.
      </p>
    </AppPage>
  );
}
