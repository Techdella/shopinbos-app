import { useLocalSearchParams } from "expo-router";
import { AuthForm } from "@/components/AuthForm";

export default function Signup() {
  const { method } = useLocalSearchParams<{ method?: string }>();
  return <AuthForm mode="signup" initialMethod={method === "email" ? "email" : "phone"} />;
}
