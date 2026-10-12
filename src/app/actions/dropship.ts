"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppUser } from "@/lib/server-auth";
import { setDropshipPausedFor } from "@/lib/marketplace/dropship.server";

// Dropship page: pause a supplier-linked product (hidden from the store) or start selling it again.

type Result = { ok: true; status: "active" | "paused" } | { ok: false; error: string };

const Input = z.object({ relationshipId: z.string().min(1).max(64), pause: z.boolean() });

export async function setDropshipPaused(input: { relationshipId: string; pause: boolean }): Promise<Result> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That product couldn't be found." };
  const user = await getCurrentAppUser();
  if (!user || user.role !== "seller") return { ok: false, error: "Sign in again to change this." };
  const status = await setDropshipPausedFor(user.id, parsed.data.relationshipId, parsed.data.pause);
  if (!status) return { ok: false, error: "That product couldn't be found." };
  revalidatePath("/home/dropship");
  revalidatePath("/products");
  return { ok: true, status };
}
