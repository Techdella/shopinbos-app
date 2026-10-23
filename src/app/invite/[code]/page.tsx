import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { inviterFor } from "@/lib/referrals/service.server";
import { REFERRAL_ROLES, asReferralRole, signupPath, welcomeText, type ReferralRole } from "@shared/referrals";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "You're invited to Shopinbos", robots: { index: false } };

// /invite/CODE: where an invite link (/r/CODE, which remembered the code) lands. Says who invited them and what they
// get, with the sign-up for each kind of business; ?for= puts the one they were invited as first.

const CARD: Record<ReferralRole, { icon: "store" | "package" | "truck"; title: string; pitch: string; button: string }> = {
  seller: {
    icon: "store",
    title: "I sell products",
    pitch: "Rex builds your online store with you in minutes, Peggy answers your customers on WhatsApp, and you can sell suppliers' products without holding stock.",
    button: "Start my store",
  },
  supplier: {
    icon: "package",
    title: "I'm a supplier or wholesaler",
    pitch: "List your products once and shops across Nigeria order from you. You get paid to your bank, and sellers find you in the marketplace.",
    button: "Join as a supplier",
  },
  logistics_partner: {
    icon: "truck",
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
    <main className="dot-grid-light min-h-[100dvh] bg-[#F4F1EA] px-4 pb-12 pt-6 font-app text-[#0E2A38] sm:pt-8">
      <div className="mx-auto w-full max-w-[1000px]">
        <header className="flex items-center justify-between">
          <Link href="/" aria-label="Shopinbos" className="inline-flex"><Wordmark /></Link>
          <Link href="/login" className="text-[13.5px] font-semibold text-[#0E2A38]/70 no-underline hover:text-[#0E2A38]">Sign in</Link>
        </header>

        <div className="mx-auto mt-12 max-w-[640px] text-center sm:mt-16">
          {inviter && (
            <span className="inline-flex items-center gap-2.5 rounded-full border border-[#0E2A38]/[0.08] bg-white py-1 pl-1 pr-4 text-left">
              {inviter.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={inviter.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full border border-[#0E2A38]/[0.08] bg-white object-cover" />
              ) : (
                <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#0E2A38] text-[13px] font-bold text-[#73D8C8]">
                  {inviter.name.trim().charAt(0).toUpperCase()}
                </span>
              )}
              <span className="leading-[1.2]">
                <span className="block text-[13.5px] font-semibold">{inviter.name}</span>
                {inviter.ownerName && <span className="block text-[12px] text-[#0E2A38]/55">{inviter.ownerName}</span>}
              </span>
            </span>
          )}
          <h1 className="mb-0 mt-4 text-balance text-[30px] font-bold leading-[1.1] tracking-[-0.03em] sm:text-[42px]">
            {inviter ? <>{inviter.ownerName ? `${inviter.ownerName.split(/\s+/)[0]} from ${inviter.name}` : inviter.name} invited you to Shopinbos</> : <>Join Shopinbos</>}
          </h1>
          <p className="mx-auto mb-0 mt-3 max-w-[520px] text-pretty text-[15.5px] leading-[1.6] text-[#0E2A38]/65">
            Where African businesses sell online, find suppliers and get deliveries done.
            {inviter ? " Join with this invite and you get a welcome gift." : " Pick how you'd like to join."}
          </p>
          {!inviter && (
            <p className="mx-auto mb-0 mt-5 max-w-[460px] rounded-[14px] border border-[#0E2A38]/[0.08] bg-white px-4 py-3 text-[13.5px] text-[#0E2A38]/75">
              This invite link isn&apos;t valid any more, but you can still join below.
            </p>
          )}
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {order.map((role, index) => {
            const featured = index === 0 && Boolean(first);
            return (
              <section
                key={role}
                className={`relative flex flex-col rounded-[20px] border bg-white p-6 transition-shadow hover:shadow-[0_18px_40px_-28px_rgba(14,42,56,0.45)] ${featured ? "border-[#2E7E78]/50 shadow-[0_18px_40px_-28px_rgba(14,42,56,0.45)]" : "border-[#0E2A38]/[0.07]"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span aria-hidden className="grid h-10 w-10 place-items-center rounded-[12px] bg-[#EEF7F5] text-[#1F5F5A]">
                    <Icon name={CARD[role].icon} size={19} />
                  </span>
                  {featured && <span className="rounded-full bg-[#EEF7F5] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#1F5F5A]">For you</span>}
                </div>
                <h2 className="mb-0 mt-4 text-[18px] font-bold leading-[1.25] tracking-[-0.01em]">{CARD[role].title}</h2>
                <p className="mb-5 mt-2 flex-1 text-[14px] leading-[1.6] text-[#0E2A38]/65">{CARD[role].pitch}</p>
                {inviter && (
                  <div className="mb-5 border-t border-dashed border-[#0E2A38]/[0.12] pt-4">
                    <p className="m-0 font-mono text-[10px] uppercase tracking-[0.16em] text-[#2E7E78]">Welcome gift</p>
                    <p className="mb-0 mt-1.5 flex gap-2 text-[14px] font-semibold leading-[1.45]">
                      <Icon name="sparkle" size={15} className="mt-[2px] shrink-0 text-[#2E7E78]" />
                      {welcomeText(role)}
                    </p>
                  </div>
                )}
                <Link
                  href={signupPath(role)}
                  className={`inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full px-5 text-[14.5px] font-bold no-underline transition-colors ${featured || !first ? "bg-[#0E2A38] text-white hover:bg-black" : "border border-[#0E2A38]/[0.14] bg-white text-[#0E2A38] hover:border-[#0E2A38]/30"}`}
                >
                  {CARD[role].button} <Icon name="arrow" size={15} />
                </Link>
              </section>
            );
          })}
        </div>

        <p className="mt-8 text-center text-[13px] text-[#0E2A38]/55">
          Already have an account? <Link href="/login" className="font-semibold text-[#0E2A38] underline underline-offset-2">Sign in</Link>. Welcome gifts are for new accounts.
        </p>
      </div>
    </main>
  );
}
