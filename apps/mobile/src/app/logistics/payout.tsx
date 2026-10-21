import { router } from "expo-router";
import { List, Row, Small, Tile } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { PillButton } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { useLoad } from "@/lib/useLoad";
import { fetchWallet } from "@/lib/wallet";

// Payout account ("Delivery partner app" prototype `payout`): the bank delivery fees are split to at checkout.
// Setting it up or changing it happens on the Shopinbos Wallet screen.

export default function Payout() {
  const t = useT("m_partner");
  const wallet = useLoad(fetchWallet);
  const bank = wallet.data?.view.bank;

  return (
    <Screen
      title={t("biz.payout")}
      refreshing={wallet.refreshing}
      onRefresh={() => void wallet.refresh()}
      footer={wallet.data ? <PillButton tone={bank ? "white" : "forest"} title={bank ? t("payout.change") : t("payout.setUp")} onPress={() => router.push("/logistics/wallet")} /> : undefined}
    >
      {wallet.loading && !wallet.data ? <LoadingBlock /> : null}
      {wallet.error && !wallet.data ? <ErrorState message={wallet.error} onRetry={() => void wallet.reload()} /> : null}
      {wallet.data ? (
        <List>
          <Row lead={<Tile icon="wallet" />} title={bank ? `${bank.bankName} ••• ${bank.accountEnding}` : t("biz.payoutNone")} sub={bank ? bank.accountName : undefined} />
        </List>
      ) : null}
      <Small>{t("payout.note")}</Small>
    </Screen>
  );
}
