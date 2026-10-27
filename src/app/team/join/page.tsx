import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/server-auth";
import { StaffError, acceptStaffInvite } from "@/lib/staff/staff.server";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Join a store team", robots: { index: false } };

// The link in a staff invite (src/lib/staff/staff.server.ts): sign in or sign up with the invited email, then join.
export default async function JoinTeamPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const t = await getT("account");
  const here = `/team/join?token=${encodeURIComponent(token)}`;
  const user = await getCurrentAppUser();
  let problem: string | null = null;
  if (user && token) {
    try {
      // Joining is done as the signed-in person, even if they're on another team right now.
      await acceptStaffInvite({ id: user.staff?.userId ?? user.id, email: user.staff?.email ?? user.email, role: user.role }, token);
    } catch (error) {
      if (!(error instanceof StaffError)) throw error;
      problem = error.message;
    }
    if (!problem) redirect("/home?joined=1");
  }
  return (
    <main className="grid min-h-dvh place-items-center bg-app-canvas px-4 py-10">
      <div className="w-full max-w-[440px] rounded-[22px] border border-app-line bg-white p-6">
        <h1 className="m-0 text-[22px] font-extrabold">{t("team.joinTitle")}</h1>
        {!token ? (
          <p className="mb-0 mt-3 text-[14.5px] text-app-ink-soft">{t("team.joinNoToken")}</p>
        ) : problem ? (
          <p role="alert" className="mb-0 mt-3 text-[14.5px] text-app-danger">{problem}</p>
        ) : (
          <>
            <p className="mb-0 mt-3 text-[14.5px] text-app-ink-soft">{t("team.joinSignIn")}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a href={`/login?next=${encodeURIComponent(here)}`} className="inline-flex min-h-[44px] items-center rounded-full bg-app-ink px-5 text-[14px] font-bold text-white no-underline">{t("team.joinLogin")}</a>
              <a href={`/signup?next=${encodeURIComponent(here)}`} className="inline-flex min-h-[44px] items-center rounded-full border border-app-line px-5 text-[14px] font-bold text-app-ink no-underline">{t("team.joinSignup")}</a>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
