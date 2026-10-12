import { Suspense } from "react";
import type { Metadata } from "next";
import { ResetPasswordScreen } from "@/components/auth/app/PasswordScreens";
import { currentSession, getAuthRouteClient, isRecoverySession } from "@/lib/auth/session.server";

export const metadata: Metadata = { title: "Choose a new password" };
export const dynamic = "force-dynamic";

export default async function Page() {
  // The form only shows for the session made from an unused reset link (see /auth/callback).
  const session = await getAuthRouteClient().then(currentSession).catch(() => null);
  const ready = Boolean(session && (await isRecoverySession(session.claims)));
  return (
    <Suspense>
      <ResetPasswordScreen ready={ready} />
    </Suspense>
  );
}
