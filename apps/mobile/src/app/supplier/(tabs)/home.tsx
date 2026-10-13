import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { HelpButton } from "@/components/Help";
import { AppIcon, type AppIconName } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { PartnerHeader, PartnerScroll } from "@/components/partner";
import { Card, T } from "@/components/ui";
import { MAX_DO_NEXT } from "@/lib/home-pure";
import { verificationStage } from "@/lib/partner-pure";
import { fetchSupplierOverview } from "@/lib/supplier";
import { countWord } from "@/lib/supplier-pure";
import { useLoad } from "@/lib/useLoad";
import { colors, radii } from "@/theme";
import { PushPromptCard } from "@/components/PushPromptCard";
import { NotificationBellButton } from "@/components/NotificationBellButton";

// Supplier Home (build spec 8A, "Simple supplier app"): the money shops have earned you, at most three "Do these
// next" items, and nothing else. Numbers from /api/mobile/supplier/overview.

type Next = { key: string; icon: AppIconName; title: string; hint: string; go: () => void };

export default function SupplierHome() {
  const overview = useLoad(fetchSupplierOverview);
  const data = overview.data;
  const verification = data ? verificationStage(data.supplier.verificationStatus) : null;

  const next: Next[] = [];
  if (data) {
    if (data.supplier.verificationStatus !== "verified" || !data.supplier.onboarded) {
      next.push({ key: "verify", icon: "shield", title: data.supplier.onboarded ? verification!.label : "Finish setting up", hint: data.supplier.onboarded ? verification!.hint : "Tell us what you sell, then add your documents.", go: () => router.push("/supplier/verification") });
    }
    if (data.counts.toPack) next.push({ key: "pack", icon: "box", title: `Pack ${data.counts.toPack} order${data.counts.toPack === 1 ? "" : "s"}`, hint: "Shops are waiting. Open Orders", go: () => router.push("/supplier/orders") });
    if (data.counts.wholesale) next.push({ key: "wholesale", icon: "bag", title: `${data.counts.wholesale} wholesale order${data.counts.wholesale === 1 ? "" : "s"} to send`, hint: "Open Orders", go: () => router.push("/supplier/orders") });
    const request = data.quotes[0];
    if (request) next.push({ key: "request", icon: "tag", title: `Quote request: ${request.seller} wants ${countWord(request.quantity)}`, hint: "Send your quote", go: () => router.push({ pathname: "/supplier/quote/[id]", params: { id: request.id } }) });
    const low = data.lowStock[0];
    if (low) next.push({ key: "low", icon: "box", title: low.stock === 0 ? `${low.name} is out of stock` : `${low.name} is low on stock`, hint: low.stock === 0 ? "Update your inventory so shops can keep selling it" : `Only ${low.stock} left in stock`, go: () => router.push({ pathname: "/supplier/product/[id]", params: { id: low.id } }) });
  }

  return (
    <PartnerScroll refreshing={overview.refreshing} onRefresh={() => void overview.refresh()}>
      <PartnerHeader eyebrow={data?.firstName ? `Good day, ${data.firstName}` : "Shopinbos"} name={data?.supplier.name ?? "Your business"} logoUrl={data?.supplier.logoUrl} right={<View style={{ flexDirection: "row", gap: 6 }}><NotificationBellButton /><HelpButton /></View>} />
      <PushPromptCard who="supplier" when={Boolean(data)} />

      {overview.loading && !data ? <LoadingBlock label="Loading…" /> : null}
      {overview.error && !data ? <ErrorState message={overview.error} onRetry={() => void overview.reload()} /> : null}

      {data ? (
        <>
          <Pressable accessibilityRole="button" onPress={() => router.push("/supplier/money")}>
            <Card style={{ gap: 4 }}>
              <T style={{ color: colors.inkSoft, fontSize: 15 }}>Money you&apos;ve earned</T>
              <T weight="extrabold" style={{ fontSize: 34, letterSpacing: -0.8 }} accessibilityRole="header">{naira(data.earned)}</T>
              <T style={{ color: colors.inkSoft, fontSize: 15 }}>From your dropship and wholesale orders</T>
            </Card>
          </Pressable>

          <T weight="extrabold" style={{ fontSize: 19, marginTop: 4 }} accessibilityRole="header">Do these next</T>
          {next.length ? (
            <View style={{ gap: 8 }} testID="do-next">
              {next.slice(0, MAX_DO_NEXT).map((item) => (
                <Pressable key={item.key} accessibilityRole="button" onPress={item.go} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: radii.card, padding: 14, opacity: pressed ? 0.85 : 1 })}>
                  <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" }}>
                    <AppIcon name={item.icon} size={20} color={colors.accentInk} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T weight="extrabold" style={{ fontSize: 16 }} numberOfLines={2}>{item.title}</T>
                    <T style={{ color: colors.inkSoft, fontSize: 15 }} numberOfLines={2}>{item.hint}</T>
                  </View>
                  <AppIcon name="chevron" size={18} color={colors.inkSoft} />
                </Pressable>
              ))}
            </View>
          ) : (
            <Card><T style={{ fontSize: 15, lineHeight: 22 }}>Nothing needs you right now. When a shop sells your product, we tell you here.</T></Card>
          )}

          <Pressable accessibilityRole="button" onPress={() => router.push("/supplier/messages")} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}>
            <AppIcon name="chat" size={20} />
            <T weight="bold" style={{ fontSize: 15, flex: 1 }}>Messages with shops</T>
            <AppIcon name="chevron" size={18} color={colors.inkSoft} />
          </Pressable>
        </>
      ) : null}
    </PartnerScroll>
  );
}
