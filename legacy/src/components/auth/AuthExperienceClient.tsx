"use client";

import dynamic from "next/dynamic";
import type { AuthRole } from "@/lib/brand";

interface AuthExperienceClientProps {
  role: AuthRole;
  mode: "login" | "signup";
}

const AuthExperienceNoSsr = dynamic<AuthExperienceClientProps>(
  () => import("./AuthExperience").then((mod) => mod.AuthExperience),
  {
    ssr: false,
    loading: () => <div className="min-h-screen bg-[var(--color-paper)]" />,
  },
);

export function AuthExperienceClient(props: AuthExperienceClientProps) {
  return <AuthExperienceNoSsr {...props} />;
}
