import { View } from "react-native";
import { naira } from "@shared/onboarding";
import { HelpButton } from "@/components/Help";
import { EmptyState, ErrorState, LinkRow, LoadingBlock } from "@/components/kit";
import { confirmSignOut, Thumb } from "@/components/partner";
import { TabScreen } from "@/components/TabScreen";
import { Card, LinkButton, PillButton, T } from "@/components/ui";
import { router } from "expo-router";
import { capitalise, friendlyDay } from "@/lib/friendly";
import { fetchSupplierOrders, fetchSupplierOverview, type SupplierOrder } from "@/lib/supplier";
import { supplierOrderStage } from "@/lib/supplier-pure";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// Supplier Money (build spec 8A): what's coming to the bank, where it goes, recent orders, and the rows that used to
// be on More (verification, quotes, profile, team, settings). The bank form itself is on the web for now.

function orderTitle(order: SupplierOrder) {
  return order.kind === "dropship" ? order.items.map((item) => (item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name)).join(", ") : `${order.product.name} ×${order.quantity.toLocaleString("en-NG")}`;
}

export default function SupplierMoney() {
  const loaded = useLoad(async () => {
    const [overview, done] = await Promise.all([fetchSupplierOverview(), fetchSupplierOrders("done").catch(() => null)]);
    return { overview, recent: done ? [...done.dropship, ...done.wholesale].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8) : [] };
  });
  const data = loaded.data;

  return (
    <TabScreen title="Money" action={<HelpButton />} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      {loaded.loading && !data ? <LoadingBlock label="Loading your money…" /> : null}
      {loaded.error && !data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      {data ? (
        <View style={{ gap: 14 }}>
          <Card style={{ gap: 8 }}>
            <T style={{ color: colors.inkSoft, fontSize: 15 }}>Money you&apos;ve earned</T>
            <T weight="extrabold" style={{ fontSize: 34, letterSpacing: -0.8 }}>{naira(data.overview.earned)}</T>
            <T style={{ fontSize: 15, lineHeight: 21, color: colors.inkSoft }}>
              {data.overview.bank
                ? `Payouts go to ${data.overview.bank.bankName} ${data.overview.bank.account}.${data.overview.bank.ready ? "" : " We're checking this account."}`
                : "Add your bank account to get payouts."}
            </T>
            <T style={{ fontSize: 15, lineHeight: 21 }}>The shop pays first. We hold the money in escrow and pay you out after delivery.</T>
            <PillButton title={data.overview.bank ? "See my payouts" : "Add my bank"} tone={data.overview.bank ? "white" : "ink"} style={{ marginTop: 6 }} onPress={() => void openWeb("/supplier/payouts")} />
            <T style={{ color: colors.inkSoft, fontSize: 14, textAlign: "center" }}>Opens in your browser</T>
          </Card>

          <T weight="extrabold" style={{ fontSize: 17 }} accessibilityRole="header">Recent</T>
          {data.recent.length ? (
            <Card style={{ paddingVertical: 4 }}>
              {data.recent.map((order, index) => (
                <View key={order.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
                  <Thumb uri={order.kind === "dropship" ? order.items[0]?.image : order.product.image} size={40} />
                  <View style={{ flex: 1 }}>
                    <T weight="bold" style={{ fontSize: 15 }} numberOfLines={1}>{orderTitle(order)}</T>
                    <T style={{ color: colors.inkSoft, fontSize: 14.5 }} numberOfLines={1}>{order.shop} · {supplierOrderStage(order.status).toLowerCase()} · {capitalise(friendlyDay(order.createdAt))}</T>
                  </View>
                  <T weight="extrabold" style={{ fontSize: 15 }}>{naira(order.kind === "dropship" ? order.yourTotal : order.total)}</T>
                </View>
              ))}
            </Card>
          ) : (
            <EmptyState icon="coin" title="No money yet">When you send an order and it&apos;s delivered, the money shows here.</EmptyState>
          )}

          <T weight="extrabold" style={{ fontSize: 17 }} accessibilityRole="header">Your business</T>
          <Card style={{ paddingVertical: 2 }}>
            <LinkRow first icon="shield" label="Verification" hint="Your documents and review status" onPress={() => router.push("/supplier/verification")} />
            <LinkRow icon="chat" label="Messages with shops" onPress={() => router.push("/supplier/messages")} />
            <LinkRow icon="tag" label="Quote requests" hint="Shops asking for a price on a large order" onPress={() => router.push("/supplier/quotes")} />
            <LinkRow icon="coin" label="Wholesale price tiers" hint="Opens in your browser" onPress={() => void openWeb("/supplier/wholesale")} />
            <LinkRow icon="store" label="Business profile" hint="Logo and what you sell. Opens in your browser" onPress={() => void openWeb("/supplier/profile")} />
            <LinkRow icon="users" label="Team" hint="Who can manage orders. Opens in your browser" onPress={() => void openWeb("/supplier/team")} />
            <LinkRow icon="settings" label="Settings" hint="Notifications and account. Opens in your browser" onPress={() => void openWeb("/supplier/settings")} />
            <LinkRow icon="help" label="Help" hint="Chat with a person" onPress={() => router.push("/help")} />
          </Card>
          <LinkButton title="Log out" color={colors.danger} onPress={() => confirmSignOut()} />
        </View>
      ) : null}
    </TabScreen>
  );
}
