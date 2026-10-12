import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { LegalError } from "@/lib/legal/server";

// One error shape for the legal page routes: { error: { code, message } }.
export function legalFailure(error: unknown) {
  if (error instanceof LegalError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  if (error instanceof ZodError) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.issues[0]?.message ?? "Invalid request" } }, { status: 422 });
  console.error("[legal]", error);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong saving that. Try again." } }, { status: 500 });
}

export const noStore = () => NextResponse.json({ error: { code: "NO_STORE", message: "Create your store first" } }, { status: 404 });
export const notFound = () => NextResponse.json({ error: { code: "NOT_FOUND", message: "That legal page doesn't exist" } }, { status: 404 });
