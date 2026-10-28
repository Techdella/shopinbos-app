import { Redirect } from "expo-router";
import { View } from "react-native";
import { LoadingBlock } from "@/components/kit";
import { fetchLogisticsOverview } from "@/lib/logistics";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Where a delivery partner lands (homeFor → /logistics/home). No tab of its own any more: set-up while the company
// isn't set up (two questions: app/logistics/setup.tsx), otherwise Jobs ("Finish setting up" lists the rest).
// Everything Today showed now lives on Jobs (taking-jobs switch, set-up and verification prompts, late pay-in) and
// Money (cash to pay in, today's earnings).
export default function LogisticsLanding() {
  const overview = useLoad(fetchLogisticsOverview);
  if (overview.data) return <Redirect href={overview.data.partner.onboarded ? "/logistics/jobs" : "/logistics/setup"} />;
  if (overview.error) return <Redirect href="/logistics/jobs" />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, justifyContent: "center", padding: 20 }}>
      <LoadingBlock />
    </View>
  );
}
