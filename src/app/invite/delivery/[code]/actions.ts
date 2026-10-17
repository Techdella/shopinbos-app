"use server";

import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/server-auth";
import { InviteError, acceptSellerInvite } from "@/lib/logistics/invites.server";

// The signed-in delivery company accepts a seller's invite (src/lib/logistics/invites.server.ts).
export async function acceptDeliveryInvite(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const back = `/invite/delivery/${encodeURIComponent(code)}`;
  const user = await getCurrentAppUser();
  if (!user) redirect(`/logistics/login?next=${encodeURIComponent(back)}`);
  if (user.role !== "logistics_partner") redirect(`${back}?error=role`);
  try {
    await acceptSellerInvite(code, user.id);
  } catch (error) {
    if (error instanceof InviteError) redirect(`${back}?error=${encodeURIComponent(error.message)}`);
    throw error;
  }
  redirect("/logistics/dashboard?invite=accepted");
}
