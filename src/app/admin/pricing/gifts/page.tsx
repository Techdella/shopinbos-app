import type { Metadata } from "next";
import Link from "next/link";
import { AppPage, Card, CardHead, EmptyState, ListCard, ListRow, Pill, PillLink, type Tone } from "@/components/app-kit";
import { Field, adminFrame, buttonClass, fieldClass, formatDate, withParams } from "@/components/admin/AdminKit";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { findGiftPeople, giftPerson, recentGifts } from "@/lib/admin/gifts.server";
import { getPriceBook } from "@/lib/pricing/price-book.server";
import { formatPriceValue } from "@shared/platform-pricing";
import { GiftForms } from "@/components/admin/GiftForms";
import { AccountPicker } from "@/components/admin/AccountPicker";
import { accountChoices } from "@/lib/admin/accounts.server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gifts and free plans" };

// Admin › Pricing › Gifts and free plans: find a seller, supplier or delivery partner and give them free AI credits
// or free time on any paid plan of their role (and so everything that plan opens), end a gift early, and see what
// the team gave lately. The join offer for every new account is on Admin › Pricing ("Join offer"). Rules and the
// log: src/lib/admin/gifts.server.ts.

const ACTION: Record<string, { label: string; tone: Tone }> = {
  gift_credits: { label: "Credits", tone: "success" },
  gift_plan: { label: "Plan", tone: "info" },
  end_gift: { label: "Ended", tone: "muted" },
};

export default async function AdminGiftsPage({ searchParams }: { searchParams: Promise<{ q?: string; user?: string; saved?: string; error?: string }> }) {
  const admin = await requireAdminSection("money");
  const query = await searchParams;
  const q = (query.q ?? "").trim();
  const now = new Date();
  const [people, person, recent, book, choices] = await Promise.all([findGiftPeople(q), query.user ? giftPerson(query.user, now) : null, recentGifts(40), getPriceBook(), accountChoices()]);
  const joinOffer = [
    `Sellers: ${formatPriceValue("join.seller_months", book["join.seller_months"])} of Starter`,
    `Suppliers: ${formatPriceValue("join.supplier_months", book["join.supplier_months"])} of Supplier Plus`,
    `Delivery partners: ${formatPriceValue("join.logistics_months", book["join.logistics_months"])} of Logistics Plus`,
    `Everyone: ${formatPriceValue("credits.welcome", book["credits.welcome"])} at signup`,
  ];

  return (
    <AppPage
      frame={adminFrame(admin)}
      title="Gifts and free plans"
      sub="Give someone free AI credits, or put them on a paid plan for free for a while: everything that plan includes opens for them, and they go back to their own plan when it ends."
      actions={<PillLink href="/admin/pricing" size="sm" icon="arrowLeft">Prices and fees</PillLink>}
    >
      <Card className="mb-5 p-5">
        <CardHead title="Join offer" sub="What every new account gets when it signs up. Change it on Prices and fees, under Join offer and AI credits (or for a while, with a promotion)." />
        <ul className="m-0 mt-3 grid gap-1 p-0 text-[14px] [list-style:none]">
          {joinOffer.map((line) => <li key={line}>{line}</li>)}
        </ul>
        <div className="mt-4"><Link href="/admin/pricing#join" className={buttonClass("white", "sm")}>Change the join offer</Link></div>
      </Card>

      <Card className="mb-5 p-5">
        <CardHead title="Find someone" sub="Pick a seller, supplier or delivery partner from the list (newest 400 of each), or search by name, business, email or phone." />
        <div className="mt-4">
          <AccountPicker action="/admin/pricing/gifts" choices={choices} selected={query.user ?? null} anchor="gift" />
        </div>
        <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Search" htmlFor="gift-q" className="min-w-[240px] flex-1">
            <input id="gift-q" name="q" defaultValue={q} minLength={2} maxLength={80} placeholder="e.g. Ada Fabrics or ada@example.com" className={fieldClass} />
          </Field>
          <button type="submit" className={buttonClass("white")}>Search</button>
        </form>
        {q.length >= 2 ? (
          people.length ? (
            <ul className="m-0 mt-4 grid gap-2 p-0 [list-style:none]">
              {people.map((row) => (
                <li key={row.id}>
                  <Link href={withParams("/admin/pricing/gifts", { q, user: row.id }) + "#gift"} className="flex flex-wrap items-center gap-2 rounded-[14px] border border-app-line bg-white px-4 py-3 text-[14px] hover:border-app-ink">
                    <span className="font-extrabold">{row.business || row.name}</span>
                    {row.business ? <span className="text-app-ink-soft">{row.name}</span> : null}
                    {row.email ? <span className="text-app-ink-soft">{row.email}</span> : null}
                    <span className="ml-auto flex gap-2"><Pill tone="muted">{row.role === "logistics_partner" ? "Delivery partner" : row.role === "supplier" ? "Supplier" : "Seller"}</Pill><Pill tone="info">{row.plan}</Pill></span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 mt-4 text-[14px] text-app-ink-soft">Nobody matches “{q}”.</p>
          )
        ) : null}
      </Card>

      {query.user && !person ? <p role="alert" className="mb-5 text-[14px] text-app-danger">That account can&apos;t get gifts (only sellers, suppliers and delivery partners can).</p> : null}

      {person ? (
        <section id="gift" aria-labelledby="gift-title" className="mb-6 scroll-mt-24">
          <Card className="p-5">
            <h2 id="gift-title" className="m-0 text-[19px] font-extrabold">{person.business || person.name}</h2>
            <p className="m-0 mt-1 text-[14px] text-app-ink-soft">
              {person.roleLabel} · {person.name}{person.email ? ` · ${person.email}` : ""} · On {person.plan}{person.paysByCard ? " (pays by card)" : ""}
              {person.credits !== null ? ` · ${person.credits.toLocaleString("en-NG")} AI credits` : ""}
            </p>

            {query.error ? <p role="alert" className="m-0 mt-4 rounded-[14px] bg-app-danger-tint px-4 py-3 text-[14px] font-bold text-app-danger">{query.error}</p> : null}
            {query.saved ? <p role="status" className="m-0 mt-4 rounded-[14px] bg-app-success-tint px-4 py-3 text-[14px] font-bold text-app-success">{query.saved}</p> : null}

            <GiftForms person={person} back="/admin/pricing/gifts" now={now} />
          </Card>
        </section>
      ) : null}

      <h2 className="mb-3 mt-8 text-[17px] font-extrabold">Latest gifts</h2>
      {recent.length ? (
        <ListCard>
          {recent.map((row) => (
            <ListRow key={row.id}>
              <div className="min-w-0 flex-1 basis-[240px]">
                <Link href={withParams("/admin/pricing/gifts", { user: row.userId }) + "#gift"} className="text-[14.5px] font-extrabold hover:underline">{row.who}</Link>
                <div className="text-[13px] text-app-ink-soft">{row.note} · {formatDate(row.createdAt)} · by {row.by}</div>
              </div>
              <Pill tone={ACTION[row.action]?.tone ?? "muted"}>{ACTION[row.action]?.label ?? row.action}</Pill>
            </ListRow>
          ))}
        </ListCard>
      ) : (
        <EmptyState title="No gifts yet">Gifts the team gives show here, with who gave them and why.</EmptyState>
      )}
    </AppPage>
  );
}
