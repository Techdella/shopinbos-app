import { useEffect } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { DarkCard, Eyebrow, List, Row, Sub, Tile } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock, Picture } from "@/components/kit";
import { NotificationBellButton } from "@/components/NotificationBellButton";
import { PushPromptCard } from "@/components/PushPromptCard";
import { ChatTile } from "@/components/SupplierKit";
import { TabScreen } from "@/components/TabScreen";
import { T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { verificationStage } from "@/lib/partner-pure";
import { fetchSupplierOrders, fetchSupplierOverview, fetchUnreadMessages, type SupplierOrder } from "@/lib/supplier";
import { countWord, greetingKey, supplierOrderGroup } from "@/lib/supplier-pure";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Supplier Home ("Simple app, end to end" supplier prototype): who you are and the gear to Account, the dark
// "Coming to your bank" card (money shops paid that's waiting for delivery to be confirmed), and a "To do" list:
// new orders, new messages, price requests, low stock, and finishing the set-up. A new supplier is sent to the
// set-up wizard (/supplier/setup) once per launch until it's done.

let setupShown = false;

type Todo = { key: string; lead: React.ReactNode; title: string; sub: string; go: () => void };

export default function SupplierHome() {
  const t = useT("m_supplier", "m_partner", "common");
  const loaded = useLoad(async () => {
    const [overview, open, unread] = await Promise.all([
      fetchSupplierOverview(),
      fetchSupplierOrders("open").catch(() => null),
      fetchUnreadMessages().catch(() => 0),
    ]);
    const orders: SupplierOrder[] = open ? [...open.dropship, ...open.wholesale] : [];
    return { overview, fresh: orders.filter((order) => supplierOrderGroup(order) === "new").length, unread };
  });
  const data = loaded.data;
  const overview = data?.overview;
  const onboarded = overview?.supplier.onboarded ?? true;

  useEffect(() => {
    if (overview && !onboarded && !setupShown) {
      setupShown = true;
      router.push("/supplier/setup");
    }
  }, [overview, onboarded]);

  const todo: Todo[] = [];
  if (data && overview) {
    if (data.fresh) todo.push({ key: "new", lead: <Tile icon="box" tone="peach" />, title: t("home.newOrders", { count: data.fresh }), sub: t("home.newOrdersSub"), go: () => router.push({ pathname: "/supplier/orders", params: { view: "new" } }) });
    if (data.unread) todo.push({ key: "chat", lead: <ChatTile />, title: t("home.newMessages", { count: data.unread }), sub: t("home.newMessagesSub"), go: () => router.push("/supplier/messages") });
    for (const quote of overview.quotes) {
      todo.push({ key: `quote-${quote.id}`, lead: <Tile icon="tag" tone="blue" />, title: t("home.priceRequest", { pieces: countWord(quote.quantity, t) }), sub: t("home.priceRequestSub", { shop: quote.seller }), go: () => router.push({ pathname: "/supplier/quote/[id]", params: { id: quote.id } }) });
    }
    for (const product of overview.lowStock) {
      todo.push({ key: `low-${product.id}`, lead: <Tile icon="box" tone="warn" />, title: t("home.runningLow", { name: product.name }), sub: t("home.left", { count: product.stock }), go: () => router.push({ pathname: "/supplier/product/[id]", params: { id: product.id } }) });
    }
    if (!overview.supplier.onboarded) {
      todo.push({ key: "setup", lead: <Tile icon="store" tone="mint" />, title: t("home.finish"), sub: t("home.finishHint"), go: () => router.push("/supplier/setup") });
    } else if (overview.supplier.verificationStatus !== "verified") {
      const stage = verificationStage(overview.supplier.verificationStatus, t);
      todo.push({ key: "verify", lead: <Tile icon="shield" tone="mint" />, title: stage.label, sub: stage.hint, go: () => router.push("/supplier/verification") });
    }
    if (!overview.bank) todo.push({ key: "bank", lead: <Tile icon="wallet" tone="ok" />, title: t("home.addBank"), sub: t("home.addBankSub"), go: () => router.push({ pathname: "/supplier/setup", params: { edit: "bank" } }) });
  }

  const name = overview?.supplier.name ?? t("home.yourBusiness");
  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 46 }}>
      <Picture uri={overview?.supplier.logoUrl} name={name} size={44} shape="square" />
      <View style={{ flex: 1 }}>
        <T weight="semibold" style={{ fontSize: 13, color: colors.inkSoft }}>{t(greetingKey(new Date().getHours()))}</T>
        <T weight="extrabold" style={{ fontSize: 17 }} numberOfLines={1}>{name}</T>
      </View>
      <NotificationBellButton />
      <Pressable accessibilityRole="button" accessibilityLabel={t("home.account")} onPress={() => router.push("/supplier/account")} hitSlop={6} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}>
        <AppIcon name="settings" size={21} />
      </Pressable>
    </View>
  );

  return (
    <TabScreen header={header} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      <PushPromptCard who="supplier" when={Boolean(data)} />
      {loaded.loading && !data ? <LoadingBlock label={t("loading")} /> : null}
      {loaded.error && !data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}

      {data && overview ? (
        <>
          <DarkCard eyebrow={t("home.coming")} amount={naira(overview.owed ?? 0)} line={t("home.afterConfirm")} onPress={() => router.push("/supplier/money")} />

          <View style={{ gap: 10 }} testID="do-next">
            <Eyebrow>{t("home.todo")}</Eyebrow>
            {todo.length ? (
              <List>
                {todo.map((item) => <Row key={item.key} lead={item.lead} title={item.title} sub={item.sub} onPress={item.go} />)}
              </List>
            ) : (
              <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 18 }}>
                <Sub>{t("home.caughtUp")}</Sub>
              </View>
            )}
          </View>
        </>
      ) : null}
    </TabScreen>
  );
}
