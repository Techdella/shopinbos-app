import "server-only";

import { createHash } from "node:crypto";
import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { browserLabel, errorDetails, errorFingerprint, errorKind, pagePattern } from "./friendly";

// Admin › App errors: storing what browsers report (src/lib/errors/report-client.ts) and what pages and API routes
// threw on the server (src/instrumentation.ts), with the signed-in account when there is one, and listing them for
// the team. In production the browser only gets "Minified React error #441" and a digest for a page that broke on
// the server; the server's row with the same digest carries the real message.

export const clientErrorSchema = z.object({
  name: z.string().max(120).default("Error"),
  message: z.string().min(1).max(2000),
  stack: z.string().max(6000).nullish(),
  kind: z.enum(["storage", "network", "update", "permission", "code"]).default("code"),
  source: z.enum(["shown", "unhandled", "boundary"]).default("shown"),
  shown: z.string().max(500).nullish(),
  digest: z.string().max(120).nullish(),
  trail: z.string().max(3000).nullish(),
  path: z.string().max(500).default("/"),
});

export type ClientErrorInput = z.infer<typeof clientErrorSchema>;

/** The signed-in account behind this request, if any (cookie session). Never throws. */
export async function reportingUser() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    return await db.user.findUnique({ where: { supabaseId: data.user.id }, select: { id: true, role: true } });
  } catch {
    return null;
  }
}

/** Store (or count again) one error. visitorKey groups anonymous visitors (a hash of IP and browser). */
export async function recordClientError(input: Omit<ClientErrorInput, "source"> & { source: ClientErrorInput["source"] | "server" }, who: { userId: string | null; role: string | null; userAgent: string | null; visitorKey: string }) {
  const fingerprint = createHash("sha256").update(errorFingerprint(input.message, input.path)).digest("hex").slice(0, 32);
  const id = createHash("sha256").update(`${fingerprint}|${who.userId ?? `anon:${who.visitorKey}`}${input.source === "server" ? "|server" : ""}`).digest("hex").slice(0, 32);
  const now = new Date();
  const fields = {
    role: who.role,
    kind: input.kind,
    source: input.source,
    name: input.name,
    message: input.message,
    shown: input.shown ?? null,
    stack: input.stack ?? null,
    digest: input.digest ?? null,
    trail: input.trail ?? null,
    path: input.path,
    userAgent: who.userAgent?.slice(0, 500) ?? null,
    browser: browserLabel(who.userAgent),
  };
  await db.clientError.upsert({
    where: { id },
    create: { id, fingerprint, userId: who.userId, pagePattern: pagePattern(input.path), ...fields, firstSeenAt: now, lastSeenAt: now },
    // Happening again re-opens it.
    update: { ...fields, count: { increment: 1 }, lastSeenAt: now, resolvedAt: null },
  });
}

/** What Next.js hands src/instrumentation.ts onRequestError. */
type ServerErrorRequest = { path: string; method: string; headers: Record<string, string | string[] | undefined> };
type ServerErrorContext = { routeType: "render" | "route" | "action" | "proxy" };

// Not failures: redirect(), notFound() and the like, and render bail-outs Next.js handles itself.
const NOT_FAILURES = /^(NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING)/;

const SERVER_SHOWN: Record<ServerErrorContext["routeType"], string> = {
  render: "The “Something went wrong” page with Try again.",
  route: "An error from the API (HTTP 500).",
  action: "The action failed.",
  proxy: "The page didn't open.",
};

function headerText(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.join("; ") : value ?? "";
}

/** The account whose session cookie came with the request, if any. Never throws. */
async function requestUser(cookieHeader: string) {
  if (!cookieHeader) return null;
  try {
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: { getAll: () => parseCookieHeader(cookieHeader).map(({ name, value }) => ({ name, value: value ?? "" })), setAll: () => undefined },
    });
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    return await db.user.findUnique({ where: { supabaseId: data.user.id }, select: { id: true, role: true } });
  } catch {
    return null;
  }
}

/** An error a page, server action or API route threw (src/instrumentation.ts onRequestError). Never throws. */
export async function recordServerError(error: unknown, request: ServerErrorRequest, context: ServerErrorContext) {
  try {
    const digest = error && typeof error === "object" && "digest" in error && typeof error.digest === "string" ? error.digest : null;
    if (NOT_FAILURES.test(digest ?? "")) return;
    const details = errorDetails(error);
    const user = await requestUser(headerText(request.headers.cookie));
    const userAgent = headerText(request.headers["user-agent"]) || null;
    await recordClientError(
      {
        ...details,
        kind: errorKind(error) ?? "code",
        source: "server",
        shown: SERVER_SHOWN[context.routeType] ?? null,
        digest,
        path: request.path.slice(0, 500) || "/",
      },
      { userId: user?.id ?? null, role: user?.role ?? null, userAgent, visitorKey: "server" },
    );
  } catch (cause) {
    console.error("[server-errors] couldn't record", cause);
  }
}

export type ErrorFilter = "open" | "fixed" | "all";

export async function listClientErrors(filter: ErrorFilter, query: string, take = 100) {
  const q = query.trim();
  const rows = await db.clientError.findMany({
    where: {
      ...(filter === "open" ? { resolvedAt: null } : filter === "fixed" ? { resolvedAt: { not: null } } : {}),
      ...(q ? { OR: [{ message: { contains: q, mode: "insensitive" as const } }, { path: { contains: q, mode: "insensitive" as const } }] } : {}),
    },
    orderBy: { lastSeenAt: "desc" },
    take,
  });
  const userIds = [...new Set(rows.map((row) => row.userId).filter((id): id is string => Boolean(id)))];
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true, phone: true, role: true } })
    : [];
  const byId = new Map(users.map((user) => [user.id, user]));
  // A page that broke on the server: the browser only knows the digest, the server's row has the real message.
  const digests = [...new Set(rows.filter((row) => row.digest && row.source !== "server").map((row) => row.digest!))];
  const serverRows = digests.length
    ? await db.clientError.findMany({ where: { source: "server", digest: { in: digests } }, select: { digest: true, message: true, stack: true } })
    : [];
  const byDigest = new Map(serverRows.map((row) => [row.digest!, row]));
  return rows.map((row) => ({
    ...row,
    user: row.userId ? byId.get(row.userId) ?? null : null,
    server: row.digest && row.source !== "server" ? byDigest.get(row.digest) ?? null : null,
  }));
}

export async function errorCounts() {
  const since = new Date(Date.now() - 24 * 3_600_000);
  const [open, today, people] = await Promise.all([
    db.clientError.count({ where: { resolvedAt: null } }),
    db.clientError.count({ where: { lastSeenAt: { gte: since } } }),
    db.clientError.findMany({ where: { resolvedAt: null, userId: { not: null } }, distinct: ["userId"], select: { userId: true }, take: 1000 }),
  ]);
  return { open, today, people: people.length };
}

/** Mark every row of this problem fixed (or open again). */
export async function setErrorFixed(fingerprint: string, fixed: boolean) {
  await db.clientError.updateMany({ where: { fingerprint }, data: { resolvedAt: fixed ? new Date() : null } });
}
