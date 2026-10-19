import type { Metadata } from "next";
import { DeleteAccountForm } from "./DeleteAccountForm";

export const metadata: Metadata = { title: "Delete your account | Shopinbos" };

// Public (no sign-in): the account deletion page Google Play asks for. In the app, the same request is
// "Delete my account" under Log out (POST /api/app/account/deletion). This form opens a support ticket instead.

const CONTACT = process.env.SUPPORT_INBOX?.trim() || "support@shopinbos.com";

export default function DeleteAccountPage() {
  return (
    <main className="min-h-screen bg-paper px-4 py-12 text-navy">
      <div className="mx-auto max-w-xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-teal-deep">Shopinbos · Privacy</p>
        <h1 className="mt-2 font-display text-[30px] font-medium tracking-[-0.025em]">Delete your Shopinbos account</h1>

        <section className="mt-6 rounded-lg border border-navy/[0.06] bg-white p-6">
          <h2 className="font-display text-[18px] font-medium">In the Shopinbos app</h2>
          <p className="mt-2 text-[15px] leading-6 text-muted">
            Tap <strong>Delete my account</strong> at the bottom of the <strong>Shop</strong> tab (sellers), the <strong>Money</strong> tab
            (suppliers) or the <strong>More</strong> menu (delivery partners), under Log out.
          </p>
        </section>

        <section className="mt-4 rounded-lg border border-navy/[0.06] bg-white p-6">
          <h2 className="font-display text-[18px] font-medium">Or ask here</h2>
          <p className="mt-2 text-[15px] leading-6 text-muted">Use the email or phone number on your account so we can find it. We&apos;ll confirm before we delete anything.</p>
          <DeleteAccountForm />
        </section>

        <section className="mt-4 rounded-lg border border-navy/[0.06] bg-white p-6 text-[15px] leading-6">
          <h2 className="font-display text-[18px] font-medium">What happens next</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            <li>Your shop closes straight away when you ask in the app.</li>
            <li>Within 30 days we delete your account, your shop, products, messages and personal details.</li>
            <li>We keep payment and tax records the law requires (up to 6 years), with nothing else attached.</li>
            <li>Money owed to you is paid out first. If you have open orders, we&apos;ll contact you before closing them.</li>
          </ul>
          <p className="mt-4 text-muted">
            Questions? Email <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>. Read the{" "}
            <a className="underline" href="https://shopinbos.com/legal/privacy">privacy policy</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
