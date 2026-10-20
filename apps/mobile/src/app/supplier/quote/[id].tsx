import { useState } from "react";
import { Alert, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { naira } from "@shared/onboarding";
import { Small } from "@/components/design";
import { ChipRow, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { DoneView, FieldLabel, NoteCard, Pic } from "@/components/SupplierKit";
import { Chip, Field, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { AppIcon } from "@/components/icons";
import { useT } from "@/lib/i18n";
import { parseAmount, parseCount } from "@/lib/partner-pure";
import { fetchQuote, replyToQuote } from "@/lib/supplier";
import { quoteRequestStage, countWord, READY_CHOICES } from "@/lib/supplier-pure";
import { useLoad } from "@/lib/useLoad";
import { colors, fonts } from "@/theme";

// A price (quote) request from a shop ("Simple app, end to end" supplier prototype): "50 pieces of Unisex runners"
// from the shop, what they wrote, your price for each one (your normal price under it), when it's ready to send,
// then "Send my price" and "Price sent". Same API as before (respond with a price, or decline).
// Screen words are in the app language (m_supplier "quote.*"); the "It can be ready in 3 days." line sent to the shop
// with the quote stays in English (READY_CHOICES), since the shop may read another language.

type ReadyKey = (typeof READY_CHOICES)[number]["key"];

export default function QuoteRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT("m_supplier", "m_partner", "common");
  const quote = useLoad(() => fetchQuote(String(id)), String(id));
  const [price, setPrice] = useState("");
  const [ready, setReady] = useState<ReadyKey>("week");
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
      <Screen title={t("quote.priceRequest")} refreshing={quote.refreshing} onRefresh={() => void quote.refresh()}>
        {quote.loading ? <LoadingBlock /> : null}
        {quote.error ? <ErrorState message={quote.error} onRetry={() => void quote.reload()} /> : null}
      </Screen>
    );
  }

  if (sent) {
    return (
      <DoneView
        title={t("quote.priceSent")}
        sub={t("quote.priceSentBody", { shop })}
        footer={<PillButton title={t("done")} onPress={() => router.replace({ pathname: "/supplier/orders", params: { view: "prices" } })} />}
      />
    );
  }

  const pending = data.status === "pending";
  const unit = parseAmount(price);

  return (
    <Screen
      title={t("quote.priceRequest")}
      refreshing={quote.refreshing}
      onRefresh={() => void quote.refresh()}
      footer={
        pending ? (
          <>
            <PillButton tone="accent" busy={busy === "respond"} disabled={Boolean(busy)} onPress={() => void send()} accessibilityLabel={t("quote.sendPrice")}>
              <AppIcon name="send" size={20} color={colors.ink} />
              <T weight="extrabold" style={{ fontSize: 17, color: colors.ink }}>{t("quote.sendPrice")}</T>
            </PillButton>
            <LinkButton title={t("cantThisOne")} color={colors.inkSoft} onPress={cant} />
          </>
        ) : null
      }
    >
      {error ? <Notice>{error}</Notice> : null}
      <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
        <Pic uri={data.product.image} size={72} radius={18} />
        <View style={{ flex: 1, gap: 3 }}>
          <T weight="extrabold" style={{ fontSize: 20, lineHeight: 25 }} numberOfLines={3}>{t("quote.piecesOf", { pieces: countWord(data.quantity, t), product: data.product.name })}</T>
          <T style={{ fontSize: 14, color: colors.inkSoft }}>{t("quote.fromLine", { shop, destination: data.destination })}</T>
        </View>
      </View>
      {data.notes ? (
        <NoteCard tone="gray">
          <T style={{ fontSize: 16, lineHeight: 24 }}>“{data.notes}”</T>
        </NoteCard>
      ) : null}

      {pending ? (
        <>
          <View>
            <FieldLabel>{t("quote.pricePer")}</FieldLabel>
            <Field value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder={data.product.wholesalePrice.toLocaleString("en-NG")} accessibilityLabel={t("quote.yourPriceLabel")} style={{ fontSize: 26, height: 70, fontFamily: fonts.display }} />
            <Small style={{ marginTop: 8 }}>{t("quote.normalPrice", { price: naira(data.product.wholesalePrice) })}</Small>
            {unit ? <Small>{t("quote.totalFor", { pieces: countWord(data.quantity, t) })} {naira(unit * data.quantity)}</Small> : null}
          </View>

          <View>
            <FieldLabel>{t("quote.readyIn")}</FieldLabel>
            <ChipRow>{READY_CHOICES.map((choice) => <Chip key={choice.key} label={t(`ready.${choice.key}`)} on={ready === choice.key} onPress={() => setReady(choice.key)} />)}</ChipRow>
          </View>

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
        <NoteCard tone={data.status === "rejected" ? "gray" : "ok"} title={data.status === "rejected" ? t("quote.saidCant") : t("quote.saidPrice", { price: data.quotedPrice ? naira(data.quotedPrice) : t("quote.aPrice") })}>
          <T style={{ color: colors.inkSoft, fontSize: 15 }}>{quoteRequestStage(data.status, t)}</T>
          {data.reply ? <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{data.reply}</T> : null}
        </NoteCard>
      )}

      <LinkButton title={t("messageShop", { shop })} onPress={() => router.push({ pathname: "/supplier/chat/[id]", params: { id: data.seller.userId, name: shop } })} />
    </Screen>
  );
}
