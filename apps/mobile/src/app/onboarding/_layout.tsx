import { Stack } from "expo-router";
import { OnboardingProvider } from "@/components/OnboardingContext";
import { colors } from "@/theme";

export default function OnboardingLayout() {
  return (
    <OnboardingProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas }, animation: "slide_from_right" }} />
    </OnboardingProvider>
  );
}
