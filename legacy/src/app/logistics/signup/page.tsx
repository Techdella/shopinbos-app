import { Suspense } from "react";
import { AuthExperienceClient } from "@/components/auth/AuthExperienceClient";

export default function LogisticsSignupPage() {
  return (
    <Suspense>
      <AuthExperienceClient role="logistics_partner" mode="signup" />
    </Suspense>
  );
}
