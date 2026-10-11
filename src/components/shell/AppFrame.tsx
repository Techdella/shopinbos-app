import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { GlobalTopBar } from "./GlobalTopBar";
import { RexDrawerProvider } from "@/components/rex/RexDrawerContext";
import { GuidedTour } from "./GuidedTour";
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
  return (
    <div className="app-scope flex h-dvh w-full overflow-hidden bg-app-canvas font-app text-app-ink">
      <RexDrawerProvider chipMessage={_chipMessage}>
        <Sidebar
          role={role}
          storeName={storeName}
          storeSlug={storeSlug}
          storeInitial={storeInitial}
          storeLogoUrl={storeLogoUrl}
          userName={userName}
        />
        {/* Short walkthrough on the first visit to the portal's home page (replayable from Customise your menu). */}
        <GuidedTour role={role} />

        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          <GlobalTopBar
            userName={userName}
            userInitials={userInitials}
            avatarUrl={avatarUrl}
            email={userEmail}
            role={role}
            searchPlaceholder={searchPlaceholder}
          />
          {verificationStatus && role !== "seller" && role !== "admin" && (
            <AnnouncementBanner
              role={role === "logistics_partner" ? "logistics_partner" : "supplier"}
              verificationStatus={verificationStatus}
              displayName={storeName}
            />
          )}
          <div className="flex-1 overflow-y-auto bg-app-canvas">
            {children}
          </div>
        </main>
      </RexDrawerProvider>
    </div>
  );
}
