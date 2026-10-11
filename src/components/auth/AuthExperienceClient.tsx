"use client";

import dynamic from "next/dynamic";
import type { AuthRole } from "@/lib/brand";

interface AuthExperienceClientProps {
  role: AuthRole;
  mode: "login" | "signup";
}

// Client-only: the layout depends on the viewport (phone screens vs the desktop two-column page).
const AppAuthNoSsr = dynamic<AuthExperienceClientProps>(
  () => import("./app/AppAuth").then((mod) => mod.AppAuth),
  {
    ssr: false,
    loading: () => <div className="min-h-dvh bg-app-canvas" />,
  },
);

export function AuthExperienceClient(props: AuthExperienceClientProps) {
  return <AppAuthNoSsr {...props} />;
}
