import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, View } from "react-native";
import { useRootNavigationState } from "expo-router";
import * as Notifications from "expo-notifications";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { T } from "@/components/ui";
import { fetchUnreadCount, markNotificationsRead, onUnreadCount, openNotificationTarget, setUnreadCount } from "@/lib/notifications";
import { configurePush, pushSupported, registerPushDevice, setAppBadge } from "@/lib/push";
import { riderToken } from "@/lib/rider";
import { useSession } from "@/lib/session";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Mounted once in the root layout. Keeps this phone's push token saved for whoever is signed in (or the rider),
// opens the right screen when a notification is tapped (also from a cold start), shows an in-app banner for pushes
// that arrive while the app is open, and keeps the app icon's badge equal to the unread count.

type PushData = { notificationId?: string | null; url?: string | null; route?: string | null };

function dataOf(notification: Notifications.Notification): PushData {
  return (notification.request.content.data ?? {}) as PushData;
}

export function PushManager() {
  const { session } = useSession();
  const uid = session?.user.id ?? null;
  const ready = Boolean(useRootNavigationState()?.key);
  const insets = useSafeAreaInsets();
  const t = useT("m_notifications", "common");
  const [banner, setBanner] = useState<{ title: string; body: string; data: PushData } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledColdStart = useRef(false);

  const refreshCount = useCallback(async () => {
    if (!uid) return;
    const count = await fetchUnreadCount().catch(() => null);
    if (count !== null) setUnreadCount(count);
  }, [uid]);

  const open = useCallback((data: PushData) => {
    if (data.notificationId) {
      void markNotificationsRead({ id: data.notificationId }).then((count) => {
        if (count !== null) setUnreadCount(count);
      });
    }
    openNotificationTarget(data);
  }, []);

  useEffect(() => {
    configurePush();
  }, []);

  // Save the token for whoever uses the app now (sign-in, account switch, or a rider's link).
  useEffect(() => {
    if (!pushSupported) return;
    if (uid || riderToken()) void registerPushDevice();
  }, [uid]);

  // Badge follows the unread count; refreshed when the app comes back to the front.
  useEffect(() => onUnreadCount((count) => void setAppBadge(count)), []);
  useEffect(() => {
    if (!uid) {
      void setAppBadge(0);
      return;
    }
    void refreshCount();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshCount();
    });
    return () => sub.remove();
  }, [uid, refreshCount]);

  // Taps on notifications (app in the background, or opened from one).
  useEffect(() => {
    if (!pushSupported || !ready) return;
    if (!handledColdStart.current) {
      handledColdStart.current = true;
      const last = Notifications.getLastNotificationResponse();
      if (last && last.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
        Notifications.clearLastNotificationResponse();
        open(dataOf(last.notification));
      }
    }
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      Notifications.clearLastNotificationResponse();
      open(dataOf(response.notification));
    });
    return () => sub.remove();
  }, [ready, open]);

  // While the app is open: our own banner instead of the system one.
  useEffect(() => {
    if (!pushSupported) return;
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const content = notification.request.content;
      setBanner({ title: content.title ?? "Shopinbos", body: content.body ?? "", data: dataOf(notification) });
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setBanner(null), 6000);
      void refreshCount();
    });
    return () => {
      sub.remove();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [refreshCount]);

  if (!banner) return null;
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + 6, left: 12, right: 12, zIndex: 1000, elevation: 12 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("push.bannerLabel", { title: banner.title, body: banner.body })}
        onPress={() => {
          const data = banner.data;
          setBanner(null);
          open(data);
        }}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          backgroundColor: colors.ink,
          borderRadius: 20,
          paddingHorizontal: 14,
          paddingVertical: 12,
          opacity: pressed ? 0.9 : 1,
          shadowColor: "#000",
          shadowOpacity: 0.2,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
        })}
      >
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
          <AppIcon name="bell" size={18} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 15 }} numberOfLines={1}>{banner.title}</T>
          {banner.body ? <T style={{ color: "rgba(255,255,255,0.8)", fontSize: 14 }} numberOfLines={2}>{banner.body}</T> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t("close")} hitSlop={10} onPress={() => setBanner(null)} style={{ minWidth: 32, minHeight: 32, alignItems: "center", justifyContent: "center" }}>
          <AppIcon name="x" size={16} color="#FFFFFF" />
        </Pressable>
      </Pressable>
    </View>
  );
}
