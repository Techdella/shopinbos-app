import { Redirect, useLocalSearchParams } from "expo-router";
import { AuthForm } from "@/components/AuthForm";
import { pickedSignupRole } from "@/lib/partner-pure";

// Sign-up form for the role picked on Welcome's cards. Without one, Welcome asks "What do you do?" first.
export default function Signup() {
  // phone / email: typed on the log-in screen before "Sign up now" (no account had it yet).
  const { method, role, phone, email } = useLocalSearchParams<{ method?: string; role?: string; phone?: string; email?: string }>();
  const picked = pickedSignupRole(role);
  if (!picked) return <Redirect href="/welcome" />;
  return <AuthForm key={picked} mode="signup" initialMethod={method === "email" ? "email" : "phone"} initialRole={picked} prefill={{ phone, email }} />;
}
