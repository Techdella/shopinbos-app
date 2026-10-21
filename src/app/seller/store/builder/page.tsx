import { redirect } from "next/navigation";
import { StoreEditor } from "@/components/builder/StoreEditor";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

// The store builder. ?focus=header|footer opens on that part of the store; ?rex=menu|page opens Rex on it
// (Home › Menus → "Edit with Rex"). ?rex=1 is the older link to Rex Studio.
export default async function SellerStoreBuilderPage({
  searchParams,
}: {
  searchParams?: Promise<{ rex?: string; focus?: string }>;
}) {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace?.store) redirect("/onboarding?role=seller");

  const params = await searchParams;
  if (params?.rex === "1") redirect("/builder/rex");
  const rexTopic = params?.rex === "menu" || params?.rex === "page" ? params.rex : null;
  const focus = params?.focus === "header" || params?.focus === "footer" ? params.focus : rexTopic === "menu" ? "header" : null;

  return <StoreEditor initialRexTopic={rexTopic} initialFocus={focus} you={{ name: user.name ?? "", avatarUrl: user.avatarUrl ?? null }} />;
}
