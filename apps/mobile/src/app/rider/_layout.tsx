import { Stack } from "expo-router";
import { colors } from "@/theme";

// Shopinbos Riders (/rider/*): riders sign in with the private link their dispatcher shares, not an account.
export default function RiderLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas }, animation: "slide_from_right" }} />;
}
