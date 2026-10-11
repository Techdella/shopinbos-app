import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { blogCollection, sellerStore } from "@/lib/cms/server";

export const dynamic = "force-dynamic";

// The old "Blog posts" screen. Posts now live in the Blog collection under Content.
export default async function BlogCmsPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await sellerStore(user.id);
  if (!store) redirect("/home/cms");
  const collection = await blogCollection(store.id);
  redirect(`/home/cms/${collection.id}`);
}
