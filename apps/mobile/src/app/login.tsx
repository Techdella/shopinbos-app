import { useLocalSearchParams } from "expo-router";
import { AuthForm } from "@/components/AuthForm";

export default function Login() {
  // phone / email: typed on the sign-up screen before "Log in" (that number or email already has an account).
  const { phone, email } = useLocalSearchParams<{ phone?: string; email?: string }>();
  return <AuthForm key={`${phone ?? ""}${email ?? ""}`} mode="login" prefill={{ phone, email }} />;
}
