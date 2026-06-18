import { Suspense } from "react";
import { AuthExperienceClient } from "@/components/auth/AuthExperienceClient";

export default function SupplierSignupPage() {
  return (
    <Suspense>
      <AuthExperienceClient role="supplier" mode="signup" />
    </Suspense>
  );
}
