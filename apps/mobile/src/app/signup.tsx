import { Redirect, useLocalSearchParams } from "expo-router";
import { AuthForm } from "@/components/AuthForm";
import { pickedSignupRole } from "@/lib/partner-pure";

// Sign-up form for the role picked on Welcome's cards. Without one, Welcome asks "What do you do?" first.
export default function Signup() {
  const { method, role } = useLocalSearchParams<{ method?: string; role?: string }>();
  const picked = pickedSignupRole(role);
  if (!picked) return <Redirect href="/welcome" />;
  return <AuthForm key={picked} mode="signup" initialMethod={method === "email" ? "email" : "phone"} initialRole={picked} />;
}
