import { Suspense } from "react";
import type { Metadata } from "next";
import { ResetPasswordScreen } from "@/components/auth/app/PasswordScreens";

export const metadata: Metadata = { title: "Choose a new password" };

export default function Page() {
  return (
    <Suspense>
      <ResetPasswordScreen />
    </Suspense>
  );
}
