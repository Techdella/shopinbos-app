import "server-only";

import type { NextRequest } from "next/server";
import { apiError } from "@/lib/api/response";
import { appFromHeaders } from "@/lib/feature-switches.server";
import { APP_VERSION_HEADER } from "@shared/feature-switches";
import { ResellNotReady, resellOnFor } from "./service.server";

/** Is resell on for this account on the app asking (the web when it sends no app header)? */
export function resellOnForRequest(req: NextRequest, userId: string) {
  const version = req.headers.get(APP_VERSION_HEADER)?.trim().slice(0, 32) || null;
  return resellOnFor(userId, appFromHeaders(req.headers), version);
}

export const resellOff = () => apiError("NOT_FOUND", "Resell isn't on for your account.", 404);

/** The answer for an error thrown by the resell service: "not set up yet" before the migration, else rethrown. */
export function resellFailure(error: unknown) {
  if (error instanceof ResellNotReady) return apiError("NOT_READY", "Resell isn't ready yet. Try again later.", 503);
  throw error;
}
