import { Stack } from "expo-router";
import { colors } from "@/theme";

// Delivery partner side of the app (/logistics/*): the dispatch tabs plus the screens pushed over them.
// RoleGuard keeps other roles out.
export default function LogisticsLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas }, animation: "slide_from_right" }} />;
}
