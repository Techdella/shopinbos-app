import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { ShareStory } from "@/components/member-stories/ShareStory";
import { myRexVideos, myStory } from "@/lib/member-messaging/stories.server";
import { firstNameOf } from "@/lib/member-messaging/tips-email";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Share your story" };

type Flash = { saved?: string; withdrawn?: string; deleted?: string; error?: string };

export default async function SellerStoryPage(props: { searchParams?: Promise<Flash> }) {
  const user = await requireRole(["seller"], "/login");
  const params = (await props.searchParams) ?? {};
  const [store, story, videos] = await Promise.all([
    db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true, city: true } }),
    myStory(user.id),
    myRexVideos(user.id),
  ]);
  const first = firstNameOf(user.name);
  return (
    <SellerPage user={user} store={storeSummary(store)} title="Share your story" sub="Tell other businesses what changed for you. Only with your say-so.">
      <ShareStory
        story={story}
        videos={videos}
        defaults={{ displayName: [first === "there" ? "" : first, store?.name].filter(Boolean).join(", "), city: store?.city ?? "" }}
        flash={{ saved: Boolean(params.saved), withdrawn: Boolean(params.withdrawn), deleted: Boolean(params.deleted), error: params.error?.slice(0, 200) ?? null }}
      />
    </SellerPage>
  );
}
