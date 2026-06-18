import type { ReactNode } from "react";
import { db } from "@/lib/db/client";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ensureAppUserForSupabaseUser, appUserInputFromSupabaseUser } from "@/lib/auth/app-user";

export default async function SupplierLayout({ children }: { children: ReactNode }) {
  // If there's a logged-in supplier user but their Supplier row is missing
  // (e.g. role was changed externally without going through signup), create it now.
  // This is a silent guard — individual pages still own their own auth checks.
  try {
    const supabase = await getSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const user = await db.user.findUnique({
        where: { supabaseId: data.user.id },
        select: { id: true, role: true },
      });
      if (user?.role === "supplier") {
        const supplier = await db.supplier.findUnique({
          where: { userId: user.id },
          select: { id: true },
        });
        if (!supplier) {
          await ensureAppUserForSupabaseUser(appUserInputFromSupabaseUser(data.user));
        }
      }
    }
  } catch {
    // Never block the render — individual pages handle auth failures
  }

  return <>{children}</>;
}
