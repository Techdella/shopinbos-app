"use client";

import { useState } from "react";
import { KycForm } from "@/components/wallet/WalletForms";

// "Verify you" during onboarding (sellers, suppliers, delivery partners): the Shopinbos Wallet ID check (BVN or NIN,
// Youverify, src/lib/wallet). One check serves everything: it opens card payments to the person's bank, and for a
// supplier or delivery partner it also approves their ID document (src/lib/kyb/identity-doc.server.ts).

export interface IdCheckState {
  verified: boolean;
  /** ID checks are configured (Youverify or Korapay). */
  checksReady: boolean;
  name?: string | null;
}

export function VerifyIdCard({ state, ownerName, onVerified }: { state: IdCheckState; ownerName: string; onVerified?: () => void }) {
  const [done, setDone] = useState(state.verified);
  const [first = "", ...rest] = ownerName.trim().split(/\s+/);

  if (done) {
    return (
      <div className="flex items-start gap-3 rounded-[18px] border border-app-line bg-white p-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-app-mint text-[16px] font-extrabold" aria-hidden>✓</span>
        <div>
          <div className="text-[15px] font-extrabold">Your ID is verified</div>
          <div className="text-[13.5px] text-app-ink-soft">{state.name ? `${state.name} · ` : ""}Checked against the national records. You won&apos;t need to do this again.</div>
        </div>
      </div>
    );
  }
  if (!state.checksReady) {
    return <p className="m-0 rounded-[18px] border border-app-line bg-white p-4 text-[14px] text-app-ink-soft">ID checks are being switched on. You can verify later from your Shopinbos Wallet.</p>;
  }
  return (
    <div className="rounded-[18px] border border-app-line bg-white p-4 sm:p-5">
      <div className="mb-3">
        <div className="text-[16px] font-extrabold">Verify your ID</div>
        <div className="text-[13.5px] leading-[1.45] text-app-ink-soft">Your NIN or BVN, checked against the national records in seconds. We keep only the last 4 digits.</div>
      </div>
      <KycForm
        defaultName={{ firstName: first, lastName: rest.join(" ") }}
        onVerified={() => {
          setDone(true);
          onVerified?.();
        }}
      />
    </div>
  );
}
