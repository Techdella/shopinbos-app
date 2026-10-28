import { redirect } from "next/navigation";

// Delivery partners sign up in one flow (/logistics/verification: You, Bank, Your delivery, Review). Links and gates
// that still point at the old set-up wizard land there, keeping any sign-up intent.
export default async function LogisticsOnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) if (typeof value === "string") params.set(key, value);
  const query = params.toString();
  redirect(`/logistics/verification${query ? `?${query}` : ""}`);
}
