import { Suspense } from "react";
import { AuthExperienceClient } from "@/components/auth/AuthExperienceClient";

export default function SignupPage() {
  return (
    <Suspense>
      <AuthExperienceClient role="seller" mode="signup" />
    </Suspense>
  );
}
