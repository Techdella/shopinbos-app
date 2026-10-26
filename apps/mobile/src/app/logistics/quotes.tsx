import { useState } from "react";
import { Alert, View } from "react-native";
import { naira } from "@shared/onboarding";
import { Eyebrow, List, Pill, Row, type PillTone } from "@/components/design";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { RouteLine } from "@/components/partner";
import { Screen } from "@/components/Screen";
import { Card, Field, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { answerPriceRequest, fetchPriceRequests, type PriceRequest } from "@/lib/logistics";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Price requests from shops (the web's /logistics/quotes, in the app): each one waiting for a price, with the route,
// the parcel and when they want it, a price box (your usual price filled in) and Send, or "Say no"; below, the ones
// already answered. GET /api/mobile/logistics/quotes, POST …/quotes/[id].

const STAGE: Record<string, { key: string; tone: PillTone }> = {
  responded: { key: "quotes.stage.sent", tone: "teal" },
  accepted: { key: "quotes.stage.won", tone: "ok" },
  rejected: { key: "quotes.stage.no", tone: "gray" },
  expired: { key: "quotes.stage.expired", tone: "gray" },
};

function day(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function Waiting({ request, basePrice, onDone }: { request: PriceRequest; basePrice: number | null; onDone: (text: string) => void }) {
  const t = useT("m_partner", "common");
  const [price, setPrice] = useState(basePrice ? String(basePrice) : "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"send" | "no" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wanted = day(request.wantedOn);

  async function run(kind: "send" | "no") {
    const amount = Number(price.replace(/[^\d.]/g, ""));
    if (kind === "send" && !(amount > 0)) return setError(t("quotes.needPrice"));
    setBusy(kind);
    setError(null);
    try {
      await answerPriceRequest(request.id, kind === "send" ? { intent: "respond", price: amount, note: note.trim() || undefined } : { intent: "decline" });
      onDone(kind === "send" ? t("quotes.sentNote", { shop: request.shop }) : t("quotes.declinedNote"));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("quotes.failed"));
    } finally {
      setBusy(null);
    }
  }

  function sayNo() {
    Alert.alert(t("quotes.noTitle"), t("quotes.noBody", { shop: request.shop }), [
      { text: t("cancel"), style: "cancel" },
      { text: t("quotes.no"), style: "destructive", onPress: () => void run("no") },
    ]);
  }

  return (
    <Card style={{ gap: 10, borderRadius: 24, borderWidth: 1, borderColor: colors.line }}>
      <T weight="bold" style={{ fontSize: 14, color: colors.inkSoft }} numberOfLines={1}>{[request.shop, request.city].filter(Boolean).join(" · ")}</T>
      <RouteLine from={request.from} to={request.to} size={16} />
      <T style={{ fontSize: 14, color: colors.inkSoft }}>
        {[request.parcel, wanted ? t("quotes.wanted", { day: wanted }) : null, request.declaredValue ? t("quotes.worth", { amount: naira(request.declaredValue) }) : null].filter(Boolean).join(" · ")}
      </T>
      {error ? <Notice>{error}</Notice> : null}
      <Field value={price} onChangeText={setPrice} keyboardType="number-pad" placeholder="2,500" accessibilityLabel={t("quotes.yourPrice")} />
      <Field value={note} onChangeText={setNote} maxLength={1000} placeholder={t("quotes.notePlaceholder")} accessibilityLabel={t("quotes.note")} />
      <PillButton title={t("quotes.send")} size="md" busy={busy === "send"} disabled={Boolean(busy)} onPress={() => void run("send")} />
      <LinkButton title={busy === "no" ? t("saving") : t("quotes.no")} color={colors.inkSoft} onPress={() => !busy && sayNo()} />
    </Card>
  );
}

export default function PriceRequests() {
  const t = useT("m_partner", "common");
  const requests = useLoad(fetchPriceRequests);
  const data = requests.data;
  const [note, setNote] = useState<string | null>(null);

  return (
    <Screen title={t("menu.quotes")} refreshing={requests.refreshing} onRefresh={() => void requests.refresh()}>
      {requests.loading && !data ? <LoadingBlock /> : null}
      {requests.error && !data ? <ErrorState message={requests.error} onRetry={() => void requests.reload()} /> : null}
      {note ? <Notice tone="success">{note}</Notice> : null}
      {data && !data.waiting.length && !data.answered.length ? <EmptyState icon="tag" title={t("quotes.empty")} /> : null}

      {data?.waiting.map((request) => (
        <Waiting
          key={request.id}
          request={request}
          basePrice={data.basePrice}
          onDone={(text) => {
            setNote(text);
            void requests.reload();
          }}
        />
      ))}

      {data?.answered.length ? (
        <View style={{ gap: 8 }}>
          <Eyebrow>{t("quotes.answered")}</Eyebrow>
          <List>
            {data.answered.map((request) => {
              const stage = STAGE[request.status] ?? STAGE.expired;
              return (
                <Row
                  key={request.id}
                  title={<RouteLine from={request.from} to={request.to} />}
                  sub={[request.shop, request.price ? naira(request.price) : null].filter(Boolean).join(" · ")}
                  right={<Pill label={t.dynamic(stage.key)} tone={stage.tone} />}
                />
              );
            })}
          </List>
        </View>
      ) : null}
    </Screen>
  );
}
