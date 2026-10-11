"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

export function SignOutButton({ label = "Sign out", iconSize = 14, variant = "full" }: {
  label?: string;
  iconSize?: number;
  variant?: "full" | "icon";
}) {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    await supabase.auth.signOut();
    try {
      // On a shared computer the next person shouldn't see this account's shop name, photo or menu choices.
      localStorage.removeItem("shopinbos:identity");
      localStorage.removeItem("shopinbos:prefs");
    } catch {
      // Storage unavailable: nothing was cached.
    }
    router.push("/login");
  };

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleSignOut}
        title="Sign out"
        style={{
          width: 30, height: 30, borderRadius: 8, border: "1px solid var(--ink-150)",
          background: "var(--paper)", cursor: "pointer", color: "var(--ink-500)",
          display: "grid", placeItems: "center",
        }}
      >
        <Icon name="logout" size={14} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 14px", borderRadius: 10, border: "1px solid var(--danger-bg)",
        background: "var(--paper)", cursor: "pointer", color: "var(--danger)",
        fontFamily: "inherit", fontSize: 12.5, fontWeight: 600,
        transition: "background 0.12s",
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = "var(--danger-bg)"}
      onMouseLeave={(e) => e.currentTarget.style.background = "var(--paper)"}
    >
      <Icon name="logout" size={iconSize} />
      {label}
    </button>
  );
}
