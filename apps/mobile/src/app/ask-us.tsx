import { router, useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/Screen";
import { SetupHelpRequest } from "@/components/SetupHelpRequest";
import { ChoiceRow } from "@/components/Sheet";
import { T } from "@/components/ui";
import { SETUP_JOBS, setupJobWords, type SetupJobKey } from "@/lib/setup-jobs";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// "Ask us to set it up" (build spec 8A: Rex, Peggy and the team do the technical work, the seller confirms).
// Web addresses, connecting WhatsApp / Instagram / TikTok, product lists for Google and Facebook, and connecting
// other software never show their technical steps on mobile: the shared SetupHelpRequest opens a request instead.

export default function AskUs() {
  const { what } = useLocalSearchParams<{ what?: string }>();
  const t = useT("m_help");
  const key = what && what in SETUP_JOBS ? (what as SetupJobKey) : null;
  const job = key ? setupJobWords(key, t) : null;

  if (job) {
    return (
      <Screen title={t("askUs.jobTitle")} sub={t("askUs.jobSub")}>
        <SetupHelpRequest title={job.title} description={job.description} feature={job.feature} softwareQuestion={job.softwareQuestion} softwarePlaceholder={job.softwarePlaceholder} />
      </Screen>
    );
  }

  return (
    <Screen title={t("askUs.title")} sub={t("askUs.sub")}>
      {(Object.keys(SETUP_JOBS) as SetupJobKey[]).map((item) => {
        const words = setupJobWords(item, t);
        return <ChoiceRow key={item} icon={words.icon} tint={colors.peach} iconColor={colors.accentInk} title={words.title} sub={words.sub} onPress={() => router.setParams({ what: item })} />;
      })}
      <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{t("askUs.free")}</T>
    </Screen>
  );
}
