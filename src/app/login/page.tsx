import { Suspense } from "react";
import { AuthExperienceClient } from "@/components/auth/AuthExperienceClient";

export default function LoginPage() {
  return (
    <Suspense>
      <AuthExperienceClient role="seller" mode="login" />
    </Suspense>
  );
}
