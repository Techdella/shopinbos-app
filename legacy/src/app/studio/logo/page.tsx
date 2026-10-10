import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Icon, MascotAvatar } from "@/components/ui";
import { LogoStudioClient } from "./LogoStudioClient";

export const dynamic = "force-dynamic";

export default async function LogoStudioPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);

  return (
    <AppFrame
      role="seller"
      storeName={workspace?.store?.name}
      storeSlug={workspace?.store?.slug ? `${workspace.store.slug}.shopinbos.shop` : undefined}
      storeInitial={workspace?.store?.name?.charAt(0)}
      userName={user.name}
      userInitials={user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead title="Logo Studio" sub="Generate AI-powered logos for your brand" />
        <LogoStudioClient storeName={workspace?.store?.name ?? "Your Store"} />
      </div>
    </AppFrame>
  );
}
