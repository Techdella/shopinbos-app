import * as Sentry from "@sentry/nextjs";
import { listenForUnhandledErrors, reportClientError } from "@/lib/errors/report-client";
import { guardEffects } from "@/lib/errors/effect-guard";
import { ensureUsableStorage } from "@/lib/safe-storage";

// First, before anything reads it: browsers that deny site storage throw on window.sessionStorage/localStorage.
// Swap in memory storage so the app (and Sentry) keep working, and send uncaught errors to Admin › App errors.
ensureUsableStorage();
listenForUnhandledErrors();
// An effect that returns null (a library's) crashed whole pages on navigation ("i is not a function"): drop it and report.
guardEffects((error) => reportClientError(error, { source: "unhandled" }));

// Browser errors. Next loads this file on the client by itself; the DSN has to be NEXT_PUBLIC_ to reach the browser.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
  // Session replay is added only after "Allow analytics", fully masked (src/lib/analytics/replay.ts); never on
  // storefronts, whose shoppers have their own banner.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  sendDefaultPii: false,
  spotlight: process.env.NODE_ENV === "development",
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
