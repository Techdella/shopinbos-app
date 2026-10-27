// Korapay's liveness check before the selfie. This file is the fallback (web, where the React Native SDK doesn't
// run): no check, so the selfie is taken on its own and the server face-matches it; the team looks at it when
// liveness is switched on for the account. Phones use KoraLiveness.native.tsx, with the same exports.

export const LIVENESS_ON = false;

export type LivenessPass = { reference: string; passed: true };

export type LivenessStarter = {
  /** Opens the check; resolves with Korapay's reference when the face check passes, null when it doesn't. */
  start: (user: { firstName: string; lastName: string }) => Promise<LivenessPass | null>;
  /** The check's screen while it is open (render it once, anywhere in the step). */
  screen: null;
};

export function useKoraLiveness(): LivenessStarter {
  return { start: async () => null, screen: null };
}
