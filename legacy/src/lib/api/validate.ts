import { NextRequest, NextResponse } from "next/server";
import type { ZodSchema } from "zod";

export async function parseBody<T>(
  schema: ZodSchema<T>,
  req: NextRequest,
): Promise<{ data: T } | { error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Invalid JSON body" } },
      { status: 400 },
    )};
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    return { error: NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: firstIssue?.message ?? "Invalid request body",
          path: firstIssue?.path,
        },
      },
      { status: 422 },
    )};
  }

  return { data: result.data };
}
