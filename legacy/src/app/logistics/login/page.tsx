import { Suspense } from "react";
import { AuthExperienceClient } from "@/components/auth/AuthExperienceClient";

export default function LogisticsLoginPage() {
  return (
    <Suspense>
      <AuthExperienceClient role="logistics_partner" mode="login" />
    </Suspense>
  );
}
