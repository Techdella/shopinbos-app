import { useState } from "react";
import { View } from "react-native";
import { LoadingBlock } from "@/components/kit";
import { Sheet } from "@/components/Sheet";
import { Card, Chip, Label, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { chooseMeta, connectMetaAds, disconnectMeta, fetchMetaChoices, type MetaChoice } from "@/lib/ads";
import type { MetaStatus } from "@/lib/ads-pure";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// The Meta ads connection card (Ads screen, and the ad wizard's first step when the ad account isn't picked yet):
// connect, pick the ad account and Facebook Page here, change or disconnect.

export function MetaCard({ meta, onChanged }: { meta: MetaStatus; onChanged: () => Promise<void> }) {
  const t = useT("m_ads", "ads", "m_ui");
  const [picking, setPicking] = useState(false);
  const [choices, setChoices] = useState<{ accounts: MetaChoice[]; pages: MetaChoice[] } | null>(null);
  const [accountId, setAccountId] = useState("");
  const [pageId, setPageId] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function openPicker() {
    setPicking(true);
    setProblem(null);
    if (choices) return;
    try {
      const loaded = await fetchMetaChoices();
      setChoices(loaded.choices);
      setAccountId(loaded.choices.accounts.find((account) => account.id === meta.accountId)?.id ?? loaded.choices.accounts[0]?.id ?? "");
      setPageId(loaded.choices.pages[0]?.id ?? "");
    } catch (loadError) {
      setProblem(loadError instanceof Error ? loadError.message : t("m.loadFailed"));
    }
  }

  async function save() {
    setBusy(true);
    setProblem(null);
    try {
      await chooseMeta(accountId, pageId);
      setPicking(false);
      await onChanged();
    } catch (saveError) {
      setProblem(saveError instanceof Error ? saveError.message : t("m.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    await disconnectMeta().catch(() => null);
    setBusy(false);
    setConfirmOff(false);
    await onChanged();
  }

  const line = !meta.configured
    ? t("m.notReady")
    : meta.status === "connected"
      ? t("m.connected", { account: meta.accountName ?? meta.accountId ?? "", page: meta.pageName ?? "" })
      : meta.status === "reauth"
        ? t("m.reauth")
        : meta.status === "needs_account"
          ? t("m.pick")
          : t("m.off");

  return (
    <Card style={{ gap: 8 }}>
      <T weight="extrabold" style={{ fontSize: 16 }}>{t("m.title")}</T>
      <T style={{ color: colors.inkSoft, fontSize: 14.5, lineHeight: 21 }}>{line}</T>
      {meta.configured && (meta.status === "off" || meta.status === "reauth") ? (
        <>
          <PillButton title={meta.status === "reauth" ? t("m.reconnect") : t("m.connect")} size="sm" style={{ alignSelf: "flex-start" }} onPress={() => void connectMetaAds().then(() => onChanged())} />
        </>
      ) : null}
      {meta.configured && (meta.status === "connected" || meta.status === "needs_account") ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <PillButton title={meta.status === "needs_account" ? t("m.use") : t("m.change")} size="sm" tone={meta.status === "needs_account" ? "ink" : "white"} onPress={() => void openPicker()} />
          <PillButton title={t("m.disconnect")} size="sm" tone="white" onPress={() => setConfirmOff(true)} />
        </View>
      ) : null}

      <Sheet visible={picking} onClose={() => setPicking(false)} title={t("meta.pickTitle")}>
        {problem ? <Notice>{problem}</Notice> : null}
        {!choices && !problem ? <LoadingBlock label={t("m.loading")} /> : null}
        {choices ? (
          <>
            {choices.accounts.length === 0 ? <Notice tone="info">{t("m.noAccounts")}</Notice> : null}
            {choices.pages.length === 0 ? <Notice tone="info">{t("m.noPages")}</Notice> : null}
            <Label>{t("m.account")}</Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {choices.accounts.map((account) => <Chip key={account.id} label={account.currency ? `${account.name} (${account.currency})` : account.name} on={accountId === account.id} onPress={() => setAccountId(account.id)} />)}
            </View>
            <Label>{t("m.page")}</Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {choices.pages.map((page) => <Chip key={page.id} label={page.name} on={pageId === page.id} onPress={() => setPageId(page.id)} />)}
            </View>
            <PillButton title={t("m.use")} busy={busy} disabled={!accountId || !pageId} onPress={() => void save()} />
          </>
        ) : null}
      </Sheet>

      <Sheet visible={confirmOff} onClose={() => setConfirmOff(false)} title={t("m.disconnect")}>
        <T style={{ fontSize: 15, lineHeight: 22, color: colors.inkSoft }}>{t("m.confirmDisconnect")}</T>
        <PillButton title={t("meta.disconnectYes")} busy={busy} onPress={() => void disconnect()} />
        <LinkButton title={t("keep")} onPress={() => setConfirmOff(false)} />
      </Sheet>
    </Card>
  );
}
