import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { getSupplierForUser } from "@/lib/role-queries";
import { AppPage } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { ShareStory } from "@/components/member-stories/ShareStory";
import { myStory } from "@/lib/member-messaging/stories.server";
import { firstNameOf } from "@/lib/member-messaging/tips-email";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Share your story" };

type Flash = { saved?: string; withdrawn?: string; deleted?: string; error?: string };

export default async function SupplierStoryPage(props: { searchParams?: Promise<Flash> }) {
  const user = await requireRole(["supplier"], "/supplier/login");
  const params = (await props.searchParams) ?? {};
  const [supplier, story] = await Promise.all([getSupplierForUser(user), myStory(user.id)]);
  const first = firstNameOf(user.name);
  return (
    <AppPage frame={supplierFrame(user, supplier)} title="Share your story" sub="Tell other suppliers what changed for you. Only with your say-so.">
      <ShareStory
        story={story}
        videos={[]}
        defaults={{ displayName: [first === "there" ? "" : first, supplier?.displayName].filter(Boolean).join(", "), city: supplier?.city ?? "" }}
        flash={{ saved: Boolean(params.saved), withdrawn: Boolean(params.withdrawn), deleted: Boolean(params.deleted), error: params.error?.slice(0, 200) ?? null }}
      />
    </AppPage>
  );
}
