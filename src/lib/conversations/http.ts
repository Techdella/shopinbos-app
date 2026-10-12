import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { ConversationError } from "./service.server";

// Error envelope for the partner-messages routes.

export const MESSAGING_ROLES = ["seller", "supplier", "logistics_partner"] as const;

export function conversationError(error: unknown): NextResponse {
  if (error instanceof ConversationError) return apiError(error.code, error.message, error.status);
  console.error("Partner messages error:", error);
  return apiError("INTERNAL_ERROR", "Something went wrong. Try again.", 500);
}
