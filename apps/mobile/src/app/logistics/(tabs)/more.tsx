import { Linking, Pressable, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { NATIONWIDE } from "@shared/delivery-market";
import { List, Pill, Row, Small, Tile } from "@/components/design";
import type { AppIconName } from "@/components/icons";
import { LanguageRow } from "@/components/LanguagePicker";
import { confirmSignOut } from "@/components/partner";
import { CardButton, Initial, StatCard } from "@/components/PartnerKit";
import { useHelpSection } from "@/components/PartnerMore";
import { TabScreen } from "@/components/TabScreen";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { Card, LinkButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchLogisticsOverview, fetchMarket, fetchRiders } from "@/lib/logistics";
import { SERVICE_KEYS, stateLabel } from "@/lib/logistics-pure";
import { verificationStage } from "@/lib/partner-pure";
import { useLoad } from "@/lib/useLoad";
import { fetchWallet } from "@/lib/wallet";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// Business ("Delivery partner app" prototype `business`): the company with its Verified pill, rating / on time /
// failed from in-app deliveries, then Coverage, Services, Pickup points, Rate card, Riders and Payout account, the
// profile as sellers see it and Help. Below: everything the old menu had (businesses you work with, notifications,
// verification, quotes and the company profile on the web, connecting delivery software), language, sign out and
// delete my account.

function go(path: string) {
  if (path.startsWith("app:")) router.push(path.slice(4) as never);
  else if (path.startsWith("url:")) void WebBrowser.openBrowserAsync(path.slice(4));
  else if (path.startsWith("mailto:")) void Linking.openURL(path);
  else void openWeb(path);
}

export default function LogisticsBusiness() {
  const t = useT("m_partner", "common");
  const overview = useLoad(fetchLogisticsOverview);
  const market = useLoad(fetchMarket);
  const riders = useLoad(fetchRiders);
  const wallet = useLoad(fetchWallet);
  const help = useHelpSection();
  const partner = market.data?.partner;
  const stats = market.data?.stats;
  const name = partner?.name ?? overview.data?.partner.name ?? "";
  const status = partner?.verificationStatus ?? overview.data?.partner.verificationStatus ?? null;
  const stage = status ? verificationStage(status, t) : null;
  const list = riders.data?.riders ?? [];
  const free = list.filter((rider) => rider.active && rider.out && !rider.openJobs).length;
  const bank = wallet.data?.view.bank;
  const rows = market.data?.rateCard?.rows.length ?? 0;

  const places = (areas: string[]) => areas.map(stateLabel).join(", ");
  const coverage = partner
    ? t("biz.coverageSub", { from: places(partner.pickupAreas) || t("biz.notSet"), to: partner.deliveryAreas.includes(NATIONWIDE) ? t("biz.allNigeria") : places(partner.deliveryAreas) || t("biz.notSet") })
    : undefined;
  const services = partner ? partner.services.map((service) => t.dynamic(SERVICE_KEYS[service] ?? service, service)).join(" · ") || t("biz.notSet") : undefined;

  function refresh() {
    void overview.refresh();
    void market.reload();
    void riders.reload();
    void wallet.reload();
  }

  const more: { key: string; icon: AppIconName; path: string }[] = [
    { key: "notifications", icon: "bell", path: "app:/notifications" },
    { key: "verification", icon: "shield", path: "app:/logistics/verification" },
    { key: "quotes", icon: "tag", path: "/logistics/quotes" },
    { key: "profile", icon: "store", path: "/logistics/profile" },
    { key: "connect", icon: "send", path: "app:/logistics/connect" },
  ];

  const header = (
    <View style={{ flexDirection: "row", gap: 14, alignItems: "center", minHeight: 46 }}>
      <Initial name={name || "Shopinbos"} />
      <View style={{ flex: 1, gap: 4 }}>
        <T weight="bold" style={{ fontSize: 20 }} numberOfLines={1} accessibilityRole="header">{name || t("biz.title")}</T>
        {stage ? (
          <Pressable accessibilityRole="button" accessibilityLabel={stage.label} onPress={() => router.push("/logistics/verification")}>
            <Pill label={stage.label} tone={status === "verified" ? "ok" : "warn"} icon={status === "verified" ? "check" : undefined} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  return (
    <TabScreen header={header} refreshing={overview.refreshing} onRefresh={refresh}>
      {overview.data && !overview.data.partner.onboarded ? (
        <CardButton icon="truck" tint={colors.mintTint} iconBg="#FFFFFF" title={t("today.finish")} sub={t("today.finishHint")} onPress={() => router.push("/logistics/setup")} />
      ) : null}

      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatCard value={partner && partner.ratingCount > 0 ? `★ ${partner.rating.toFixed(1)}` : "—"} label={t("biz.deliveries", { count: stats?.completed ?? 0 })} />
        <StatCard value={stats?.onTimeRate != null ? `${stats.onTimeRate}%` : "—"} label={t("biz.onTime")} />
        <StatCard value={stats?.failedRate != null ? `${stats.failedRate}%` : "—"} label={t("biz.failed")} />
      </View>
      <Small style={{ marginTop: -10 }}>{t("biz.statsNote")}</Small>

      <List>
        <Row lead={<Tile icon="globe" />} title={t("biz.coverage")} sub={coverage} onPress={() => router.push("/logistics/coverage")} />
        <Row lead={<Tile icon="truck" />} title={t("biz.services")} sub={services} onPress={() => router.push("/logistics/services")} />
        <Row lead={<Tile icon="pin" />} title={t("biz.points")} sub={market.data ? t("biz.pointsSub", { count: market.data.pickupPoints.length }) : undefined} onPress={() => router.push("/logistics/points")} />
        <Row lead={<Tile icon="tag" />} title={t("biz.rates")} sub={market.data ? (rows ? t("biz.ratesSub", { count: rows }) : t("biz.noRates")) : undefined} onPress={() => router.push("/logistics/rates")} />
        <Row lead={<Tile icon="users" />} title={t("biz.riders")} sub={riders.data ? t("biz.ridersSub", { count: list.length, free }) : undefined} onPress={() => router.push("/logistics/team")} />
        <Row lead={<Tile icon="wallet" />} title={t("biz.payout")} sub={wallet.data ? (bank ? `${bank.bankName} ••• ${bank.accountEnding}` : t("biz.payoutNone")) : undefined} onPress={() => router.push("/logistics/payout")} />
      </List>

      <List>
        <Row lead={<Tile icon="store" />} title={t("biz.profile")} onPress={() => router.push("/logistics/profile")} />
        <Row lead={<Tile icon="link" />} title={t("conn.title")} sub={market.data ? t("conn.banner", { count: market.data.connections.length }) : undefined} onPress={() => router.push("/logistics/connections")} />
        <Row lead={<Tile icon="help" />} title={t("biz.help")} onPress={() => router.push("/help")} />
      </List>

      <List>
        {more.map((link) => (
          <Row key={link.key} lead={<Tile icon={link.icon} />} title={t.dynamic(`menu.${link.key}`)} sub={t.dynamic(`menu.${link.key}Hint`)} onPress={() => go(link.path)} />
        ))}
      </List>

      <List>
        {help.links.map((link) => (
          <Row key={link.label} lead={<Tile icon={link.icon} />} title={link.label} sub={link.hint} onPress={() => go(link.path)} />
        ))}
      </List>

      <Card style={{ paddingVertical: 2, borderRadius: 24, borderWidth: 1, borderColor: colors.line }}>
        <LanguageRow first />
      </Card>
      <LinkButton title={t("logOut")} color={colors.danger} onPress={() => confirmSignOut()} />
      <DeleteAccountButton />
    </TabScreen>
  );
}
