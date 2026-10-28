import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { List, Row, Tile } from "@/components/design";
import { CallPeggyButton } from "@/components/CallPeggyButton";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { useCanCallPeggy } from "@/lib/peggy-call";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { LanguageSheet } from "@/components/LanguagePicker";
import { confirmSignOut } from "@/components/partner";
import { Screen } from "@/components/Screen";
import { Card, LinkButton } from "@/components/ui";
import { TipsRow } from "@/components/learn/TipsRow";
import { levelName, useWords } from "@/components/supplier/DropshipKit";
import { fetchCredits } from "@/lib/familiar";
import { useLocale, useT } from "@/lib/i18n";
import { languageOf } from "@shared/i18n";
import { verificationStage } from "@/lib/partner-pure";
import { fetchSupplierLevel, fetchSupplierOverview, fetchSupplierSetup, fetchTeam } from "@/lib/supplier";
import { SUPPLY_CATEGORIES } from "@/lib/supplier-pure";
import { openSupportWhatsApp } from "@/lib/support";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Account ("Simple app, end to end" supplier prototype, the gear on Home): the business, where parcels leave from,
// Delivery (the shared Delivery hub at /delivery), the bank, the people on the account, then help, language and
// signing out. The rows that used to sit under Money ("Your business") live here too: verification, price requests,
// wholesale price tiers, the business profile and notifications, all in the app. "Familiar app": Rewards, the posts calendar,
// and the Rex and Peggy credit balance (shown only: never sold or pointed to in the app).
// Supplier & Dropship Rules: Your level (New → Trusted → Established), Delivery prices (partner rates or your own
// card by zone) and Seller branding (packing slips, stickers, custom packaging).

