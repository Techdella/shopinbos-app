import type { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { SupportError } from "./service.server";

// Shared bits for the /api/support and /api/admin/support routes.

export const SUPPORT_ROLES = ["seller", "supplier", "logistics_partner", "admin"] as const;

export function supportError(error: unknown): NextResponse {
  if (error instanceof SupportError) return apiError(error.code, error.message, error.status);
  console.error("Support error:", error);
  return apiError("INTERNAL_ERROR", "Something went wrong. Try again.", 500);
}

/**
 * Reads JSON or multipart bodies the same way. Multipart: text fields as strings ("transcript" and other
 * JSON-looking fields parsed), every "file"/"files" entry as a File.
 */
export async function readBody(req: NextRequest): Promise<{ fields: Record<string, unknown>; files: File[] } | null> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return null;
    const fields: Record<string, unknown> = {};
    const files: File[] = [];
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") {
        fields[key] = key === "transcript" || key === "internal" || key === "rating" ? safeJson(value) : value;
      } else if ((key === "file" || key === "files") && value.size > 0) {
        files.push(value);
      }
    }
    return { fields, files };
  }
  const json = await req.json().catch(() => null);
  return json && typeof json === "object" ? { fields: json as Record<string, unknown>, files: [] } : null;
}

function safeJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
