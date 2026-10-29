"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/server-auth";
import { StaffError, inviteStaff, leaveTeam, removeStaff } from "@/lib/staff/staff.server";
import { storeSafeMessage } from "@/lib/app-session.server";

// Settings › Team (src/lib/staff/staff.server.ts).

type Result = { ok: true; message?: string } | { ok: false; error: string };

async function run(work: () => Promise<string | undefined>): Promise<Result> {
  try {
    const message = await work();
    revalidatePath("/home/settings");
    return { ok: true, message };
  } catch (error) {
    if (error instanceof StaffError) return { ok: false, error: await storeSafeMessage(error.message) };
    console.error("[staff]", error);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

export async function inviteStaffAction(input: { name: string; email: string }): Promise<Result> {
  const user = await requireRole(["seller"], "/login");
  return run(async () => {
    const { emailed, link } = await inviteStaff(user, { name: String(input?.name ?? ""), email: String(input?.email ?? "") });
    return emailed ? undefined : link;
  });
}

export async function removeStaffAction(staffId: string): Promise<Result> {
  const user = await requireRole(["seller"], "/login");
  return run(async () => {
    await removeStaff(user, String(staffId));
    return undefined;
  });
}

export async function leaveTeamAction(): Promise<Result> {
  const user = await requireRole(["seller"], "/login");
  return run(async () => {
    if (!user.staff) throw new StaffError("You're not on anyone else's team.");
    await leaveTeam(user.staff.userId);
    return undefined;
  });
}
