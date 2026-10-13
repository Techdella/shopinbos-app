import { Suspense } from "react";
import type { Metadata } from "next";
import { ForgotPasswordScreen } from "@/components/auth/app/PasswordScreens";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("auth");
  return { title: t("forgot.metaTitle") };
}

export default function Page() {
  return (
    <Suspense>
      <ForgotPasswordScreen />
    </Suspense>
  );
}
