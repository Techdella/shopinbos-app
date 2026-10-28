import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("@/sentry.edge.config");
  }
}

// Errors thrown in route handlers, server components, server actions and the proxy: to Sentry, and (on Node) to
// Admin › App errors with the real message, which the browser never gets in production (only a digest).
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  Sentry.captureRequestError(error, request, context);
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { recordServerError } = await import("@/lib/errors/service.server");
    await recordServerError(error, request, context);
  }
};
