import type { ApiError, ApiList, ApiOne, ErrorCode } from '@shopinbos/validation';
import { NextResponse } from 'next/server';
import { z, type ZodType } from 'zod';

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  LOCKED: 423,
  INVALID_CODE: 400,
  UPSTREAM_FAILED: 502,
  INTERNAL: 500,
};

/** Throw from a handler to return a typed error envelope. */
export class HttpError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiOne<T>>({ data }, init);
}

export function list<T>(data: T[], meta: ApiList<T>['meta']) {
  return NextResponse.json<ApiList<T>>({ data, meta });
}

export function fail(code: ErrorCode, message: string, details?: unknown) {
  return NextResponse.json<ApiError>(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status: STATUS[code] },
  );
}

export async function parseJson<S extends ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError('BAD_REQUEST', 'Send a JSON body.');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new HttpError(
      'VALIDATION_FAILED',
      first?.message ?? 'Check the details and try again.',
      z.flattenError(parsed.error),
    );
  }
  return parsed.data;
}

/** Wraps a route handler: maps HttpError to the error envelope and hides unexpected errors. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.code, err.message, err.details);
      console.error('[api] unhandled error', err);
      return fail('INTERNAL', 'Something went wrong on our side. Try again.');
    }
  };
}
