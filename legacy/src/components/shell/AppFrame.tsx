import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { GlobalTopBar } from "./GlobalTopBar";
import { RexDrawerProvider } from "@/components/rex/RexDrawerContext";
import { FirstRunWalkthrough } from "./FirstRunWalkthrough";
import { AnnouncementBanner } from "@/components/verification/AnnouncementBanner";
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
  verificationStatus?: string;
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
  verificationStatus,
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
      <RexDrawerProvider chipMessage={_chipMessage}>
        <Sidebar
          role={role}
          storeName={storeName}
          storeSlug={storeSlug}
          storeInitial={storeInitial}
          storeLogoUrl={storeLogoUrl}
          userName={userName}
        />
        <FirstRunWalkthrough role={role} storeName={storeName} />

        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          <GlobalTopBar
            userName={userName}
            userInitials={userInitials}
            avatarUrl={avatarUrl}
            email={userEmail}
            role={roleLabel}
            searchPlaceholder={searchPlaceholder}
          />
          {verificationStatus && role !== "seller" && role !== "admin" && (
            <AnnouncementBanner
              role={role === "logistics_partner" ? "logistics_partner" : "supplier"}
              verificationStatus={verificationStatus}
              displayName={storeName}
            />
          )}
          <div className="flex-1 overflow-y-auto" style={{ background: "var(--canvas)" }}>
            {children}
          </div>
        </main>
      </RexDrawerProvider>
    </div>
  );
}
