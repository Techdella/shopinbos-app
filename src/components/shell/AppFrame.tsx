import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { GlobalTopBar } from "./GlobalTopBar";
import { RexDrawerProvider } from "@/components/rex/RexDrawerContext";
import type { Role } from "@/lib/nav";

interface AppFrameProps {
  role?: Role;
  storeName?: string;
  storeSlug?: string;
  storeInitial?: string;
  storeLogoUrl?: string | null;
  userName?: string;
  userInitials?: string;
  avatarUrl?: string | null;
  userEmail?: string | null;
  searchPlaceholder?: string;
  chipMode?: string;
  chipRole?: string;
  chipTasks?: unknown[];
  chipMessage?: string;
  children: ReactNode;
}

export function AppFrame({
  role = "seller",
  storeName,
  storeSlug,
  storeInitial,
  storeLogoUrl,
  userName,
  userInitials,
  avatarUrl,
  userEmail,
  searchPlaceholder,
  chipMode: _chipMode,
  chipRole: _chipRole,
  chipTasks: _chipTasks,
  chipMessage: _chipMessage,
  children,
}: AppFrameProps) {
  const roleLabel =
    role === "supplier"
      ? "Supplier"
      : role === "logistics_partner"
      ? "Logistics"
      : role === "admin"
      ? "Admin"
      : "Seller";

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--canvas)" }}>
      <RexDrawerProvider>
        <Sidebar
          role={role}
          storeName={storeName}
          storeSlug={storeSlug}
          storeInitial={storeInitial}
          storeLogoUrl={storeLogoUrl}
          userName={userName}
        />

        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          <GlobalTopBar
            userName={userName}
            userInitials={userInitials}
            avatarUrl={avatarUrl}
            email={userEmail}
            role={roleLabel}
            searchPlaceholder={searchPlaceholder}
          />
          <div className="flex-1 overflow-y-auto" style={{ background: "var(--canvas)" }}>
            {children}
          </div>
        </main>
      </RexDrawerProvider>
    </div>
  );
}
