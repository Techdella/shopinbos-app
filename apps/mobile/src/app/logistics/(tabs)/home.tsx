import { Redirect } from "expo-router";
import { View } from "react-native";
import { LoadingBlock } from "@/components/kit";
import { fetchLogisticsOverview } from "@/lib/logistics";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Where a delivery partner lands (homeFor → /logistics/home). No tab of its own any more: the 4-step sign-up
// (/logistics/verification) until "Your delivery" is saved, otherwise Jobs. Everything Today showed now lives on Jobs (taking-jobs switch, set-up and
// verification prompts, late pay-in) and Money (cash to pay in, today's earnings).
export default function LogisticsLanding() {
  const overview = useLoad(fetchLogisticsOverview);
  if (overview.data) return <Redirect href={overview.data.partner.onboarded ? "/logistics/jobs" : "/logistics/verification"} />;
  if (overview.error) return <Redirect href="/logistics/jobs" />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, justifyContent: "center", padding: 20 }}>
      <LoadingBlock />
    </View>
  );
}
