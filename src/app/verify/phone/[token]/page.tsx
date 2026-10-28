import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { lookupHandoff } from "@/lib/kyc/handoff.server";
import { PhoneHandoffPage, PhoneHandoffProblem } from "@/components/kyc/PhoneHandoffPage";

// "Do it on your phone" (src/lib/kyc/handoff.ts): the QR code on a partner's or supplier's computer opens this page.
// No sign-in: the signed 20-minute token is the credential, and it only allows that one step (selfie or ID photo).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("handoff"))("page.metaTitle"), robots: { index: false, follow: false } };
}

export default async function VerifyOnPhonePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await lookupHandoff(decodeURIComponent(token));
  if (!found.ok) return <PhoneHandoffProblem reason={found.reason} />;
  return <PhoneHandoffPage token={decodeURIComponent(token)} info={found.info} />;
}
