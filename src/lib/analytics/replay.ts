import * as Sentry from "@sentry/nextjs";

// Sentry's session replay starts only after "Allow analytics" (./consent.ts), and records with every piece of text,
// every input and all media masked: a replay shows where people clicked and what broke, never what they typed or read.

let started = false;

export function startReplay() {
  if (started || !process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  started = true;
  Sentry.addIntegration(Sentry.replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true }));
}

export function stopReplay() {
  if (!started) return;
  void Sentry.getReplay()?.stop();
}
