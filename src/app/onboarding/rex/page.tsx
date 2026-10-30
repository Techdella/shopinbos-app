import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { slugify } from "@/lib/workspace";
import intentRouting from "@/lib/intent-routing";
import { libraryFor, loadRexBuild } from "@/lib/onboarding/rex-build.server";
import { SellerRexBuild } from "@/components/onboarding/seller/SellerRexBuild";
import type { LoadedState } from "@/components/onboarding/seller/api";
import { entryFromQuery } from "@shared/seller-onboarding";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("onboarding");
  return { title: t("seller.metaTitle") };
}

// Seller onboarding on the web: "Rex builds your shop (step by step)", the phone's flow (design RB-01…RB-16) one
// question per screen (src/components/onboarding/seller/SellerRexBuild.tsx). The shop and the saved answers load here
// with the same server function as the phone's GET /api/mobile/onboarding (loadRexBuild), so the first screen is the
// one the seller left on, here or on the phone. Sellers mid-way through the older web questions carry on here too
// (their products and name are kept). ?intent=add_product&productSlug=…, ?ref=, ?invite= and ?source= from sign-up
// are passed on to the flow; ?redesign=1 is "Redesign with Rex"; ?screen= opens a screen (the review's "Fix it").
export default async function SellerOnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole(["seller"], "/login");
  const params = await searchParams;
  const flat = Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string"));

  // Launch payments started from the older flow still return here with ?launch=paid|failed.
  if (flat.launch) {
    const query = new URLSearchParams({ launch: flat.launch, ...(flat.error ? { error: flat.error } : {}) });
    redirect(`/home/start?${query}`);
  }

  let state = await loadRexBuild(user.id);
  if (!state.store) {
    const name = `${user.name.split(" ")[0] || "My"}'s Store`;
    await db.store.create({
      data: {
        userId: user.id,
        name,
        slug: `${slugify(name)}-${user.id.slice(0, 6)}`,
        country: user.country || "Nigeria",
        city: user.city || "Lagos",
        status: "draft",
        onboardingState: "NEW",
      },
    });
    state = await loadRexBuild(user.id);
  }
  if (!state.store) redirect("/home");

  const images = (state.products ?? []).map((product) => product.image).filter((url): url is string => Boolean(url));
  const initial = JSON.parse(JSON.stringify({ ...state, library: libraryFor(state.flow.categories, images) })) as LoadedState;
  const entry = entryFromQuery(new URLSearchParams(flat).toString());
  const continuation = flat.intent ? intentRouting.getContinuationPath({ role: "seller", ...flat }) : "/home";

  return <SellerRexBuild initial={initial} entry={entry} redesign={flat.redesign === "1"} startScreen={flat.screen ?? null} continuation={continuation} />;
}
