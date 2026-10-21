"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { sellerPlan } from "@/lib/plans/gates.server";
import { ExceptionError, reassignDelivery } from "@/lib/logistics/exceptions.server";

// Delivery exceptions inbox (/home/logistics/exceptions): hand a stuck delivery to another partner.
export async function reassignDeliveryAction(formData: FormData) {
  const user = await requireRole(["seller"], "/login");
  const back = (query: string) => redirect(`/home/logistics/exceptions?${query}`);
  if (!(await sellerPlan(user.id)).limits.exceptionsInbox) back("error=" + encodeURIComponent("The exceptions inbox comes with the Growth plan."));
  try {
    await reassignDelivery(user.id, String(formData.get("bookingId") ?? ""), String(formData.get("partnerId") ?? ""));
  } catch (error) {
    if (error instanceof ExceptionError) back("error=" + encodeURIComponent(error.message));
    throw error;
  }
  revalidatePath("/home/logistics");
  revalidatePath("/home/logistics/exceptions");
  back("saved=1");
}
