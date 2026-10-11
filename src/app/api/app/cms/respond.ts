import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { CmsError } from "@/lib/cms/server";

// One error shape for the CMS routes: { error: { code, message, fields? } }.
export function cmsFailure(error: unknown) {
  if (error instanceof CmsError) {
    return NextResponse.json({ error: { code: error.status === 404 ? "NOT_FOUND" : error.status === 409 ? "CONFLICT" : "VALIDATION_ERROR", message: error.message, fields: error.fieldErrors } }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: error.issues[0]?.message ?? "Invalid request" } }, { status: 422 });
  }
  console.error("[cms]", error);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong saving that. Try again." } }, { status: 500 });
}

export const noStore = () => NextResponse.json({ error: { code: "NO_STORE", message: "Create your store first" } }, { status: 404 });
