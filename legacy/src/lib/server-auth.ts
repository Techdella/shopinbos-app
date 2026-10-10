import "server-only";

import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { appUserInputFromSupabaseUser, ensureAppUserForSupabaseUser } from "@/lib/auth/app-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AuthUser, Role } from "@/lib/auth/types";

export async function getCurrentAppUser(options?: { redirectTo?: string; expectedRole?: Role }): Promise<AuthUser | null> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      if (options?.redirectTo) redirect(options.redirectTo);
      return null;
    }

    const u = data.user;
    let user = await db.user.findUnique({
      where: { supabaseId: u.id },
      select: {
        id: true,
        supabaseId: true,
        email: true,
        role: true,
        name: true,
        avatarUrl: true,
        phone: true,
        city: true,
        country: true,
      },
    });

    if (!user) {
      const ensured = await ensureAppUserForSupabaseUser({
        ...appUserInputFromSupabaseUser(u),
        role: appUserInputFromSupabaseUser(u).role ?? options?.expectedRole,
      });
      user = await db.user.findUnique({
        where: { id: ensured.id },
        select: {
          id: true,
          supabaseId: true,
          email: true,
          role: true,
          name: true,
          avatarUrl: true,
          phone: true,
          city: true,
          country: true,
        },
      });
    }

    if (!user) {
      if (options?.redirectTo) redirect(options.redirectTo);
      return null;
    }

    return user as AuthUser;
  } catch {
    if (options?.redirectTo) redirect(options.redirectTo);
    return null;
  }
}

export async function requireRole(roles: Role[], redirectTo: string): Promise<AuthUser> {
  const user = await getCurrentAppUser({ redirectTo, expectedRole: roles.length === 1 ? roles[0] : undefined });

  if (!user || !roles.includes(user.role)) {
    redirect(redirectTo);
  }

  return user;
}
