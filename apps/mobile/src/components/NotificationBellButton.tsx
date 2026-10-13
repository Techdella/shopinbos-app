import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { AppIcon } from "@/components/icons";
import { T } from "@/components/ui";
import { fetchUnreadCount, getUnreadCount, onUnreadCount, setUnreadCount } from "@/lib/notifications";
import { colors } from "@/theme";

/** The bell in a screen header: unread count, opens Notifications. */
export function NotificationBellButton() {
  const [count, setCount] = useState(getUnreadCount());
  useEffect(() => onUnreadCount(setCount), []);
  useFocusEffect(
    useCallback(() => {
      void fetchUnreadCount().then(setUnreadCount).catch(() => null);
    }, []),
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count ? `Notifications, ${count} unread` : "Notifications"}
      onPress={() => router.push("/notifications")}
      hitSlop={6}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}
    >
      <AppIcon name="bell" size={21} />
      {count > 0 ? (
        <View style={{ position: "absolute", top: 2, right: 0, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.surface }}>
          <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 10.5, lineHeight: 13 }}>{count > 99 ? "99+" : String(count)}</T>
        </View>
      ) : null}
    </Pressable>
  );
}
