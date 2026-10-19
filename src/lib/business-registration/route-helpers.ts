import "server-only";
import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/server-auth";
import { RegistrationError, type RegistrationRole } from "./service.server";

// Shared by the /api/business-registration routes: who may use them (a seller, supplier or delivery partner, for
// their own applications) and how errors come back ({ error: { code, message, fields? } }).

export async function registrationOwner() {
  const user = await getCurrentAppUser();
  if (!user || !["seller", "supplier", "logistics_partner"].includes(user.role)) return null;
  return { id: user.id, email: user.email ?? null, role: user.role as RegistrationRole, name: user.name ?? "" };
}

export function unauthorized() {
  return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in to your business account first." } }, { status: 401 });
}

export function registrationErrorResponse(error: unknown) {
  if (error instanceof RegistrationError) {
    return NextResponse.json({ error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } }, { status: error.status });
  }
  console.error("[business registration] request failed", error instanceof Error ? error.message : error);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Try again in a minute." } }, { status: 500 });
}

/** The File fields of a multipart form (empty inputs are skipped). */
export function formFiles<K extends string>(data: FormData, keys: readonly K[]) {
  return Object.fromEntries(keys.map((key) => {
    const value = data.get(key);
    return [key, value instanceof File && value.size > 0 ? value : null];
  })) as Partial<Record<K, File | null>>;
}

/** The text fields of a multipart form. */
export function formText(data: FormData) {
  const out: Record<string, string> = {};
  for (const [key, value] of data.entries()) if (typeof value === "string") out[key] = value;
  return out;
}
