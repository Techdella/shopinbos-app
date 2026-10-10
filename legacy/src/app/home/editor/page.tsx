import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { StoreEditor } from "@/components/builder/StoreEditor";

export const dynamic = "force-dynamic";

export default async function EditorPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  void workspace;

  return <StoreEditor />;
}
