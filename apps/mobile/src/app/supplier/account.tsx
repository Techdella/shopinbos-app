import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";
import { List, Row, Tile } from "@/components/design";
import { CallPeggyButton } from "@/components/CallPeggyButton";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { useCanCallPeggy } from "@/lib/peggy-call";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { LanguageSheet } from "@/components/LanguagePicker";
import { confirmSignOut } from "@/components/partner";
import { Screen } from "@/components/Screen";
import { LinkButton } from "@/components/ui";
import { emailTopUp, fetchCredits } from "@/lib/familiar";
import { useLocale, useT } from "@/lib/i18n";
import { languageOf } from "@shared/i18n";
import { verificationStage } from "@/lib/partner-pure";
import { fetchSupplierOverview, fetchSupplierSetup } from "@/lib/supplier";
import { SUPPLY_CATEGORIES } from "@/lib/supplier-pure";
import { openSupportWhatsApp } from "@/lib/support";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// Account ("Simple app, end to end" supplier prototype, the gear on Home): the business, where parcels leave from,
// Delivery (the shared Delivery hub at /delivery), the bank, the people on the account, then help, language and
// signing out. The rows that used to sit under Money ("Your business") live here too: verification, price requests,
// wholesale price tiers, the business profile and settings on the web. "Familiar app": Rewards, the posts calendar,
// and the Rex and Peggy credit balance with Top up (an email with how to top up on the website).

export default function SupplierAccount() {
  const t = useT("m_supplier", "m_partner", "common", "settings");
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
  // Rex and Peggy credits: shown, never sold in the app (Top up emails how to do it on the website). Hidden when
  // the server doesn't have credits yet.
  const credits = useLoad(() => fetchCredits().catch(() => null));
  const [topUp, setTopUp] = useState<{ busy: boolean; note: string | null }>({ busy: false, note: null });

  async function emailMe() {
    setTopUp({ busy: true, note: null });
    try {
      await emailTopUp();
      setTopUp({ busy: false, note: t("account.topUpSent") });
    } catch (error) {
      setTopUp({ busy: false, note: error instanceof Error ? error.message : t("account.topUpFailed") });
    }
  }

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
        <Row lead={<Tile icon="wallet" tone="gray" />} title={t("account.bank")} sub={bank ? `${bank.bankName} ${bank.account}` : t("account.addBank")} onPress={() => router.push(bank ? "/supplier/wallet" : { pathname: "/supplier/setup", params: { edit: "bank" } })} />
        <Row lead={<Tile icon="users" tone="gray" />} title={t("account.people")} sub={t("money.teamHint")} onPress={() => void openWeb("/supplier/team")} />
      </List>

      <List>
        <Row lead={<Tile icon="star" tone="butter" />} title={t("account.rewards")} sub={t("account.rewardsSub")} onPress={() => router.push("/rewards" as never)} />
        <Row lead={<Tile icon="clock" tone="lilac" />} title={t("account.posts")} sub={t("account.postsSub")} onPress={() => router.push("/posts" as never)} />
        {credits.data ? <Row lead={<Tile icon="sparkle" tone="peach" />} title={t("account.credits")} sub={t("account.creditsSub", { count: credits.data.balance })} /> : null}
        {credits.data ? (
          <Row
            lead={<Tile icon="mail" tone="gray" />}
            title={t("account.topUp")}
            sub={topUp.note ?? t("account.topUpSub")}
            right={topUp.busy ? <ActivityIndicator color={colors.ink} /> : undefined}
            onPress={topUp.busy ? undefined : () => void emailMe()}
          />
        ) : null}
      </List>

      <List>
        <Row lead={<Tile icon="shield" tone="gray" />} title={t("money.verification")} sub={verification.label} onPress={() => router.push("/supplier/verification")} />
        <Row lead={<Tile icon="tag" tone="gray" />} title={t("account.priceRequests")} sub={t("money.quotesHint")} onPress={() => router.push("/supplier/quotes")} />
        <Row lead={<Tile icon="coin" tone="gray" />} title={t("money.tiers")} sub={t("opensInBrowser")} onPress={() => void openWeb("/supplier/wholesale")} />
        <Row lead={<Tile icon="image" tone="gray" />} title={t("money.profile")} sub={t("money.profileHint")} onPress={() => void openWeb("/supplier/profile")} />
        <Row lead={<Tile icon="settings" tone="gray" />} title={t("settings")} sub={t("money.settingsHint")} onPress={() => void openWeb("/supplier/settings")} />
        <Row lead={<Tile icon="globe" tone="gray" />} title={t("language.title")} sub={languageOf(locale).nativeName} onPress={() => setLanguage(true)} />
      </List>

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
