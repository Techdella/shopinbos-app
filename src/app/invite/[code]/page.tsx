import type { Metadata } from "next";
import Link from "next/link";
import { inviterFor } from "@/lib/referrals/service.server";
import { REFERRAL_OFFERS, REFERRAL_ROLES, asReferralRole, signupPath, welcomeText, type ReferralRole } from "@shared/referrals";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "You're invited to Shopinbos", robots: { index: false } };

// /invite/CODE: where an invite link (/r/CODE, which remembered the code) lands. Says who invited them and what they
// get, with the sign-up for each kind of business; ?for= puts the one they were invited as first.

const CARD: Record<ReferralRole, { title: string; pitch: string; button: string }> = {
  seller: {
    title: "I sell products",
    pitch: "Rex builds your online store with you in minutes, Peggy answers your customers on WhatsApp, and you can sell suppliers' products without holding stock.",
    button: "Start my store",
  },
  supplier: {
    title: "I'm a supplier or wholesaler",
    pitch: "List your products once and shops across Nigeria order from you. You get paid to your bank, and sellers find you in the marketplace.",
    button: "Join as a supplier",
  },
  logistics_partner: {
    title: "I deliver",
    pitch: "Get delivery jobs from shops near you, set your own prices and areas, and get paid automatically.",
    button: "Join as a delivery partner",
  },
};

export default async function InvitePage(props: { params: Promise<{ code: string }>; searchParams?: Promise<{ for?: string }> }) {
  const { code } = await props.params;
  const first = asReferralRole((await props.searchParams)?.for);
  const inviter = await inviterFor(code);
  const order = first ? [first, ...REFERRAL_ROLES.filter((role) => role !== first)] : [...REFERRAL_ROLES];

  return (
    <main className="min-h-[100dvh] bg-[#F4F1EA] px-4 py-10 font-app text-[#0E2A38]">
      <div className="mx-auto w-full max-w-[880px]">
        <p className="m-0 font-mono text-[11px] uppercase tracking-[0.16em] text-[#2E7E78]">You&apos;re invited</p>
        <h1 className="mb-2 mt-2 text-[32px] font-extrabold leading-[1.1] tracking-[-0.025em] sm:text-[40px]">
          {inviter ? <>{inviter.name} invited you to Shopinbos</> : <>Join Shopinbos</>}
        </h1>
        <p className="m-0 max-w-[640px] text-[16px] leading-[1.55] text-[#0E2A38]/75">
          Shopinbos is where African businesses sell online, find suppliers and get deliveries done.
          {inviter ? " Sign up with this invite and you get a welcome gift:" : " Pick how you'd like to join:"}
        </p>
        {!inviter && <p className="mt-3 rounded-[14px] bg-white px-4 py-3 text-[14px]">This invite link isn&apos;t valid any more, but you can still join below.</p>}

        <div className="mt-7 grid gap-4 md:grid-cols-3">
          {order.map((role, index) => (
            <section key={role} className={`flex flex-col rounded-[22px] border bg-white p-5 ${index === 0 && first ? "border-[#2E7E78] shadow-[0_12px_30px_-18px_rgba(14,42,56,0.5)]" : "border-[#0E2A38]/[0.08]"}`}>
              <h2 className="m-0 text-[19px] font-extrabold">{CARD[role].title}</h2>
              <p className="mb-4 mt-2 flex-1 text-[14px] leading-[1.5] text-[#0E2A38]/70">{CARD[role].pitch}</p>
              {inviter && (
                <p className="m-0 mb-4 rounded-[14px] bg-[#EEF7F5] px-3 py-2.5 text-[13.5px] font-bold text-[#1F5F5A]">
                  🎁 {welcomeText(role)}
                </p>
              )}
              <Link href={signupPath(role)} className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-[#0E2A38] px-5 text-[15px] font-extrabold text-white no-underline hover:bg-black">
                {CARD[role].button}
              </Link>
              {inviter && <p className="mb-0 mt-2 text-center text-[12px] text-[#0E2A38]/55">Counts for {inviter.name} when: {REFERRAL_OFFERS[role].rule.toLowerCase()}.</p>}
            </section>
          ))}
        </div>

        <p className="mt-8 text-[13px] text-[#0E2A38]/60">
          Already have an account? <Link href="/login" className="font-bold text-[#0E2A38] underline">Sign in</Link>. Invite gifts are for new accounts.
        </p>
      </div>
    </main>
  );
}
