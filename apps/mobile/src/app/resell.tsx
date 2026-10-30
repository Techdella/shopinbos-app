import { useState } from "react";
import { View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { naira } from "@shared/onboarding";
import { DarkCard, List, Row, Tile } from "@/components/design";
import { Badge, EmptyState, ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Notice, PillButton, T } from "@/components/ui";
import { useFeature } from "@/lib/features";
import { fetchResellMarket, getResellLink, type ResellableProduct } from "@/lib/resell";
import { shareText } from "@/lib/share";
import { useLoad } from "@/lib/useLoad";
import { useLocale, useT } from "@/lib/i18n";
import { formatDate } from "@shared/i18n";
import { colors } from "@/theme";

// Resell for resellers (web /resell; pilot "resell"): products from shops in the pilot they may resell, "Get my link"
// (made once, then the same link; copied for them), Share, and their sales with what the shops owe them.

export default function Resell() {
  const on = useFeature("resell");
  const t = useT("resell");
  const locale = useLocale();
  const loaded = useLoad(fetchResellMarket);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ id: string; tone: "error" | "success"; text: string } | null>(null);
  const data = loaded.data;

  async function getLink(product: ResellableProduct) {
    setBusy(product.productId);
    setNote(null);
    try {
      const made = await getResellLink(product.productId);
      setLinks((current) => ({ ...current, [product.productId]: made.link }));
      await Clipboard.setStringAsync(made.link).catch(() => undefined);
      setNote({ id: product.productId, tone: "success", text: t("market.copied") });
    } catch (error) {
      setNote({ id: product.productId, tone: "error", text: error instanceof Error ? error.message : t("market.linkFailed") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen title={t("market.title")} sub={t("market.sub")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      {!on ? <EmptyState icon="lock" title={t("notReady")} /> : null}
      {on && loaded.loading && !data ? <LoadingBlock /> : null}
      {on && loaded.error && !data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      {on && data ? (
        <>
          <DarkCard eyebrow={t("market.owedToYou")} amount={naira(data.totals.owed)} line={`${t("sales.count", { count: data.totals.count })} · ${t("sales.paid")}: ${naira(data.totals.paid)}`} />
          <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("market.paidNote")}</T>

          {data.ledger ? (
            <>
              <SectionTitle>{t("ledger.title")}</SectionTitle>
              <List>
                <Row lead={<Tile icon="clock" tone="butter" />} title={t("ledger.owed")} right={<T weight="extrabold" style={{ fontSize: 16 }}>{naira(data.ledger.owed)}</T>} />
                <Row
                  lead={<Tile icon="coin" tone="ok" />}
                  title={t("ledger.paid")}
                  sub={data.ledger.lastPaidAt ? t("ledger.lastPaid", { date: formatDate(new Date(data.ledger.lastPaidAt), locale, { day: "numeric", month: "short" }) }) : undefined}
                  right={<T weight="extrabold" style={{ fontSize: 16 }}>{naira(data.ledger.paid)}</T>}
                />
                {data.ledger.airtime > 0 ? <Row lead={<Tile icon="phone" tone="sky" />} title={t("ledger.airtime", { amount: naira(data.ledger.airtime) })} /> : null}
              </List>
              <T style={{ color: colors.inkSoft, fontSize: 13, lineHeight: 19 }}>{t("ledger.note")}</T>
            </>
          ) : null}

          <SectionTitle>{t("market.products")}</SectionTitle>
          {data.products.length ? (
            data.products.map((product) => {
              const link = links[product.productId] ?? product.link;
              return (
                <Card key={product.productId} style={{ gap: 8 }}>
                  <T weight="extrabold" style={{ fontSize: 16 }}>{product.name}</T>
                  <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("market.from", { shop: product.storeName })} · {naira(product.price)}</T>
                  <T weight="bold" style={{ color: colors.success, fontSize: 14 }}>{t("market.earn", { pct: product.commissionPct, amount: naira(product.commissionEach) })}</T>
                  {link ? <T style={{ color: colors.inkSoft, fontSize: 13 }} numberOfLines={1}>{link} · {t("market.clicks", { count: product.clicks })}</T> : null}
                  {note?.id === product.productId ? <Notice tone={note.tone}>{note.text}</Notice> : null}
                  {link ? (
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <PillButton title={t("market.copy")} tone="white" size="md" onPress={() => void Clipboard.setStringAsync(link).then(() => setNote({ id: product.productId, tone: "success", text: t("market.copied") })).catch(() => undefined)} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <PillButton title={t("market.share")} tone="ink" size="md" onPress={() => void shareText(t("market.shareText", { name: product.name, link }))} />
                      </View>
                    </View>
                  ) : (
                    <PillButton title={t("market.getLink")} tone="ink" size="md" busy={busy === product.productId} onPress={() => void getLink(product)} />
                  )}
                </Card>
              );
            })
          ) : (
            <EmptyState icon="link" title={t("market.empty")}>{t("market.emptySub")}</EmptyState>
          )}

          <SectionTitle>{t("market.mySales")}</SectionTitle>
          {data.sales.length ? (
            <List>
              {data.sales.map((sale) => (
                <Row
                  key={sale.id}
                  lead={<Tile icon="coin" tone={sale.status === "paid" ? "ok" : "gray"} />}
                  title={sale.productName}
                  sub={`${t("market.from", { shop: sale.storeName ?? "" })} · ${naira(sale.lineTotal)}`}
                  right={
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <T weight="extrabold" style={{ fontSize: 15.5 }}>{naira(sale.commissionAmount)}</T>
                      <Badge label={t.dynamic(`status.${sale.status}`, sale.status)} />
                    </View>
                  }
                />
              ))}
            </List>
          ) : (
            <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("market.noSales")}</T>
          )}
        </>
      ) : null}
    </Screen>
  );
}
