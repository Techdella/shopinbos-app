import { Screen } from "@/components/Screen";
import { SetupHelpRequest } from "@/components/SetupHelpRequest";
import { useT } from "@/lib/i18n";

// "Connect your system": no technical settings for partners. They ask, and the Shopinbos team connects their
// delivery software for them (a support ticket with topic "setup").
export default function LogisticsConnect() {
  const t = useT("m_partner");
  return (
    <Screen title={t("menu.connect")} sub={t("connect.sub")}>
      <SetupHelpRequest
        title={t("connect.title")}
        description={t("connect.description")}
        feature="logistics_api"
        softwareQuestion={t("connect.question")}
        softwarePlaceholder={t("connect.placeholder")}
      />
    </Screen>
  );
}