export default function SupplierAccount() {
  const t = useT("m_supplier", "m_partner", "common", "settings");
  const tu = useT("m_ui");
  const words = useWords();
  // The level row hides on a server without the level route.
  const level = useLoad(() => fetchSupplierLevel().catch(() => null));
  const locale = useLocale();
  const callPeggy = useCanCallPeggy();
  const [language, setLanguage] = useState(false);
  const loaded = useLoad(async () => {
    const [setup, overview] = await Promise.all([fetchSupplierSetup(), fetchSupplierOverview().catch(() => null)]);
    return { setup, overview };
  });
  const data = loaded.data;
  const setup = data?.setup;
  const bank = data?.overview?.bank;
  const categories = (setup?.categories ?? []).map((category) => {
    const index = SUPPLY_CATEGORIES.indexOf(category as (typeof SUPPLY_CATEGORIES)[number]);
    return index >= 0 ? t.dynamic(`setup.cat.${index}`, category) : category;
  });
  const verification = verificationStage(setup?.verificationStatus ?? "unverified", t);
  // Rex and Peggy credits: shown, never sold or pointed to in the app (app store payment rules,
  // docs/store-payments-audit.md). Hidden when the server doesn't have credits yet.
  const credits = useLoad(() => fetchCredits().catch(() => null));
  // The people on the account; the row hides on a server without the team route.
  const team = useLoad(() => fetchTeam().catch(() => null));

  async function chat() {
    if (!(await openSupportWhatsApp("Hello Shopinbos, I need help with my supplier account."))) router.push("/help/chat");
  }

  return (
    <Screen title={t("account.title")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      {loaded.loading && !data ? <LoadingBlock /> : null}
      {loaded.error && !data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}

      <List>
        <Row lead={<Tile icon="store" tone="gray" />} title={t("account.business")} sub={setup ? [setup.displayName || setup.businessName, categories.join(", ")].filter(Boolean).join(" · ") : undefined} onPress={() => router.push({ pathname: "/supplier/setup", params: { edit: "biz" } })} />
        <Row lead={<Tile icon="pin" tone="gray" />} title={t("account.sendFrom")} sub={setup ? [setup.address, setup.city].filter(Boolean).join(", ") || t("account.addAddress") : undefined} onPress={() => router.push({ pathname: "/supplier/setup", params: { edit: "pickup" } })} />
        <Row lead={<Tile icon="truck" tone="gray" />} title={t("account.delivery")} sub={t("account.deliverySub")} onPress={() => router.push("/delivery")} />
        <Row lead={<Tile icon="coin" tone="sky" />} title={words("rates.title", "Delivery prices")} sub={words("rates.row", "You never pay for delivery. Partner rates or your own.")} onPress={() => router.push("/supplier/delivery-prices")} />
        <Row lead={<Tile icon="tag" tone="lilac" />} title={words("brand.title", "Seller branding")} sub={words("brand.row", "Blind packing, packing slips and stickers")} onPress={() => router.push("/supplier/branding")} />
        {level.data ? <Row lead={<Tile icon="star" tone="peach" />} title={words("level.title", "Your level")} sub={levelName(level.data.level, words)} onPress={() => router.push("/supplier/level")} /> : null}
        <Row lead={<Tile icon="wallet" tone="gray" />} title={t("account.bank")} sub={bank ? `${bank.bankName} ${bank.account}` : t("account.addBank")} onPress={() => router.push(bank ? "/supplier/wallet" : { pathname: "/supplier/setup", params: { edit: "bank" } })} />
        {team.data ? <Row lead={<Tile icon="users" tone="gray" />} title={t("account.people")} sub={t("team.count", { count: team.data.members.length })} onPress={() => router.push("/supplier/team")} /> : null}
      </List>

      <List>
        <Row lead={<Tile icon="star" tone="butter" />} title={t("account.rewards")} sub={t("account.rewardsSub")} onPress={() => router.push("/rewards" as never)} />
        <Row lead={<Tile icon="clock" tone="lilac" />} title={t("account.posts")} sub={t("account.postsSub")} onPress={() => router.push("/posts" as never)} />
        {credits.data ? <Row lead={<Tile icon="sparkle" tone="peach" />} title={t("account.credits")} sub={`${t("account.creditsSub", { count: credits.data.balance })} · ${tu("credits.refill")}`} /> : null}
      </List>

      <List>
        <Row lead={<Tile icon="shield" tone="gray" />} title={t("money.verification")} sub={verification.label} onPress={() => router.push("/supplier/verification")} />
        <Row lead={<Tile icon="users" tone="gray" />} title={t("account.agreements")} sub={t("account.agreementsSub")} onPress={() => router.push("/supplier/agreements")} />
        <Row lead={<Tile icon="tag" tone="gray" />} title={t("account.priceRequests")} sub={t("money.quotesHint")} onPress={() => router.push("/supplier/quotes")} />
        <Row lead={<Tile icon="coin" tone="gray" />} title={t("money.tiers")} sub={t("tiers.sub")} onPress={() => router.push("/supplier/tiers")} />
        <Row lead={<Tile icon="image" tone="gray" />} title={t("money.profile")} sub={t("profile.sub")} onPress={() => router.push("/supplier/profile")} />
        <Row lead={<Tile icon="bell" tone="gray" />} title={t("account.notifications")} onPress={() => router.push("/notifications/settings")} />
        <Row lead={<Tile icon="globe" tone="gray" />} title={t("language.title")} sub={languageOf(locale).nativeName} onPress={() => setLanguage(true)} />
      </List>

      {/* Tips and tooltips on or off, the same switch as the seller's Settings. */}
      <Card style={{ paddingVertical: 2 }}>
        <TipsRow first />
      </Card>

      <List>
        {callPeggy ? <CallPeggyButton variant="row" /> : null}
        <Row lead={<Tile icon="chat" tone="ok" />} title={t("account.chat")} sub={t("account.chatSub")} onPress={() => void chat()} />
        <Row lead={<Tile icon="help" tone="gray" />} title={t("account.howDo")} onPress={() => router.push("/help")} />
      </List>

      <View style={{ alignItems: "center", gap: 4 }}>
        <LinkButton title={t("account.signOut")} color={colors.danger} onPress={() => confirmSignOut()} />
        <DeleteAccountButton />
      </View>
      <LanguageSheet visible={language} onClose={() => setLanguage(false)} />
    </Screen>
  );
}
