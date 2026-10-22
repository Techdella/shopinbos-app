import { setupStatus } from "@/lib/onboarding/setup-status.server";
import { stepQuestion } from "@/lib/onboarding/setup-peggy-pure";
import { peggyVoiceReady } from "@/lib/ai/peggy-voice.server";
import { SetupWithPeggy } from "./SetupWithPeggy";

/** The setup card with Peggy (chat and voice), on a dashboard until every step is done. */
export async function SetupWithPeggySlot({ userId, checklist = true }: { userId: string; checklist?: boolean }) {
  const status = await setupStatus(userId).catch(() => null);
  if (!status || !status.next) return null;
  return <SetupWithPeggy initial={status} question={stepQuestion(status.next.id, status.role, status.firstName)} voice={peggyVoiceReady()} checklist={checklist} />;
}
