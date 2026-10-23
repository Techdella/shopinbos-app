import * as Sentry from "@sentry/nextjs";
import { listenForUnhandledErrors } from "@/lib/errors/report-client";
import { ensureUsableStorage } from "@/lib/safe-storage";

// First, before anything reads it: browsers that deny site storage throw on window.sessionStorage/localStorage.
// Swap in memory storage so the app (and Sentry's replay) keep working, and send uncaught errors to Admin › App errors.
ensureUsableStorage();
listenForUnhandledErrors();

// Browser errors. Next loads this file on the client by itself; the DSN has to be NEXT_PUBLIC_ to reach the browser.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration(),
  ],
  spotlight: process.env.NODE_ENV === "development",
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
