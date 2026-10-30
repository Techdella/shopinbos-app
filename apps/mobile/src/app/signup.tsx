import { useLocalSearchParams } from "expo-router";
import { AuthForm } from "@/components/AuthForm";
import { pickedSignupRole } from "@/lib/partner-pure";

// Sign up, one question per screen: name and phone here, then the code and (when no ?role= came with the link)
// "What brings you to Shopinbos?" on the verify screen.
export default function Signup() {
  // phone / email: typed on the log-in screen before "Sign up now" (no account had it yet).
  // name / step=contact: back from "Use a different email", so nothing already answered is asked again.
  const { method, role, phone, email, name, step } = useLocalSearchParams<{ method?: string; role?: string; phone?: string; email?: string; name?: string; step?: string }>();
  const picked = pickedSignupRole(role);
  return <AuthForm key={`${picked ?? "ask"}:${name ?? ""}`} mode="signup" initialMethod={method === "email" ? "email" : "phone"} initialRole={picked} prefill={{ phone, email, name, step: step === "contact" ? "contact" : undefined }} />;
}
