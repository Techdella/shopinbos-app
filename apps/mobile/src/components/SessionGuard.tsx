import "expo-sqlite/localStorage/install";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Modal, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { Notice, PillButton, T } from "@/components/ui";
import { api } from "@/lib/api";
import { signOutNow } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { DEFAULT_IDLE_MS, DEFAULT_LOCK_MS, lockDecision } from "@/lib/session-lock-pure";
import { colors } from "@/theme";

// Keeps a signed-in phone safe when it's left alone (lib/session-lock-pure.ts has the rules):
//   * after a few minutes away the app locks, and opens with Face ID, a fingerprint or the phone's PIN;
//     "Log out" is always there instead;
//   * a phone with no screen lock is signed out after an hour away;
//   * the server's own session limit ends the session for good (lib/api.ts signs out on SESSION_EXPIRED);
//   * an account that never said it's 18 or older is asked once (web src/lib/auth/age.ts).
// When the app was last used is kept in storage, so closing it doesn't reset the clock.

const LAST_ACTIVE_KEY = "shopinbos:last-active";

type Status = { appLockMs?: number; idleMs?: number; ageConfirmed?: boolean };

function readLastActive() {
  try {
    return Number(localStorage.getItem(LAST_ACTIVE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeLastActive(at = Date.now()) {
  try {
    localStorage.setItem(LAST_ACTIVE_KEY, String(at));
  } catch {
    // Storage unavailable: the in-memory clock still works while the app is open.
  }
}

/** The phone has a screen lock (PIN, pattern, Face ID or fingerprint) the app can ask for. */
async function deviceSecure() {
  try {
    return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

export function SessionGuard() {
  const t = useT("m_auth");
  const { session, loading } = useSession();
  const signedIn = Boolean(session);
  const [locked, setLocked] = useState(false);
  const [askAge, setAskAge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const limits = useRef({ lockMs: DEFAULT_LOCK_MS, idleMs: DEFAULT_IDLE_MS });
  const lastActive = useRef(0);
  // Signed out at some point in this run: the next sign-in is fresh, not a return after time away.
  const sawSignedOut = useRef(false);

  const refreshStatus = useCallback(async () => {
    // Also the session's check-in: an ended session answers SESSION_EXPIRED and lib/api.ts signs the phone out.
    const status = await api<Status>("/api/auth/activity", { method: "POST", json: {} }).catch(() => null);
    if (!status) return;
    if (typeof status.appLockMs === "number") limits.current.lockMs = status.appLockMs;
    if (typeof status.idleMs === "number") limits.current.idleMs = status.idleMs;
    setAskAge(status.ageConfirmed === false);
  }, []);

  const check = useCallback(async () => {
    const last = lastActive.current || readLastActive();
    const decision = last ? lockDecision({ awayMs: Date.now() - last, ...limits.current, deviceSecure: await deviceSecure() }) : "open";
    if (decision === "signout") {
      setLocked(false);
      await signOutNow();
      return;
    }
    if (decision === "lock") setLocked(true);
    else writeLastActive();
  }, []);

  const unlock = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: t("lock.prompt"), cancelLabel: t("lock.cancel") }).catch(() => ({ success: false }));
    setBusy(false);
    if (result.success) {
      lastActive.current = Date.now();
      writeLastActive(lastActive.current);
      setLocked(false);
      void refreshStatus();
    } else {
      setFailed(true);
    }
  }, [refreshStatus, t]);

  // Signed in (or the app opened signed in): check how long it's been away, then ask the server for its limits.
  useEffect(() => {
    if (loading) return;
    if (!signedIn) {
      setLocked(false);
      setAskAge(false);
      lastActive.current = 0;
      sawSignedOut.current = true;
      try {
        localStorage.removeItem(LAST_ACTIVE_KEY);
      } catch {
        // Nothing stored.
      }
      return;
    }
    if (sawSignedOut.current) {
      // Just signed in: the clock starts now.
      sawSignedOut.current = false;
      lastActive.current = Date.now();
      writeLastActive(lastActive.current);
      void refreshStatus();
      return;
    }
    void check().then(refreshStatus);
  }, [signedIn, loading, check, refreshStatus]);

  useEffect(() => {
    if (!signedIn) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void check().then(() => refreshStatus());
      } else if (!locked) {
        // Going to the background: the clock starts now (a locked app keeps its earlier time).
        lastActive.current = Date.now();
        writeLastActive(lastActive.current);
      }
    });
    return () => subscription.remove();
  }, [signedIn, locked, check, refreshStatus]);

  // Ask for the unlock as soon as the lock shows.
  useEffect(() => {
    if (locked) void unlock();
  }, [locked, unlock]);

  async function confirmAge() {
    setBusy(true);
    setFailed(false);
    const done = await api("/api/auth/age", { method: "POST", json: { confirm: true } }).then(() => true, () => false);
    setBusy(false);
    if (done) setAskAge(false);
    else setFailed(true);
  }

  if (!signedIn) return null;
  if (locked) {
    return (
      <Modal visible animationType="fade" onRequestClose={() => undefined}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, padding: 24, justifyContent: "center", gap: 16 }}>
          <View style={{ alignItems: "center", gap: 12 }}>
            <AppIcon name="lock" size={40} color={colors.ink} />
            <T weight="extrabold" style={{ fontSize: 24, textAlign: "center" }} accessibilityRole="header">{t("lock.title")}</T>
            <T style={{ fontSize: 15.5, lineHeight: 22, color: colors.inkSoft, textAlign: "center" }}>{t("lock.body")}</T>
          </View>
          {failed ? <Notice>{t("lock.failed")}</Notice> : null}
          <PillButton tone="accent" busy={busy} disabled={busy} onPress={() => void unlock()} testID="unlock">
            <T weight="extrabold" style={{ color: colors.ink, fontSize: 17 }}>{t("lock.unlock")}</T>
          </PillButton>
          <PillButton tone="white" size="md" disabled={busy} onPress={() => { setLocked(false); void signOutNow(); }} testID="lock-logout">
            <T weight="bold" style={{ fontSize: 15 }}>{t("lock.logout")}</T>
          </PillButton>
        </SafeAreaView>
      </Modal>
    );
  }
  if (askAge) {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={() => undefined}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
          <SafeAreaView edges={["bottom"]} style={{ backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 22, gap: 14 }}>
            <T weight="extrabold" style={{ fontSize: 21 }} accessibilityRole="header">{t("age.title")}</T>
            <T style={{ fontSize: 15, lineHeight: 22, color: colors.inkSoft }}>{t("age.body")}</T>
            {failed ? <Notice>{t("age.failed")}</Notice> : null}
            <PillButton tone="accent" busy={busy} disabled={busy} onPress={() => void confirmAge()} testID="age-yes">
              <T weight="extrabold" style={{ color: colors.ink, fontSize: 17 }}>{t("age.yes")}</T>
            </PillButton>
            <PillButton tone="white" size="md" disabled={busy} onPress={() => { setAskAge(false); void signOutNow(); }} testID="age-under">
              <T weight="bold" style={{ fontSize: 15 }}>{t("age.under")}</T>
            </PillButton>
          </SafeAreaView>
        </View>
      </Modal>
    );
  }
  return null;
}
