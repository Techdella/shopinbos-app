import { z } from 'zod';

/** API envelope shapes (SPEC 8.1). */
export interface ApiList<T> {
  data: T[];
  meta: { page: number; limit: number; total: number };
}
export interface ApiOne<T> {
  data: T;
}
export interface ApiError {
  error: { code: ErrorCode; message: string; details?: unknown };
}

export const ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'LOCKED',
  'INVALID_CODE',
  'UPSTREAM_FAILED',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
