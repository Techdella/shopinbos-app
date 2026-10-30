import type { Metadata } from "next";
import Link from "next/link";
import { AppPage, Card, CardHead, Pill } from "@/components/app-kit";
import { PendingButton } from "@/components/admin/PendingButton";
import { AccountPicker } from "@/components/admin/AccountPicker";
import { GiftForms } from "@/components/admin/GiftForms";
import { Field, adminFrame, buttonClass, fieldClass, formatDate, withParams } from "@/components/admin/AdminKit";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { canUseSection, isFullAdmin } from "@/lib/admin-team/pure";
import { accountChoices, accountDetails, pilotFeaturesFor } from "@/lib/admin/accounts.server";
import { findGiftPeople, giftPerson } from "@/lib/admin/gifts.server";
import { ACCOUNT_FIELDS, FIELDS_BY_ROLE } from "@shared/admin-accounts";
import { saveAccountDetailsAction, savePilotTesterAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Accounts" };

// Admin › Accounts: pick a seller, supplier or delivery partner (from the list or a search), then change their
// details, choose the pilot features they test, and give them AI credits or a free plan, all on one page. Who can do
// what: details for the partners section, pilot testers for owners and admins (as on Admin › Pilot features), gifts
// for the money section. Rules and logs: src/lib/admin/accounts.server.ts and src/lib/admin/gifts.server.ts.

const ROLE_LABEL = { seller: "Seller", supplier: "Supplier", logistics_partner: "Delivery partner" } as const;

function Notice({ query, anchor }: { query: { saved?: string; error?: string; at?: string }; anchor: string }) {
  if (query.at !== anchor) return null;
  if (query.error) return <p role="alert" className="m-0 mt-4 rounded-[14px] bg-app-danger-tint px-4 py-3 text-[14px] font-bold text-app-danger">{query.error}</p>;
  if (query.saved) return <p role="status" className="m-0 mt-4 rounded-[14px] bg-app-success-tint px-4 py-3 text-[14px] font-bold text-app-success">{query.saved}</p>;
  return null;
}

export default async function AdminAccountsPage({ searchParams }: { searchParams: Promise<{ q?: string; user?: string; saved?: string; error?: string; at?: string }> }) {
  const admin = await requireAdminSection("partners");
  const query = await searchParams;
  const q = (query.q ?? "").trim();
  const userId = query.user ?? null;
  const now = new Date();
  const canGift = canUseSection(admin.adminRole, "money");
  const canPilot = isFullAdmin(admin.adminRole);
  const [choices, found, account, pilot, gifts] = await Promise.all([
    accountChoices(),
    findGiftPeople(q),
    userId ? accountDetails(userId) : null,
    userId && canPilot ? pilotFeaturesFor(userId) : null,
    userId && canGift ? giftPerson(userId, now) : null,
  ]);
  // Each action says which card its message is for (?at=details|pilot|gift).
  const notice = query;

  return (
    <AppPage
      frame={adminFrame(admin)}
      title="Accounts"
      sub="Pick a seller, supplier or delivery partner to change their details, make them a pilot tester, or give them AI credits or a free plan."
    >
      <Card className="mb-5 p-5">
        <CardHead title="Pick someone" sub="From the list (newest 400 of each), or search by name, business, email or phone." />
        <div className="mt-4">
          <AccountPicker action="/admin/accounts" choices={choices} selected={userId} anchor="account" />
        </div>
        <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Search" htmlFor="account-q" className="min-w-[240px] flex-1">
            <input id="account-q" name="q" defaultValue={q} minLength={2} maxLength={80} placeholder="e.g. Ada Fabrics, ada@example.com or 0803…" className={fieldClass} />
          </Field>
          <button type="submit" className={buttonClass("white")}>Search</button>
        </form>
        {q.length >= 2 ? (
          found.length ? (
            <ul className="m-0 mt-4 grid gap-2 p-0 [list-style:none]">
              {found.map((row) => (
                <li key={row.id}>
                  <Link href={withParams("/admin/accounts", { q, user: row.id }) + "#account"} className="flex flex-wrap items-center gap-2 rounded-[14px] border border-app-line bg-white px-4 py-3 text-[14px] hover:border-app-ink">
                    <span className="font-extrabold">{row.business || row.name}</span>
                    {row.business ? <span className="text-app-ink-soft">{row.name}</span> : null}
                    {row.email ? <span className="text-app-ink-soft">{row.email}</span> : null}
                    <span className="ml-auto flex gap-2"><Pill tone="muted">{ROLE_LABEL[row.role]}</Pill><Pill tone="info">{row.plan}</Pill></span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 mt-4 text-[14px] text-app-ink-soft">Nobody matches “{q}”.</p>
          )
        ) : null}
      </Card>

      {userId && !account ? <p role="alert" className="mb-5 text-[14px] text-app-danger">Only sellers, suppliers and delivery partners can be managed here.</p> : null}

      {account ? (
        <div id="account" className="grid scroll-mt-24 gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="m-0 text-[22px] font-extrabold">{account.values.business || account.values.name}</h2>
            <Pill tone="muted">{ROLE_LABEL[account.role]}</Pill>
            {gifts ? <Pill tone="info">{gifts.plan}{gifts.paysByCard ? " · card" : ""}</Pill> : null}
            {gifts && gifts.credits !== null ? <Pill tone="success">{gifts.credits.toLocaleString("en-NG")} AI credits</Pill> : null}
            <span className="text-[13px] text-app-ink-soft">{account.email ?? "No email"} · joined {formatDate(account.createdAt)}</span>
            {account.business ? <Link href={account.business.href} className={`${buttonClass("white", "sm")} ml-auto`}>Full profile</Link> : null}
          </div>

          <Card id="details" className="scroll-mt-24 p-5">
            <CardHead title="Details" sub="What shows on their profile and what the team uses to reach them. Their sign-in email and number don't change here." />
            <Notice query={notice} anchor="details" />
            {account.business ? (
              <form action={saveAccountDetailsAction} className="mt-4 grid gap-4">
                <input type="hidden" name="userId" value={account.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  {FIELDS_BY_ROLE[account.role].map((field) => {
                    const rule = ACCOUNT_FIELDS[field];
                    const id = `acc-${field}`;
                    return (
                      <Field key={field} label={rule.label + (rule.required ? "" : " (optional)")} htmlFor={id} className={field === "description" ? "sm:col-span-2" : undefined}>
                        {field === "description" ? (
                          <textarea id={id} name={field} defaultValue={account.values[field] ?? ""} maxLength={rule.max} rows={4} className={fieldClass} />
                        ) : (
                          <input id={id} name={field} defaultValue={account.values[field] ?? ""} maxLength={rule.max} required={rule.required} type={field === "contactEmail" ? "email" : field.toLowerCase().includes("phone") || field === "whatsapp" ? "tel" : "text"} className={fieldClass} />
                        )}
                      </Field>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Why (for the log)" htmlFor="acc-reason" className="min-w-[240px] flex-1">
                    <input id="acc-reason" name="reason" maxLength={300} placeholder="e.g. they asked on WhatsApp to fix the spelling" className={fieldClass} />
                  </Field>
                  <PendingButton pending="Saving…" className={buttonClass("ink")}>Save details</PendingButton>
                </div>
              </form>
            ) : (
              <p className="m-0 mt-4 text-[14px] text-app-ink-soft">They haven&apos;t set up their business yet, so there&apos;s nothing to change.</p>
            )}
          </Card>

          <Card id="pilot" className="scroll-mt-24 p-5">
            <CardHead title="Pilot tester" sub="Tick the pilot features they test. A feature only reaches them once it's switched on for their app on Pilot features." />
            <Notice query={notice} anchor="pilot" />
            {!canPilot ? (
              <p className="m-0 mt-4 text-[14px] text-app-ink-soft">Only owners and admins choose pilot testers.</p>
            ) : !pilot ? (
              <p className="m-0 mt-4 text-[14px] text-app-ink-soft">Pilot features aren&apos;t set up yet.</p>
            ) : (
              <form action={savePilotTesterAction} className="mt-4 grid gap-3">
                <input type="hidden" name="userId" value={account.id} />
                <div className="grid gap-2 sm:grid-cols-2">
                  {pilot.map((feature) => (
                    <label key={feature.key} className="flex items-start gap-3 rounded-[14px] border border-app-line p-3 text-[14px]">
                      <input type="checkbox" name="feature" value={feature.key} defaultChecked={feature.tester} className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-plum" />
                      <span className="min-w-0">
                        <span className="font-extrabold">{feature.name}</span> {feature.live ? <Pill tone="success">On</Pill> : <Pill tone="muted">Off for now</Pill>}
                        <span className="block text-[13px] text-app-ink-soft">{feature.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <PendingButton pending="Saving…" className={buttonClass("ink")}>Save pilot features</PendingButton>
                  <Link href="/admin/features" className="text-[13.5px] font-bold underline">Pilot features</Link>
                </div>
              </form>
            )}
          </Card>

          <Card id="gift" className="scroll-mt-24 p-5">
            <CardHead title="Credits and plan" sub="Free AI credits, or a paid plan for free for a while (everything it includes opens for them)." />
            <Notice query={notice} anchor="gift" />
            {gifts ? <GiftForms person={gifts} back="/admin/accounts" now={now} /> : <p className="m-0 mt-4 text-[14px] text-app-ink-soft">Gifts are for team members with access to money (owners, admins and finance).</p>}
          </Card>
        </div>
      ) : null}
    </AppPage>
  );
}
