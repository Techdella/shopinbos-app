import { useState } from "react";
import { Alert, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { naira } from "@shared/onboarding";
import { AppIcon } from "@/components/icons";
import { ChipRow, ErrorState, LoadingBlock } from "@/components/kit";
import { Thumb } from "@/components/partner";
import { Screen } from "@/components/Screen";
import { Card, Chip, Field, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { parseAmount, parseCount } from "@/lib/partner-pure";
import { fetchQuote, replyToQuote } from "@/lib/supplier";
import { quoteRequestStage, countWord, READY_CHOICES } from "@/lib/supplier-pure";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";
import { VoiceInput } from "@/components/VoiceInput";

// A quote request from a shop (build spec 8A): "Adaeze Studio wants 50 pieces". The supplier types a price for each
// and picks when it can be ready, then "Send my quote". Same API as before (respond with a price, or decline).
// Screen words are in the app language (m_supplier "quote.*"); the "It can be ready in 3 days." line sent to the shop
// with the quote stays in English (READY_CHOICES), since the shop may read another language.

type ReadyKey = (typeof READY_CHOICES)[number]["key"];

export default function QuoteRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT("m_supplier", "m_partner", "common");
  const quote = useLoad(() => fetchQuote(String(id)), String(id));
  const [price, setPrice] = useState("");
  const [ready, setReady] = useState<ReadyKey>("3days");
  const [moq, setMoq] = useState("");
  const [note, setNote] = useState("");
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState<null | "respond" | "decline">(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const data = quote.data;
  const shop = data ? data.seller.shop ?? data.seller.name : t("quote.theShop");

  async function send() {
    const unit = parseAmount(price);
    if (!unit) return setError(t("quote.needPrice"));
    const minimum = moq.trim() ? parseCount(moq) : null;
    if (moq.trim() && (!minimum || minimum < 1)) return setError(t("quote.needMoq"));
    setBusy("respond");
    setError(null);
    try {
      const readyText = READY_CHOICES.find((choice) => choice.key === ready)?.text ?? "";
      quote.setData(await replyToQuote(String(id), { intent: "respond", quotedPrice: unit, moq: minimum ?? undefined, note: [readyText, note.trim()].filter(Boolean).join(" ") || undefined, validDays: 7 }));
      setSent(true);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t("quote.sendFailed"));
    } finally {
      setBusy(null);
    }
  }

  function cant() {
    Alert.alert(t("cant.title"), t("quote.cantBody"), [
      { text: t("keepIt"), style: "cancel" },
      {
        text: t("cant.confirm"),
        style: "destructive",
        onPress: async () => {
          setBusy("decline");
          setError(null);
          try {
            quote.setData(await replyToQuote(String(id), { intent: "decline", note: note.trim() || undefined }));
          } catch (declineError) {
            setError(declineError instanceof Error ? declineError.message : t("error.short"));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  }

  if (!data) {
    return (
      <Screen title={t("quote.title")} refreshing={quote.refreshing} onRefresh={() => void quote.refresh()}>
        {quote.loading ? <LoadingBlock /> : null}
        {quote.error ? <ErrorState message={quote.error} onRetry={() => void quote.reload()} /> : null}
      </Screen>
    );
  }

  if (sent) {
    return (
      <Screen title={t("quote.sent")} footer={<PillButton title={t("done")} onPress={() => (router.canGoBack() ? router.back() : router.replace("/supplier/orders"))} />}>
        <Card style={{ alignItems: "center", gap: 12, paddingVertical: 28 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.successTint, alignItems: "center", justifyContent: "center" }}>
            <AppIcon name="check" size={36} color={colors.success} strokeWidth={2.6} />
          </View>
          <T style={{ fontSize: 16, lineHeight: 23, textAlign: "center" }}>{t("quote.sentBody", { shop, pieces: countWord(data.quantity, t) })}</T>
        </Card>
      </Screen>
    );
  }

  const pending = data.status === "pending";
  const unit = parseAmount(price);

  return (
    <Screen
      title={t("wants", { shop, pieces: countWord(data.quantity, t) })}
      sub={t("quote.sub", { product: data.product.name, destination: data.destination })}
      refreshing={quote.refreshing}
      onRefresh={() => void quote.refresh()}
      footer={
        pending ? (
          <View style={{ gap: 4 }}>
            <PillButton title={t("quote.send")} busy={busy === "respond"} disabled={Boolean(busy)} onPress={() => void send()} />
            <LinkButton title={t("cantThisOne")} color={colors.inkSoft} onPress={cant} />
          </View>
        ) : null
      }
    >
      {error ? <Notice>{error}</Notice> : null}
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Thumb uri={data.product.image} size={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <T weight="extrabold" style={{ fontSize: 16 }} numberOfLines={2}>{data.product.name}</T>
          <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("quote.yourWholesale", { price: naira(data.product.wholesalePrice), stock: data.product.stock })}</T>
        </View>
      </Card>
      {data.notes ? (
        <Card>
          <T style={{ color: colors.inkSoft, fontSize: 15, marginBottom: 4 }}>{t("quote.shopSays")}</T>
          <T style={{ fontSize: 15, lineHeight: 22 }}>{data.notes}</T>
        </Card>
      ) : null}

      {pending ? (
        <>
          <T weight="extrabold" style={{ fontSize: 22, marginTop: 6 }}>{t("quote.yourPrice")}</T>
          <Field value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder={`₦${data.product.wholesalePrice.toLocaleString("en-NG")}`} accessibilityLabel={t("quote.yourPriceLabel")} style={{ fontSize: 20, height: 58 }} />
          {unit ? <T style={{ fontSize: 15 }}>{t("quote.totalFor", { pieces: countWord(data.quantity, t) })} <T weight="extrabold" style={{ fontSize: 15 }}>{naira(unit * data.quantity)}</T></T> : null}

          <T weight="extrabold" style={{ fontSize: 22, marginTop: 6 }}>{t("quote.whenReady")}</T>
          <ChipRow>{READY_CHOICES.map((choice) => <Chip key={choice.key} label={t(`ready.${choice.key}`)} on={ready === choice.key} onPress={() => setReady(choice.key)} />)}</ChipRow>

          <Notice tone="info">{t("quote.escrow")}</Notice>

          {more ? (
            <View style={{ gap: 10 }}>
              <T weight="bold" style={{ fontSize: 15 }}>{t("quote.moq")}</T>
              <Field value={moq} onChangeText={setMoq} keyboardType="number-pad" placeholder={String(data.product.moq)} accessibilityLabel={t("moqLabel")} />
              <T weight="bold" style={{ fontSize: 15 }}>{t("quote.message")}</T>
              <Field value={note} onChangeText={setNote} multiline maxLength={800} placeholder={t("quote.messagePlaceholder")} accessibilityLabel={t("quote.messageLabel")} style={{ height: 96, paddingTop: 14, textAlignVertical: "top" }} />
              <VoiceInput value={note} onChange={setNote} maxLength={800} context="a note with a quote" style={{ marginTop: 8 }} />
            </View>
          ) : (
            <LinkButton title={t("quote.more")} color={colors.inkSoft} onPress={() => setMore(true)} />
          )}
        </>
      ) : (
        <Card style={{ gap: 6 }}>
          <T weight="extrabold" style={{ fontSize: 17 }}>{data.status === "rejected" ? t("quote.saidCant") : t("quote.saidPrice", { price: data.quotedPrice ? naira(data.quotedPrice) : t("quote.aPrice") })}</T>
          <T style={{ color: colors.inkSoft, fontSize: 15 }}>{quoteRequestStage(data.status, t)}</T>
          {data.reply ? <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{data.reply}</T> : null}
        </Card>
      )}

      <LinkButton title={t("messageShop", { shop })} onPress={() => router.push({ pathname: "/supplier/chat/[id]", params: { id: data.seller.userId, name: shop } })} />
    </Screen>
  );
}
