import { useState } from "react";
import { Alert, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { naira } from "@shared/onboarding";
import { ChipRow, ErrorState, LoadingBlock } from "@/components/kit";
import { KeyValue, Thumb, TonePill } from "@/components/partner";
import { Screen } from "@/components/Screen";
import { Card, Chip, Field, Label, Notice, PillButton, T } from "@/components/ui";
import { parseAmount, parseCount, quoteStage, timeAgo } from "@/lib/partner-pure";
import { fetchQuote, replyToQuote } from "@/lib/supplier";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// One quote request: what the shop asked for, then a reply with a price per unit, minimum order, how long the
// offer stands and a note, or a polite decline.

const VALID = [3, 7, 14, 30];

export default function SupplierQuote() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const quote = useLoad(() => fetchQuote(String(id)), String(id));
  const [price, setPrice] = useState("");
  const [moq, setMoq] = useState("");
  const [note, setNote] = useState("");
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState<null | "respond" | "decline">(null);
  const [error, setError] = useState<string | null>(null);
  const data = quote.data;

  async function send() {
    const unit = parseAmount(price);
    if (!unit) return setError("Enter your price per unit.");
    const minimum = moq.trim() ? parseCount(moq) : null;
    if (moq.trim() && (!minimum || minimum < 1)) return setError("Minimum order must be a whole number.");
    setBusy("respond");
    setError(null);
    try {
      quote.setData(await replyToQuote(String(id), { intent: "respond", quotedPrice: unit, moq: minimum ?? undefined, note: note.trim() || undefined, validDays: days }));
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Couldn't send your quote. Try again.");
    } finally {
      setBusy(null);
    }
  }

  function decline() {
    Alert.alert("Decline this request?", "The shop is told it's not a fit right now.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Decline",
        style: "destructive",
        onPress: async () => {
          setBusy("decline");
          setError(null);
          try {
            quote.setData(await replyToQuote(String(id), { intent: "decline", note: note.trim() || undefined }));
          } catch (declineError) {
            setError(declineError instanceof Error ? declineError.message : "Couldn't decline. Try again.");
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  }

  const pending = data?.status === "pending";
  const unit = parseAmount(price);

  return (
    <Screen
      title="Quote request"
      sub={data ? `${data.seller.shop ?? data.seller.name} · ${timeAgo(data.createdAt)}` : undefined}
      refreshing={quote.refreshing}
      onRefresh={() => void quote.refresh()}
      footer={
        pending ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <PillButton title="Decline" tone="white" size="md" style={{ flex: 0.7 }} busy={busy === "decline"} disabled={Boolean(busy)} onPress={decline} />
            <PillButton title="Send quote" size="md" style={{ flex: 1 }} busy={busy === "respond"} disabled={Boolean(busy)} onPress={() => void send()} />
          </View>
        ) : null
      }
    >
      {quote.loading && !data ? <LoadingBlock /> : null}
      {quote.error && !data ? <ErrorState message={quote.error} onRetry={() => void quote.reload()} web={{ label: "Open on web", onPress: () => void openWeb("/supplier/quote-requests") }} /> : null}
      {error ? <Notice>{error}</Notice> : null}
      {data ? (
        <>
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Thumb uri={data.product.image} size={56} />
            <View style={{ flex: 1, gap: 4 }}>
              <T weight="extrabold" style={{ fontSize: 16 }} numberOfLines={2}>{data.product.name}</T>
              <TonePill tone={quoteStage(data.status).tone} label={quoteStage(data.status).label} />
            </View>
          </Card>
          <Card style={{ paddingVertical: 4 }}>
            <KeyValue first label="Quantity" value={`${data.quantity.toLocaleString("en-NG")} units`} />
            <KeyValue label="Deliver to" value={data.destination} />
            <KeyValue label="Your usual price" value={`${naira(data.product.wholesalePrice)} · MOQ ${data.product.moq}`} />
            <KeyValue label="In stock" value={data.product.stock.toLocaleString("en-NG")} />
          </Card>
          {data.notes ? (
            <Card>
              <T style={{ color: colors.inkSoft, fontSize: 12.5, marginBottom: 4 }}>THEIR NOTE</T>
              <T style={{ lineHeight: 21 }}>{data.notes}</T>
            </Card>
          ) : null}

          {pending ? (
            <>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Label>Price per unit ₦</Label>
                  <Field value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder={String(data.product.wholesalePrice)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Label>Minimum order</Label>
                  <Field value={moq} onChangeText={setMoq} keyboardType="number-pad" placeholder={String(data.product.moq)} />
                </View>
              </View>
              {unit ? <T style={{ color: colors.inkSoft }}>Total for {data.quantity.toLocaleString("en-NG")}: <T weight="extrabold">{naira(unit * data.quantity)}</T></T> : null}
              <View>
                <Label>Offer stands for</Label>
                <ChipRow>{VALID.map((value) => <Chip key={value} label={`${value} days`} on={days === value} onPress={() => setDays(value)} />)}</ChipRow>
              </View>
              <View>
                <Label>Note (optional)</Label>
                <Field value={note} onChangeText={setNote} multiline maxLength={800} placeholder="Delivery in 3 days to Lagos. Price includes packaging." style={{ height: 96, paddingTop: 14, textAlignVertical: "top" }} />
              </View>
            </>
          ) : (
            <Card style={{ gap: 6 }}>
              <T weight="extrabold">{data.status === "rejected" ? "You declined this request" : `You quoted ${data.quotedPrice ? naira(data.quotedPrice) : "—"} a unit`}</T>
              {data.reply ? <T style={{ color: colors.inkSoft, lineHeight: 20 }}>{data.reply}</T> : null}
            </Card>
          )}

          <PillButton title={`Message ${data.seller.shop ?? data.seller.name}`} tone="white" size="md" onPress={() => router.push({ pathname: "/supplier/chat/[id]", params: { id: data.seller.userId, name: data.seller.shop ?? data.seller.name } })} />
        </>
      ) : null}
    </Screen>
  );
}
