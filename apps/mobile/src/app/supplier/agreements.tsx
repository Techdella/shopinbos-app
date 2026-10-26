import { useState } from "react";
import { Linking, View } from "react-native";
import { AGREEMENT_POINTS } from "@shared/supplier-trust";
import { cleanSignedName } from "@shared/contracts";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { TonePill } from "@/components/partner";
import { Screen } from "@/components/Screen";
import { AgreementText, Check } from "@/components/SupplierTrust";
import { Card, Field, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { answerAgreement, fetchAgreements, type DropshipAgreement } from "@/lib/supplier";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Dropship agreements (the web's /supplier/agreements, in the app): shops that called the supplier, checked the
// stock and signed the Dropship agreement. The supplier reads the terms and signs with their typed name (the shop can
// then list their products), or declines saying why. GET / POST /api/mobile/supplier/agreements. Opened from the
// "{shop} wants to sell your products" notification, Home and Account. Words: the web's "supplier", "marketplace"
// and "contracts" catalogs.

const TONE = { requested: "warning", active: "success", declined: "muted" } as const;

export default function SupplierAgreements() {
  const t = useT("supplier", "marketplace", "contracts", "common");
  const list = useLoad(fetchAgreements);
  const rows = list.data ?? [];

  return (
    <Screen title={t("agr.title")} sub={t("agr.sub")} refreshing={list.refreshing} onRefresh={() => void list.refresh()}>
      {list.loading && !list.data ? <LoadingBlock /> : null}
      {list.error && !list.data ? <ErrorState message={list.error} onRetry={() => void list.reload()} /> : null}
      {list.data && !rows.length ? (
        <Card style={{ gap: 6 }}>
          <T weight="extrabold" style={{ fontSize: 16 }}>{t("agr.none")}</T>
          <T style={{ color: colors.inkSoft, lineHeight: 20 }}>{t("agr.noneSub")}</T>
        </Card>
      ) : null}
      {rows.map((row) => <AgreementCard key={row.id} row={row} onAnswered={() => void list.reload()} />)}
    </Screen>
  );
}

function AgreementCard({ row, onAnswered }: { row: DropshipAgreement; onAnswered: () => void }) {
  const t = useT("supplier", "marketplace", "contracts", "common");
  const [reading, setReading] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [signedName, setSignedName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const waiting = row.status === "requested";
  const phone = row.phone?.replace(/[^\d+]/g, "") ?? "";
  const line = [row.shopCity, row.stockCheck === "visit" ? t("agr.visited") : t("agr.videoCalled"), row.products ? t("agr.listed", { count: row.products }) : null].filter(Boolean).join(" · ");

  async function answer(accept: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await answerAgreement(row.id, accept ? { accept: true, signedName } : { accept: false, note });
      setMessage({ tone: "success", text: result.message });
      onAnswered();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <T weight="extrabold" style={{ flex: 1, fontSize: 16 }} numberOfLines={2}>{row.shopName}</T>
        <TonePill tone={TONE[row.status as keyof typeof TONE] ?? "muted"} label={t.dynamic(`agr.status.${row.status}`, row.status)} />
      </View>
      {line ? <T style={{ color: colors.inkSoft, fontSize: 14 }}>{line}</T> : null}
      {row.sellerNote ? <T style={{ fontSize: 14, lineHeight: 20 }}>{`“${row.sellerNote}”`}</T> : null}
      {row.supplierNote ? <T style={{ color: colors.inkSoft, fontSize: 13.5 }}>{t("agr.youSaid", { note: row.supplierNote })}</T> : null}
      {phone ? <LinkButton title={row.phone ?? ""} onPress={() => void Linking.openURL(`tel:${phone}`)} style={{ alignSelf: "flex-start" }} /> : null}

      {/* The terms: the points both sides agree, and the full written agreement the shop signed. */}
      <View style={{ gap: 4 }}>
        <T weight="bold" style={{ fontSize: 14 }}>{t("agr.whatYouAgree")}</T>
        {Array.from({ length: AGREEMENT_POINTS }, (_, index) => <T key={index} style={{ fontSize: 13.5, lineHeight: 19 }}>{`• ${t.dynamic(`trust.point.${index}`, "")}`}</T>)}
      </View>
      {row.document ? <PillButton title={reading ? t("cancel") : t("sign.read")} tone="white" size="sm" style={{ alignSelf: "flex-start" }} onPress={() => setReading((on) => !on)} /> : null}
      {reading && row.document ? <AgreementText doc={row.document} /> : null}

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {waiting && message?.tone !== "success" ? (
        declining ? (
          <View style={{ gap: 8 }}>
            <Field value={note} onChangeText={setNote} placeholder={t("agr.whyPh")} maxLength={600} multiline accessibilityLabel={t("agr.whyPh")} />
            <PillButton title={t("agr.sendDecline")} tone="ink" size="md" busy={busy} disabled={busy || note.trim().length < 5} onPress={() => void answer(false)} />
            <LinkButton title={t("agr.back")} color={colors.inkSoft} onPress={() => setDeclining(false)} />
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            <T style={{ color: colors.inkSoft, fontSize: 13.5 }}>{t("agr.checkFirst", { shop: row.shopName })}</T>
            <Field value={signedName} onChangeText={setSignedName} placeholder={t("sign.ph")} maxLength={80} autoComplete="name" accessibilityLabel={t("sign.label")} />
            <Check on={confirmed} onChange={setConfirmed} label={t("sign.confirm")} />
            <PillButton title={t("sign.signAndAccept")} tone="accent" size="md" busy={busy} disabled={busy || !confirmed || !cleanSignedName(signedName)} onPress={() => void answer(true)} />
            <LinkButton title={t("agr.decline")} color={colors.danger} onPress={() => setDeclining(true)} />
          </View>
        )
      ) : null}
    </Card>
  );
}
