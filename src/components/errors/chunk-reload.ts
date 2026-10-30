// Recovering from a new deployment. A tab opened before a deploy still asks for the old build's JS chunks
// and server actions, which no longer exist; one full reload picks up the new build. Pure (no imports) so it
// is unit-tested; the sessionStorage guard lives in useDeployRecovery.

/** sessionStorage key holding the time of the last automatic reload. */
export const CHUNK_RELOAD_KEY = "sbx:chunk-reload-at";

/** A second failure this soon after an automatic reload shows the error page instead of reloading again. */
export const CHUNK_RELOAD_COOLDOWN_MS = 2 * 60 * 1000;

const STALE_BUILD_PATTERNS = [
  /Loading (CSS )?chunk [\w-]+ failed/i,
  /Loading chunk/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /Failed to find Server Action/i,
  // Next.js 16 in the browser: the old page called a server action the new deployment renamed.
  /Server Action "?[\w-]*"? was not found on the server/i,
  // webpack asked for a module the old page's chunk list doesn't have (Chrome, then Safari wording).
  /Cannot read properties of undefined \(reading 'call'\)/i,
  /undefined is not an object \(evaluating '[\w$.]+\[[\w$]+\]\.call'\)/i,
];

/** True when an error looks like the page is running an older build than the server (missing chunk or action). */
export function isStaleBuildError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === "ChunkLoadError" || name === "UnrecognizedActionError") return true;
  const text = typeof message === "string" ? message : "";
  return text.length > 0 && STALE_BUILD_PATTERNS.some((pattern) => pattern.test(text));
}

/** Reload once for a stale-build error, unless we already reloaded within the cooldown (so it can never loop). */
export function shouldAutoReload(error: unknown, lastReloadAt: string | null | undefined, now: number) {
  if (!isStaleBuildError(error)) return false;
  const last = Number(lastReloadAt);
  if (lastReloadAt && Number.isFinite(last) && now - last >= 0 && now - last < CHUNK_RELOAD_COOLDOWN_MS) return false;
  return true;
}
