import { Suspense } from "react";
import { AuthExperienceClient } from "@/components/auth/AuthExperienceClient";

export default function AdminLoginPage() {
  return (
    <main>
      <Suspense fallback={<div>Loading...</div>}>
        <AuthExperienceClient role="admin" mode="login" />
      </Suspense>
    </main>
  );
}
