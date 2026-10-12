import { Stack } from "expo-router";
import { colors } from "@/theme";

// Supplier side of the app (/supplier/*): the tabs plus the screens pushed over them. RoleGuard keeps other roles out.
export default function SupplierLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas }, animation: "slide_from_right" }} />;
}
