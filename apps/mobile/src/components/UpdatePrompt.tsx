import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Modal, ScrollView, View } from "react-native";
import { usePathname, useRootNavigationState } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { useTourOpen } from "@/components/familiar/Tour";
import { Sheet } from "@/components/Sheet";
import { LinkButton, PillButton, T } from "@/components/ui";
import { currentBuild, fetchAppRelease, openAppStore, readUpdateSnooze, snoozeUpdate } from "@/lib/app-update";
import { useT } from "@/lib/i18n";
import { callOn, usePeggyCall } from "@/lib/peggy-call";
import { useSession } from "@/lib/session";
import { openSupportWhatsApp, SUPPORT_EMAIL } from "@/lib/support";
import { colors, fonts } from "@/theme";
import { availablePromptDue, releaseCheckDue, updateState, type AppRelease } from "@shared/app-release";

// "A new version of Shopinbos is ready" (shared/app-release.ts; set in Admin › App updates). Mounted once in the
// root layout. Asks on launch and when the app comes back to the front (at most once an hour):
//   available → a bottom sheet with "Update now" (opens Google Play or the App Store) and "Later" (asks again in 3 days, or for a newer build)
//   required  → a full-screen view with only "Update now" and a way to contact us: this build is too old to work.
// Never during the launch screen, a Peggy call or Home's first tour, and never in the way when the request fails (offline: nothing).

export function UpdatePrompt() {
  const { loading } = useSession();
  const ready = Boolean(useRootNavigationState()?.key);
  const pathname = usePathname();
  const calling = callOn(usePeggyCall());
  const touring = useTourOpen();
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [closedBuild, setClosedBuild] = useState<number | null>(null);
  const lastCheck = useRef<number | null>(null);

  const check = useCallback(async () => {
    const now = Date.now();
    if (!releaseCheckDue(lastCheck.current, now)) return;
    lastCheck.current = now;
    const next = await fetchAppRelease().catch(() => null);
    if (next) setRelease(next);
  }, []);

  useEffect(() => {
    void check();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });
    return () => sub.remove();
  }, [check]);

  // The launch screen (native splash, then "/" deciding where to go), a Peggy call and Home's first tour come first.
  if (!release || loading || !ready || pathname === "/" || calling || touring) return null;
  const state = updateState(currentBuild(), release);
  if (state === "required") return <UpdateRequired message={release.message} />;
  if (state !== "available" || closedBuild === release.latestBuild) return null;
  if (!availablePromptDue(readUpdateSnooze(), release.latestBuild, Date.now())) return null;
  return (
    <UpdateAvailable
      message={release.message}
      onLater={() => {
        snoozeUpdate(release.latestBuild);
        setClosedBuild(release.latestBuild);
      }}
      onUpdate={() => {
        setClosedBuild(release.latestBuild);
        void openAppStore();
      }}
    />
  );
}

function UpdateAvailable({ message, onLater, onUpdate }: { message?: string; onLater: () => void; onUpdate: () => void }) {
  const t = useT("m_ui");
  return (
    <Sheet visible onClose={onLater} title={t("update.title")} testID="update-available">
      <T style={{ fontSize: 16, lineHeight: 23, color: colors.inkSoft }}>{message || t("update.body")}</T>
      <PillButton title={t("update.now")} icon="sparkle" tone="accent" onPress={onUpdate} testID="update-now" style={{ marginTop: 8, alignSelf: "stretch" }} />
      <PillButton title={t("update.later")} tone="white" onPress={onLater} testID="update-later" style={{ alignSelf: "stretch" }} />
    </Sheet>
  );
}

function UpdateRequired({ message }: { message?: string }) {
  const t = useT("m_ui");
  const help = async () => {
    if (await openSupportWhatsApp("Hello Shopinbos, I need help updating the app.")) return;
    void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Help updating the Shopinbos app")}`).catch(() => null);
  };
  // No way past it: Android's back button does nothing here.
  return (
    <Modal visible animationType="fade" onRequestClose={() => undefined} statusBarTranslucent>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} testID="update-required">
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, gap: 14 }}>
          <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 6 }}>
            <AppIcon name="sparkle" size={34} color={colors.accentInk} />
          </View>
          <T accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 33, letterSpacing: -0.5, textAlign: "center" }}>{t("update.requiredTitle")}</T>
          <T style={{ fontSize: 16, lineHeight: 23, color: colors.inkSoft, textAlign: "center" }}>{t("update.requiredBody")}</T>
          {message ? <T weight="bold" style={{ fontSize: 15, lineHeight: 21, textAlign: "center" }}>{message}</T> : null}
          <PillButton title={t("update.now")} icon="sparkle" tone="accent" onPress={() => void openAppStore()} testID="update-now" style={{ marginTop: 12, alignSelf: "stretch" }} />
          <LinkButton title={t("update.help")} color={colors.inkSoft} onPress={() => void help()} testID="update-help" style={{ alignSelf: "center" }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
