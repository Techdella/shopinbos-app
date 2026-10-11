import { Suspense } from "react";
import type { Metadata } from "next";
import { ForgotPasswordScreen } from "@/components/auth/app/PasswordScreens";

export const metadata: Metadata = { title: "Reset your password" };

export default function Page() {
  return (
    <Suspense>
      <ForgotPasswordScreen />
    </Suspense>
  );
}
