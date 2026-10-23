import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { getLogisticsPartnerForUser } from "@/lib/role-queries";
import { PartnerPage } from "@/components/logistics/kit";
import { ShareStory } from "@/components/member-stories/ShareStory";
import { myStory } from "@/lib/member-messaging/stories.server";
import { firstNameOf } from "@/lib/member-messaging/tips-email";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Share your story" };

type Flash = { saved?: string; withdrawn?: string; deleted?: string; error?: string };

export default async function LogisticsStoryPage(props: { searchParams?: Promise<Flash> }) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const params = (await props.searchParams) ?? {};
  const [partner, story] = await Promise.all([getLogisticsPartnerForUser(user), myStory(user.id)]);
  const first = firstNameOf(user.name);
  return (
    <PartnerPage frame={{ user, partner }} title="Share your story" sub="Tell other delivery partners what changed for you. Only with your say-so.">
      <ShareStory
        story={story}
        videos={[]}
        defaults={{ displayName: [first === "there" ? "" : first, partner?.companyName].filter(Boolean).join(", "), city: partner?.city ?? "" }}
        flash={{ saved: Boolean(params.saved), withdrawn: Boolean(params.withdrawn), deleted: Boolean(params.deleted), error: params.error?.slice(0, 200) ?? null }}
      />
    </PartnerPage>
  );
}
