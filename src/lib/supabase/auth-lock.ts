// Supabase guards its session with the browser's Web Locks (navigator.locks). Browsers that block site storage
// refuse that with "SecurityError: The request was denied." in the background, and sign-in never finishes starting.
// This tries the browser lock and, once it's refused, uses Supabase's in-tab lock instead for the rest of the visit.

export type AuthLock = <R>(name: string, acquireTimeout: number, fn: () => Promise<R>) => Promise<R>;

function isSecurityError(error: unknown) {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "SecurityError";
}

export function lockWithFallback(primary: AuthLock, fallback: AuthLock): AuthLock {
  let refused = false;
  return async (name, acquireTimeout, fn) => {
    if (refused) return fallback(name, acquireTimeout, fn);
    let started = false;
    try {
      return await primary(name, acquireTimeout, () => {
        started = true;
        return fn();
      });
    } catch (error) {
      // Only the lock itself being refused: an error from inside fn is the caller's, and fn must not run twice.
      if (started || !isSecurityError(error)) throw error;
      refused = true;
      return fallback(name, acquireTimeout, fn);
    }
  };
}
