import { Screen } from "@/components/Screen";
import { SetupHelpRequest } from "@/components/SetupHelpRequest";

// "Connect your system": no technical settings for partners. They ask, and the Shopinbos team connects their
// delivery software for them (a support ticket with topic "setup").
export default function LogisticsConnect() {
  return (
    <Screen title="Connect your system" sub="Already use delivery software? Our team can connect it to Shopinbos for you, so jobs show up there automatically.">
      <SetupHelpRequest
        title="Connect your delivery software"
        description="Tell us which software you use and how to reach you. We'll do the rest."
        feature="logistics_api"
        softwareQuestion="Which software or app do you use?"
        softwarePlaceholder="e.g. Shipbubble, our own system"
      />
    </Screen>
  );
}
