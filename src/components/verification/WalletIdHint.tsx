import Link from "next/link";
import type { VerificationDoc } from "@shared/verification-docs";

// The owner's ID document can come from the Shopinbos Wallet ID check (Youverify) instead of a NIN slip upload
// (src/lib/kyb/identity-doc.server.ts). Shows that route, or that it's done.
export function WalletIdHint({ identityDoc, walletHref }: { identityDoc?: VerificationDoc; walletHref: string }) {
  if (identityDoc?.idCheck) {
    return (
      <div className="rounded-[16px] border border-app-line bg-app-canvas px-4 py-3 text-[14px] leading-[1.5]">
        <div className="font-extrabold">ID verified with your {identityDoc.idCheck.idType === "nin" ? "NIN" : "BVN"}</div>
        <div className="text-app-ink-soft">{identityDoc.idCheck.name} · checked in your Shopinbos Wallet. You don&apos;t need to upload an ID.</div>
      </div>
    );
  }
  if (identityDoc && ["approved", "submitted", "under_review"].includes(identityDoc.status)) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[16px] border border-app-line bg-white px-4 py-3 text-[14px] leading-[1.5]">
      <div className="min-w-0 flex-1 basis-[240px]">
        <div className="font-extrabold">Skip the ID upload</div>
        <div className="text-app-ink-soft">Verify your NIN or BVN in your Shopinbos Wallet. It takes a minute, and your ID document is approved straight away.</div>
      </div>
      <Link href={walletHref} className="inline-flex min-h-[40px] items-center rounded-full bg-app-ink px-4 text-[13.5px] font-extrabold text-white">Verify my ID</Link>
    </div>
  );
}
