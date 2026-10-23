import { setupStatus } from "@/lib/onboarding/setup-status.server";
import { stepQuestion } from "@/lib/onboarding/setup-peggy-pure";
import { peggyVoiceReady } from "@/lib/ai/peggy-voice.server";
import { PeggyCall } from "./PeggyCall";
import { SetupWithPeggy } from "./SetupWithPeggy";

/** The setup card with Peggy (chat and voice) on a dashboard until every step is done; then just "Call Peggy". */
export async function SetupWithPeggySlot({ userId, checklist = true }: { userId: string; checklist?: boolean }) {
  const status = await setupStatus(userId).catch(() => null);
  if (!status) return null;
  if (!status.next) return peggyVoiceReady() ? <PeggyCallCard /> : null;
  return <SetupWithPeggy initial={status} question={stepQuestion(status.next.id, status.role, status.firstName)} voice={peggyVoiceReady()} checklist={checklist} />;
}

/** "Need a hand? Call Peggy": the free voice call on its own, once setup is done. */
export function PeggyCallCard({ className = "mb-6" }: { className?: string }) {
  return (
    <section aria-label="Call Peggy" className={`flex flex-wrap items-center gap-4 rounded-[24px] border border-app-line bg-white p-5 ${className}`}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-app-forest text-[16px] font-extrabold text-white" aria-hidden>P</span>
      <div className="min-w-0 flex-1">
        <h2 className="m-0 text-[17px] font-extrabold">Need a hand? Talk to Peggy</h2>
        <p className="m-0 text-[13px] text-app-ink-soft">Shopinbos&apos;s AI support, on a free voice call.</p>
      </div>
      <PeggyCall size="md" className="w-full sm:w-auto sm:min-w-[240px]" />
    </section>
  );
}
