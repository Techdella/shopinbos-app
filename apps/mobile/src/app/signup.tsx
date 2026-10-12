import { useLocalSearchParams } from "expo-router";
import { AuthForm } from "@/components/AuthForm";
import { asSignupRole } from "@/lib/partner-pure";

export default function Signup() {
  const { method, role } = useLocalSearchParams<{ method?: string; role?: string }>();
  return <AuthForm mode="signup" initialMethod={method === "email" ? "email" : "phone"} initialRole={asSignupRole(role)} />;
}
