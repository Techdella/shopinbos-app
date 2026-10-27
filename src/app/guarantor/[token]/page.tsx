import type { Metadata } from "next";
import { Wordmark } from "@/components/app-ui";
import { getT } from "@/lib/i18n/server";
import { guarantorForToken } from "@/lib/logistics/partner-kyc.server";
import { GuarantorAnswer } from "./GuarantorAnswer";

// A delivery partner's guarantor opens this from the text we sent them (src/lib/logistics/partner-kyc.server.ts
// sendGuarantorCode). No sign-in: the link and the code in the same text are the proof. Shows only the partner's
// display name and the guarantor's own name.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Guarantor request · Shopinbos", robots: { index: false, follow: false } };

export default async function GuarantorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [guarantor, t] = await Promise.all([guarantorForToken(token), getT("partnerKyc")]);
  const partner = guarantor?.logisticsPartner.displayName ?? "";
  return (
    <main className="grid min-h-dvh place-items-center bg-app-canvas px-4 py-10 font-app text-app-ink">
      <div className="grid w-full max-w-[460px] gap-5">
        <Wordmark />
        <section className="grid gap-4 rounded-[22px] border border-app-line bg-white p-5 sm:p-6">
          <h1 className="m-0 text-[22px] font-extrabold tracking-[-0.4px]">{t("gpage.title")}</h1>
          {!guarantor ? (
            <p className="m-0 text-[15px] leading-[1.55]">{t("gpage.expired")}</p>
          ) : guarantor.status !== "pending" ? (
            <p className="m-0 text-[15px] leading-[1.55]">{t("gpage.answered")}</p>
          ) : (
            <>
              <p className="m-0 text-[15px] leading-[1.55]">{t("gpage.body", { name: guarantor.fullName.split(/\s+/)[0], partner })}</p>
              <GuarantorAnswer token={token} partner={partner} />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
