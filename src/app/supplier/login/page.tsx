import { Suspense } from "react";
import { AuthExperienceClient } from "@/components/auth/AuthExperienceClient";

export default function SupplierLoginPage() {
  return (
    <Suspense>
      <AuthExperienceClient role="supplier" mode="login" />
    </Suspense>
  );
}
