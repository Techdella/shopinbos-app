import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { productNewsSchema, type ProductNewsInput } from "./product-news";
import { ProductNewsError, newsImageHosts } from "./product-news.server";

// Shared by the /api/admin/product-news routes: body validation and error responses in the CLAUDE.md shape.

export async function readNewsInput(req: NextRequest): Promise<{ data: ProductNewsInput } | { error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: apiError("BAD_REQUEST", "Invalid JSON body", 400) };
  }
  return parseNewsInput(raw);
}

export function parseNewsInput(raw: unknown): { data: ProductNewsInput } | { error: NextResponse } {
  const parsed = productNewsSchema(newsImageHosts()).safeParse(raw);
  if (!parsed.success) return { error: apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Check the form", 422) };
  return { data: parsed.data };
}

export function newsError(error: unknown) {
  if (error instanceof ProductNewsError) return apiError(error.code, error.message, error.status);
  console.error("[product-news]", error);
  return apiError("INTERNAL_ERROR", "Something went wrong. Try again.", 500);
}
