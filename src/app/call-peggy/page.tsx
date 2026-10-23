import type { Metadata } from "next";
import { Mascot } from "@/components/app-ui";
import { PeggyCall } from "@/components/peggy/PeggyCall";

export const metadata: Metadata = { title: "Call Peggy · Shopinbos", robots: { index: false } };

// /call-peggy?t=…: a free voice call with Peggy, opened from the Shopinbos mobile app (the token from
// /api/mobile/peggy-call signs them in for this call only). Works in the phone's browser; needs the microphone.
export default async function CallPeggyPage(props: { searchParams?: Promise<{ t?: string }> }) {
  const token = (await props.searchParams)?.t ?? "";
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#0E2A38] px-4 py-10 font-app text-white">
      <div className="w-full max-w-[420px] text-center">
        <span className="mx-auto block h-24 w-24 overflow-hidden rounded-full bg-[#73D8C8] p-2"><Mascot name="peggy" mood="wave" className="h-full w-full" alt="" /></span>
        <h1 className="mb-1 mt-5 text-[28px] font-extrabold tracking-[-0.02em]">Call Peggy</h1>
        <p className="m-0 text-[15px] leading-[1.5] text-white/80">Peggy is Shopinbos&apos;s AI customer support. She&apos;ll talk you through getting set up, step by step. The call is free.</p>
        {token ? (
          <PeggyCall token={token} className="mt-7" />
        ) : (
          <p className="mt-7 rounded-[16px] bg-white/10 px-4 py-3 text-[14px]">Open this from the Shopinbos app to call Peggy.</p>
        )}
        <p className="mt-6 text-[13px] text-white/60">Tap Call, then allow the microphone. Prefer a person? WhatsApp +1 711-695-1381.</p>
      </div>
    </main>
  );
}
