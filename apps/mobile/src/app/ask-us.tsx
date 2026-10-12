import { router, useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/Screen";
import { SetupHelpRequest } from "@/components/SetupHelpRequest";
import { ChoiceRow } from "@/components/Sheet";
import { T } from "@/components/ui";
import { SETUP_JOBS, type SetupJobKey } from "@/lib/setup-jobs";
import { colors } from "@/theme";

// "Ask us to set it up" (build spec 8A: Rex, Peggy and the team do the technical work, the seller confirms).
// Web addresses, connecting WhatsApp / Instagram / TikTok, product lists for Google and Facebook, and connecting
// other software never show their technical steps on mobile: the shared SetupHelpRequest opens a request instead.

export default function AskUs() {
  const { what } = useLocalSearchParams<{ what?: string }>();
  const job = what && what in SETUP_JOBS ? SETUP_JOBS[what as SetupJobKey] : null;

  if (job) {
    return (
      <Screen title={job.title} sub={job.sub}>
        <SetupHelpRequest title={job.title} description={job.description} feature={job.feature} softwareQuestion={job.softwareQuestion} softwarePlaceholder={job.softwarePlaceholder} />
      </Screen>
    );
  }

  return (
    <Screen title="What should we set up?" sub="Pick one. A person from Shopinbos does it with you, and messages you when it's ready.">
      {(Object.keys(SETUP_JOBS) as SetupJobKey[]).map((key) => (
        <ChoiceRow key={key} icon={SETUP_JOBS[key].icon} tint={colors.peach} iconColor={colors.accentInk} title={SETUP_JOBS[key].title} sub={SETUP_JOBS[key].sub} onPress={() => router.setParams({ what: key })} />
      ))}
      <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>It&apos;s free. You don&apos;t need to know anything technical.</T>
    </Screen>
  );
}
