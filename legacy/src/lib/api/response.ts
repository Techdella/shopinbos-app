import { NextResponse } from "next/server";

// ─── Success responses ────────────────────────────────────────────────────────

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

export function okList<T>(
  data: T[],
  meta: { page: number; limit: number; total: number }
): NextResponse {
  const totalPages = meta.limit > 0 ? Math.ceil(meta.total / meta.limit) : 0;

  return NextResponse.json({
    data,
    pagination: {
      page: meta.page,
      limit: meta.limit,
      total: meta.total,
      totalPages,
      hasNextPage: meta.page < totalPages,
      hasPreviousPage: meta.page > 1,
    },
  });
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json({ data }, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

// ─── Error responses ──────────────────────────────────────────────────────────

const HTTP_STATUS: Record<string, number> = {
  BAD_REQUEST:          400,
  UNAUTHORIZED:         401,
  FORBIDDEN:            403,
  NOT_FOUND:            404,
  CONFLICT:             409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_ERROR:       500,
};

export function apiError(
  code: string,
  message: string,
  status?: number
): NextResponse {
  const httpStatus = status ?? HTTP_STATUS[code] ?? 400;
  return NextResponse.json({ error: { code, message } }, { status: httpStatus });
}

// ─── Pagination helpers ───────────────────────────────────────────────────────

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export function parsePagination(searchParams: URLSearchParams): PaginationParams {
  const page  = Math.max(1, parseInt(searchParams.get("page")  ?? "1",  10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  return { page, limit, skip: (page - 1) * limit };
}

// ─── Sort helpers ─────────────────────────────────────────────────────────────

export type SortOption = "trending" | "newest" | "margin" | "price_low" | "price_high" | "moq_low";

export function parseSort(searchParams: URLSearchParams): SortOption {
  const s = searchParams.get("sort") as SortOption;
  const valid: SortOption[] = ["trending", "newest", "margin", "price_low", "price_high", "moq_low"];
  return valid.includes(s) ? s : "trending";
}

export function sortToOrderBy(sort: SortOption) {
  switch (sort) {
    case "trending":   return { trendScore: "desc" as const };
    case "newest":     return { createdAt:  "desc" as const };
    case "price_low":  return { wholesalePrice: "asc"  as const };
    case "price_high": return { wholesalePrice: "desc" as const };
    case "moq_low":    return { moq: "asc" as const };
    default:           return { trendScore: "desc" as const };
  }
}
