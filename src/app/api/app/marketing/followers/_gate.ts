import "server-only";

import type { NextRequest } from "next/server";
import { apiError } from "@/lib/api/response";
import { appFromHeaders, featuresFor } from "@/lib/feature-switches.server";
import { APP_VERSION_HEADER } from "@shared/feature-switches";

/** Notify my followers is a pilot feature ("notify_followers"): off unless it's on for this account on this app. */
export async function followersOff(req: NextRequest, user: { id: string; role?: string | null }) {
  const version = req.headers.get(APP_VERSION_HEADER)?.trim().slice(0, 32) || null;
  const on = (await featuresFor(user, appFromHeaders(req.headers), version)).includes("notify_followers");
  return on ? null : apiError("NOT_FOUND", "Notify my followers isn't available for your shop yet.", 404);
}
