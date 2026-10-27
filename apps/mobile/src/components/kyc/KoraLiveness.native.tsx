import { useCallback, useRef, useState, type ReactElement } from "react";
import { Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { koraLivenessService } from "kora-identity-react-native-sdk";
import { colors } from "@/theme";

// Korapay's liveness check (kora-identity-react-native-sdk, a WebView with the phone's front camera) before the
// delivery partner's selfie. Switched on by EXPO_PUBLIC_KORAPAY_PUBLIC_KEY (pk_live_… / pk_test_…, the same key as
// the web's NEXT_PUBLIC_KORAPAY_PUBLIC_KEY). The passed check's reference goes with the selfie and NIN to
// /api/logistics/kyc/nin, where Korapay matches the selfie to the NIN photo; the team sees the reference.
// Needs a native build: react-native-webview, and the camera permission (expo-image-picker in app.json).

const KEY = process.env.EXPO_PUBLIC_KORAPAY_PUBLIC_KEY?.trim() ?? "";
export const LIVENESS_ON = /^pk_(test|live)_/.test(KEY);

export type LivenessPass = { reference: string; passed: true };

export type LivenessStarter = {
  start: (user: { firstName: string; lastName: string }) => Promise<LivenessPass | null>;
  screen: ReactElement | null;
};

/** Korapay's reference from the SDK's success result (result.data.reference). */
function referenceOf(result: unknown): string | null {
  const data = (result as { data?: { reference?: unknown } } | null)?.data;
  const reference = typeof data?.reference === "string" ? data.reference.trim() : "";
  return /^[A-Za-z0-9_.:-]{1,120}$/.test(reference) ? reference : null;
}

export function useKoraLiveness(): LivenessStarter {
  const [element, setElement] = useState<ReactElement | null>(null);
  const settle = useRef<((value: LivenessPass | null) => void) | null>(null);

  const finish = useCallback((value: LivenessPass | null) => {
    setElement(null);
    settle.current?.(value);
    settle.current = null;
  }, []);

  const start = useCallback(
    (user: { firstName: string; lastName: string }) =>
      new Promise<LivenessPass | null>((resolve, reject) => {
        if (!LIVENESS_ON) return resolve(null);
        settle.current = resolve;
        koraLivenessService
          .checkLiveness({
            publicKey: KEY,
            user: { firstName: user.firstName.trim() || "Partner", lastName: user.lastName.trim() || undefined },
            branding: { color: colors.ink },
            allowAudio: false,
            onSuccess: (result) => {
              const reference = referenceOf(result);
              finish(reference ? { reference, passed: true } : null);
            },
            onFailure: () => finish(null),
            onClose: () => finish(null),
          })
          .then(setElement)
          .catch((error: unknown) => {
            settle.current = null;
            reject(error);
          });
      }),
    [finish],
  );

  const screen = element ? (
    <Modal visible animationType="slide" onRequestClose={() => finish(null)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>{element}</SafeAreaView>
    </Modal>
  ) : null;
  return { start, screen };
}
