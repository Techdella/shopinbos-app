import { getRandomValues } from "expo-crypto";

// Supabase's PKCE sign-in (email codes, Google) checks `typeof crypto === "undefined"` and otherwise calls
// crypto.getRandomValues. Phones have no Web Crypto, but the Peggy call library (@elevenlabs/react-native →
// @livekit/react-native registerGlobals) creates a global `crypto` holding only randomUUID, so that call threw
// "undefined is not a function" on "Email me a code". Fill in getRandomValues from expo-crypto (the phone's secure
// random generator) whenever it's missing; a real one (the web) is left alone. Imported by lib/supabase.ts first.

type CryptoLike = { getRandomValues?: unknown; [key: string]: unknown };
const scope = globalThis as unknown as { crypto?: CryptoLike };

if (typeof scope.crypto?.getRandomValues !== "function") {
  const target: CryptoLike = scope.crypto ?? {};
  target.getRandomValues = getRandomValues;
  if (!scope.crypto) scope.crypto = target;
}
