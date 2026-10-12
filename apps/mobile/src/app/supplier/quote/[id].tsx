import { useState } from "react";
import { Alert, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { naira } from "@shared/onboarding";
import { AppIcon } from "@/components/icons";
import { ChipRow, ErrorState, LoadingBlock } from "@/components/kit";
import { Thumb } from "@/components/partner";
import { Screen } from "@/components/Screen";
import { Card, Chip, Field, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { parseAmount, parseCount } from "@/lib/partner-pure";
import { fetchQuote, replyToQuote } from "@/lib/supplier";
import { bulkRequestStage, countWord, READY_CHOICES } from "@/lib/supplier-pure";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// A bulk request from a shop (build spec 8A): "Adaeze Studio wants 50 pieces". The supplier types a price for each
// and picks when it can be ready, then "Send my price". Same API as before (respond with a price, or decline).

type ReadyKey = (typeof READY_CHOICES)[number]["key"];

export default function BulkRequest() {
  const { id } = useLocalSearchParams<{ id: string }>();
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
  const shop = data ? data.seller.shop ?? data.seller.name : "The shop";

  async function send() {
    const unit = parseAmount(price);
    if (!unit) return setError("Type your price for one piece, in naira. For example 4500.");
    const minimum = moq.trim() ? parseCount(moq) : null;
    if (moq.trim() && (!minimum || minimum < 1)) return setError("The smallest order should be a whole number, like 10.");
    setBusy("respond");
    setError(null);
    try {
      const readyText = READY_CHOICES.find((choice) => choice.key === ready)?.text ?? "";
      quote.setData(await replyToQuote(String(id), { intent: "respond", quotedPrice: unit, moq: minimum ?? undefined, note: [readyText, note.trim()].filter(Boolean).join(" ") || undefined, validDays: 7 }));
      setSent(true);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Your price didn't send. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  function cant() {
    Alert.alert("Can't do this one?", "We tell the shop it's not possible right now.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "I can't do it",
        style: "destructive",
        onPress: async () => {
          setBusy("decline");
          setError(null);
          try {
            quote.setData(await replyToQuote(String(id), { intent: "decline", note: note.trim() || undefined }));
          } catch (declineError) {
            setError(declineError instanceof Error ? declineError.message : "That didn't go through. Try again.");
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  }

  if (!data) {
    return (
      <Screen title="A shop wants to buy a lot" refreshing={quote.refreshing} onRefresh={() => void quote.refresh()}>
        {quote.loading ? <LoadingBlock /> : null}
        {quote.error ? <ErrorState message={quote.error} onRetry={() => void quote.reload()} /> : null}
      </Screen>
    );
  }

  if (sent) {
    return (
      <Screen title="Price sent" footer={<PillButton title="Done" onPress={() => (router.canGoBack() ? router.back() : router.replace("/supplier/orders"))} />}>
        <Card style={{ alignItems: "center", gap: 12, paddingVertical: 28 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.successTint, alignItems: "center", justifyContent: "center" }}>
            <AppIcon name="check" size={36} color={colors.success} strokeWidth={2.6} />
          </View>
          <T style={{ fontSize: 16, lineHeight: 23, textAlign: "center" }}>We&apos;ll tell you when {shop} says yes. Then you can start getting the {countWord(data.quantity)} ready.</T>
        </Card>
      </Screen>
    );
  }

  const pending = data.status === "pending";
  const unit = parseAmount(price);

  return (
    <Screen
      title={`${shop} wants ${countWord(data.quantity)}`}
      sub={`${data.product.name} · to ${data.destination}`}
      refreshing={quote.refreshing}
      onRefresh={() => void quote.refresh()}
      footer={
        pending ? (
          <View style={{ gap: 4 }}>
            <PillButton title="Send my price" busy={busy === "respond"} disabled={Boolean(busy)} onPress={() => void send()} />
            <LinkButton title="I can't do this one" color={colors.inkSoft} onPress={cant} />
          </View>
        ) : null
      }
    >
      {error ? <Notice>{error}</Notice> : null}
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Thumb uri={data.product.image} size={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <T weight="extrabold" style={{ fontSize: 16 }} numberOfLines={2}>{data.product.name}</T>
          <T style={{ color: colors.inkSoft, fontSize: 15 }}>Your usual price {naira(data.product.wholesalePrice)} · you have {data.product.stock.toLocaleString("en-NG")}</T>
        </View>
      </Card>
      {data.notes ? (
        <Card>
          <T style={{ color: colors.inkSoft, fontSize: 15, marginBottom: 4 }}>The shop says:</T>
          <T style={{ fontSize: 15, lineHeight: 22 }}>{data.notes}</T>
        </Card>
      ) : null}

      {pending ? (
        <>
          <T weight="extrabold" style={{ fontSize: 22, marginTop: 6 }}>Your price for each one</T>
          <Field value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder={`₦${data.product.wholesalePrice.toLocaleString("en-NG")}`} accessibilityLabel="Your price for each one, in naira" style={{ fontSize: 20, height: 58 }} />
          {unit ? <T style={{ fontSize: 15 }}>Total for {countWord(data.quantity)}: <T weight="extrabold" style={{ fontSize: 15 }}>{naira(unit * data.quantity)}</T></T> : null}

          <T weight="extrabold" style={{ fontSize: 22, marginTop: 6 }}>When can it be ready?</T>
          <ChipRow>{READY_CHOICES.map((choice) => <Chip key={choice.key} label={choice.label} on={ready === choice.key} onPress={() => setReady(choice.key)} />)}</ChipRow>

          <Notice tone="info">The shop pays first. We keep the money safe and send it to you when they get the goods.</Notice>

          {more ? (
            <View style={{ gap: 10 }}>
              <T weight="bold" style={{ fontSize: 15 }}>Smallest order you accept (optional)</T>
              <Field value={moq} onChangeText={setMoq} keyboardType="number-pad" placeholder={String(data.product.moq)} accessibilityLabel="Smallest order you accept" />
              <T weight="bold" style={{ fontSize: 15 }}>Message to the shop (optional)</T>
              <Field value={note} onChangeText={setNote} multiline maxLength={800} placeholder="Price includes packaging." accessibilityLabel="Message to the shop" style={{ height: 96, paddingTop: 14, textAlignVertical: "top" }} />
            </View>
          ) : (
            <LinkButton title="Smallest order and a message (optional)" color={colors.inkSoft} onPress={() => setMore(true)} />
          )}
        </>
      ) : (
        <Card style={{ gap: 6 }}>
          <T weight="extrabold" style={{ fontSize: 17 }}>{data.status === "rejected" ? "You said you can't do this one" : `You said ${data.quotedPrice ? naira(data.quotedPrice) : "a price"} each`}</T>
          <T style={{ color: colors.inkSoft, fontSize: 15 }}>{bulkRequestStage(data.status)}</T>
          {data.reply ? <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{data.reply}</T> : null}
        </Card>
      )}

      <LinkButton title={`Message ${shop}`} onPress={() => router.push({ pathname: "/supplier/chat/[id]", params: { id: data.seller.userId, name: shop } })} />
    </Screen>
  );
}
