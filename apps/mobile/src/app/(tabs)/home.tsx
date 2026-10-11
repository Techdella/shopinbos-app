import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { naira } from "@shared/onboarding";
import { AppIcon, type AppIconName } from "@/components/icons";
import { Card, Mascot, Notice, T, Wash } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { fetchDashboard, type Dashboard } from "@/lib/dashboard";
import { openPath, openWeb } from "@/lib/web";
import { colors, radii } from "@/theme";

// Seller home, following the "Seller app · iOS and Android" mockup.

function greeting() {
  const hour = (new Date().getUTCHours() + 1) % 24; // Lagos time
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

const TASK_ICON: Record<Dashboard["tasks"][number]["icon"], AppIconName> = { chat: "chat", mail: "mail", truck: "truck", box: "box", coin: "coin" };

const ACTIONS: Array<{ label: string; icon: AppIconName; run: () => unknown; primary?: boolean }> = [
  { label: "Add product", icon: "plus", run: () => router.push("/add-products"), primary: true },
  { label: "Record sale", icon: "receipt", run: () => router.push("/record-sale") },
  { label: "Find stock", icon: "search", run: () => openWeb("/marketplace") },
  { label: "Make video", icon: "play", run: () => openWeb("/home/video") },
  { label: "Labels", icon: "printer", run: () => openWeb("/home/labels") },
  { label: "Broadcast", icon: "megaphone", run: () => openWeb("/home/marketing/campaigns") },
  { label: "Ask Rex", icon: "sparkle", run: () => openWeb("/studio") },
  { label: "More", icon: "grid", run: () => router.push("/more") },
];

function RoundButton({ icon, label, onPress, dot }: { icon: AppIconName; label: string; onPress: () => void; dot?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
      <AppIcon name={icon} size={20} />
      {dot && <View style={{ position: "absolute", top: 11, right: 12, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, borderWidth: 1.5, borderColor: colors.surface }} />}
    </Pressable>
  );
}

export default function Home() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await fetchDashboard());
      setError(null);
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 403) return router.replace("/more");
      setError(loadError instanceof Error ? loadError.message : "Couldn't load your shop.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const firstName = data?.ownerName.split(/\s+/)[0] ?? "";
  const week = data?.daily.data.slice(-7) ?? [];
  const weekMax = Math.max(1, ...week);
  const doneCount = data?.checklist.filter((item) => item.done).length ?? 0;
  const checklist = data ? [...data.checklist.filter((i) => i.done), ...data.checklist.filter((i) => !i.done)].slice(0, 5) : [];

  return (
    <View style={{ flex: 1 }}>
      <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: 320 }}>
        <Wash />
      </View>
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" }}>
              <T weight="extrabold" style={{ fontSize: 18, color: colors.accentInk }}>{(firstName || "S").charAt(0)}</T>
            </View>
            <View style={{ flex: 1 }}>
              <T style={{ color: colors.inkSoft, fontSize: 13 }}>{greeting()}</T>
              <T weight="extrabold" style={{ fontSize: 17 }} numberOfLines={1}>{firstName || " "}</T>
            </View>
            <RoundButton icon="search" label="Find an order" onPress={() => router.push("/orders")} />
            <RoundButton icon="bell" label="Notifications" onPress={() => void openWeb("/home/notifications")} dot={Boolean(data?.tasks.length)} />
          </View>

          <T style={{ fontSize: 34, lineHeight: 38, letterSpacing: -0.8, marginTop: 18 }} accessibilityRole="header">
            Your shop made{"\n"}
            <T weight="extrabold" style={{ fontSize: 34, lineHeight: 38, letterSpacing: -0.8 }}>{data ? naira(data.sales.today) : "…"} today</T>
          </T>

          <Pressable accessibilityRole="button" onPress={() => router.push("/peggy")} style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: radii.pill, paddingLeft: 10, paddingRight: 6, height: 54, marginTop: 16 }}>
            <Mascot name="peggy" size={34} />
            <T style={{ flex: 1, color: colors.inkSoft, fontSize: 15 }}>Ask Peggy about your shop</T>
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }}>
              <AppIcon name="mic" size={18} color="#FFFFFF" />
            </View>
          </Pressable>

          {error && <View style={{ marginTop: 14 }}><Notice>{error}</Notice></View>}

          {data && (
            <>
              <View style={{ backgroundColor: colors.ink, borderRadius: 26, padding: 18, marginTop: 18 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <T style={{ color: "rgba(255,255,255,0.75)" }}>This week · {naira(data.sales.week)}</T>
                  {data.sales.weekChange !== null && (
                    <View style={{ backgroundColor: data.sales.weekChange >= 0 ? colors.accent : "#3A3746", borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <T weight="bold" style={{ color: "#FFFFFF", fontSize: 12.5 }}>{data.sales.weekChange >= 0 ? "Up" : "Down"} {Math.abs(data.sales.weekChange)}%</T>
                    </View>
                  )}
                </View>
                <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, height: 76, marginTop: 14 }} accessibilityLabel={`Sales this week ${naira(data.sales.week)}`}>
                  {week.map((value, index) => (
                    <View key={index} style={{ flex: 1, height: `${Math.max(14, (value / weekMax) * 100)}%`, borderRadius: 10, backgroundColor: index === week.length - 1 ? colors.accent : "#38354A" }} />
                  ))}
                </View>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                  {[
                    ["Orders", data.counts.ordersToday],
                    ["Visitors", data.counts.visitorsToday],
                    ["Chats", data.counts.chatsToday],
                  ].map(([label, value]) => (
                    <View key={label} style={{ flex: 1, backgroundColor: "#24212F", borderRadius: 16, padding: 12 }}>
                      <T style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{label}</T>
                      <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 20, marginTop: 2 }}>{String(value)}</T>
                    </View>
                  ))}
                </View>
              </View>

              <View style={{ backgroundColor: colors.mintTint, borderRadius: 26, padding: 16, marginTop: 14, gap: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 2 }}>
                  <Mascot name="peggy" size={44} />
                  <View style={{ flex: 1 }}>
                    <T weight="extrabold" style={{ fontSize: 15 }}>
                      {data.tasks.length ? `Peggy needs you for ${data.tasks.length} thing${data.tasks.length === 1 ? "" : "s"}` : "Nothing needs you right now"}
                    </T>
                    <T style={{ color: colors.inkSoft, fontSize: 13 }}>{data.tasks.length ? "Tap one to sort it out" : "Orders, stock and messages all look fine"}</T>
                  </View>
                </View>
                {data.tasks.map((task) => (
                  <Pressable key={task.key} accessibilityRole="button" onPress={() => void openPath(task.action?.href ?? task.href)} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12 }}>
                    {task.image ? <Image source={{ uri: task.image }} style={{ width: 40, height: 40, borderRadius: 10 }} contentFit="cover" /> : <AppIcon name={TASK_ICON[task.icon]} size={20} />}
                    <View style={{ flex: 1 }}>
                      <T weight="extrabold" style={{ fontSize: 15 }} numberOfLines={1}>{task.title}</T>
                      <T style={{ color: colors.inkSoft, fontSize: 13 }} numberOfLines={1}>{task.hint}</T>
                    </View>
                    {task.action ? (
                      <View style={{ backgroundColor: colors.ink, borderRadius: radii.pill, paddingHorizontal: 14, paddingVertical: 9 }}>
                        <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 13 }}>{task.action.label}</T>
                      </View>
                    ) : (
                      <AppIcon name="chevron" size={18} color={colors.inkSoft} />
                    )}
                  </Pressable>
                ))}
              </View>

              <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 16, marginTop: 20 }}>
                {ACTIONS.map((action) => (
                  <Pressable key={action.label} accessibilityRole="button" onPress={() => void action.run()} style={{ width: "25%", alignItems: "center", gap: 7 }}>
                    <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: action.primary ? colors.accent : colors.surface, alignItems: "center", justifyContent: "center" }}>
                      <AppIcon name={action.icon} size={21} color={action.primary ? "#FFFFFF" : colors.ink} strokeWidth={action.primary ? 2.4 : 1.9} />
                    </View>
                    <T weight="semibold" style={{ fontSize: 12.5 }}>{action.label}</T>
                  </Pressable>
                ))}
              </View>

              <Card style={{ marginTop: 20, borderRadius: 24 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <T weight="extrabold" style={{ fontSize: 17 }}>Finish setting up</T>
                  <T style={{ color: colors.inkSoft }}>{doneCount} of {data.checklist.length} done</T>
                </View>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.canvas, marginTop: 12, overflow: "hidden" }}>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.success, width: `${(doneCount / Math.max(1, data.checklist.length)) * 100}%` }} />
                </View>
                {checklist.map((item, index) => (
                  <View key={item.key} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line, marginTop: index ? 0 : 6 }}>
                    {item.done ? <T weight="extrabold" style={{ color: colors.success }}>✓</T> : <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.toggleOff }} />}
                    <T weight={item.done ? "regular" : "semibold"} style={{ flex: 1, fontSize: 15, color: item.done ? colors.inkSoft : colors.ink, textDecorationLine: item.done ? "line-through" : "none" }}>{item.label}</T>
                    {!item.done && (
                      <Pressable accessibilityRole="button" onPress={() => void openPath(item.href)} style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radii.pill, paddingHorizontal: 14, paddingVertical: 8 }}>
                        <T weight="extrabold" style={{ fontSize: 13 }}>Set up</T>
                      </Pressable>
                    )}
                  </View>
                ))}
              </Card>

              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 22, marginBottom: 12 }}>
                <T weight="extrabold" style={{ fontSize: 19 }}>Selling fast</T>
                <Pressable onPress={() => router.push("/products")} hitSlop={8}><T weight="extrabold" style={{ color: colors.accentInk }}>See all</T></Pressable>
              </View>
              {data.sellingFast.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                  {data.sellingFast.map((product) => (
                    <View key={product.id} style={{ width: 150 }}>
                      <View style={{ width: 150, height: 150, borderRadius: 18, backgroundColor: colors.lilac, overflow: "hidden" }}>
                        {product.image && <Image source={{ uri: product.image }} style={{ width: "100%", height: "100%" }} contentFit="cover" />}
                        <View style={{ position: "absolute", left: 8, bottom: 8, backgroundColor: product.stock.low ? colors.peach : colors.surface, borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 4 }}>
                          <T weight="bold" style={{ fontSize: 11.5, color: product.stock.low ? colors.accentInk : colors.ink }}>{product.stock.label}</T>
                        </View>
                      </View>
                      <T weight="bold" style={{ marginTop: 8, fontSize: 14 }} numberOfLines={1}>{product.name}</T>
                      <T weight="extrabold" style={{ fontSize: 14 }}>{naira(product.price)}</T>
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <Card><T style={{ color: colors.inkSoft }}>Your best sellers show up here after the first sales.</T></Card>
              )}

              {data.imports.length > 0 && (
                <Pressable onPress={() => void openWeb("/home/dropship")} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 20, padding: 14, marginTop: 16 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" }}>
                    <AppIcon name="truck" size={20} color={colors.accentInk} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T weight="extrabold" style={{ fontSize: 15 }}>{data.imports.length} import{data.imports.length === 1 ? "" : "s"} on the way</T>
                    <T style={{ color: colors.inkSoft, fontSize: 13 }} numberOfLines={1}>{data.imports[0].product} from {data.imports[0].supplier}</T>
                  </View>
                  <AppIcon name="chevron" size={18} color={colors.inkSoft} />
                </Pressable>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
