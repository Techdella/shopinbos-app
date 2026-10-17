import Link from "next/link";
import { getCurrentAppUser } from "@/lib/server-auth";
import { getT } from "@/lib/i18n/server";
import { inviteByCode } from "@/lib/logistics/invites.server";
import { acceptDeliveryInvite } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("shipping");
  return { title: t("invite.page.metaTitle"), robots: { index: false } };
}

// A seller invited the delivery company they already use (src/lib/logistics/invites.server.ts). Signed out: sign
// up or log in as a delivery company, then come back here. Signed in as one: accept.
export default async function DeliveryInvitePage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ error?: string }> }) {
  const { code } = await params;
  const { error } = await searchParams;
  const t = await getT("shipping", "common");
  const found = await inviteByCode(code);
  const user = found ? await getCurrentAppUser() : null;
  const back = `/invite/delivery/${encodeURIComponent(code)}`;

  const button = "inline-flex min-h-[52px] w-full items-center justify-center rounded-full px-6 text-[15.5px] font-extrabold";
  return (
    <main className="flex min-h-screen items-center justify-center bg-app-canvas px-4 py-10">
      <div className="w-full max-w-[460px] rounded-[24px] border border-app-line bg-white p-6 sm:p-8">
        <p className="m-0 font-mono text-[11px] uppercase tracking-[0.16em] text-app-ink-soft">Shopinbos</p>
        {!found ? (
          <>
            <h1 className="mt-3 text-[24px] font-extrabold leading-tight">{t("invite.page.invalid")}</h1>
            <p className="mt-2 text-[15px] text-app-ink-soft">{t("invite.page.invalidSub")}</p>
          </>
        ) : (
          <>
            <h1 className="mt-3 text-[24px] font-extrabold leading-tight">{t("invite.page.title", { store: found.storeName, company: found.invite.companyName })}</h1>
            <p className="mt-2 text-[15px] leading-6 text-app-ink-soft">{t("invite.page.body", { store: found.storeName })}</p>
            {error && (
              <p role="alert" className="mt-4 rounded-[14px] bg-app-danger-tint px-4 py-3 text-[14px] font-bold text-app-danger">
                {error === "role" ? t("invite.page.wrongRole") : error}
              </p>
            )}
            {found.invite.status === "accepted" ? (
              <p className="mt-5 text-[15px] font-bold">{t("invite.page.done", { store: found.storeName })}</p>
            ) : user?.role === "logistics_partner" ? (
              <form action={acceptDeliveryInvite} className="mt-6">
                <input type="hidden" name="code" value={code} />
                <button type="submit" className={`${button} bg-app-ink text-white`}>{t("invite.page.accept", { store: found.storeName })}</button>
              </form>
            ) : user ? (
              <p className="mt-5 text-[15px]">{t("invite.page.wrongRole")}</p>
            ) : (
              <div className="mt-6 grid gap-3">
                <Link href={`/logistics/signup?next=${encodeURIComponent(back)}`} className={`${button} bg-app-ink text-white`}>{t("invite.page.signup")}</Link>
                <Link href={`/logistics/login?next=${encodeURIComponent(back)}`} className={`${button} border border-app-line bg-white text-app-ink`}>{t("invite.page.login")}</Link>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
