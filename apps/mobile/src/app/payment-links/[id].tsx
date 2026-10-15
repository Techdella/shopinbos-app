import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { naira } from "@shared/onboarding";
import { Badge, ErrorState, LoadingBlock } from "@/components/kit";
import { LINK_STATUS_COLORS, LinkShareButtons } from "@/components/LinkShareButtons";
import { Screen } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { Card, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { friendlyDay } from "@/lib/friendly";
import { cancelPaymentLink, fetchPaymentLinks } from "@/lib/paylinks";
import { canCancel } from "@/lib/paylinks-pure";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// One payment link: what's in it, copy and share it, the order it made, and cancel it (with the app's confirm sheet).
// There's no single-link route, so it's read from the shop's list (GET /api/app/payment-links).

export default function PaymentLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT("m_paylinks", "m_ui");
  const links = useLoad(fetchPaymentLinks, String(id));
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const link = links.data?.links.find((row) => row.id === id || row.code === id);

  async function cancel() {
    if (!link) return;
    setBusy(true);
    setNote(null);
    try {
      await cancelPaymentLink(link.id);
      setNote({ tone: "success", text: t("cancel.done") });
      await links.reload();
    } catch (cancelError) {
      setNote({ tone: "error", text: cancelError instanceof Error ? cancelError.message : t("cancel.couldNot") });
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  if (!link) {
    return (
      <Screen title={t("detail.title")}>
        {links.loading && !links.data ? <LoadingBlock /> : null}
        {links.error && !links.data ? <ErrorState message={links.error} onRetry={() => void links.reload()} /> : null}
        {links.data ? <Notice tone="info">{t("detail.gone")}</Notice> : null}
      </Screen>
    );
  }

  const tone = LINK_STATUS_COLORS[link.status];
  const message = t("shareMessage", { title: link.title, amount: naira(link.amount), url: link.url });

  return (
    <Screen title={link.title} refreshing={links.refreshing} onRefresh={() => void links.refresh()}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Badge label={t(`status.${link.status}`)} bg={tone.bg} fg={tone.fg} />
        <Badge label={link.oneTime ? t("row.oneTime") : t("row.reusable")} />
        <Badge label={t.dynamic(`by.${link.createdBy}`, link.createdBy)} />
      </View>

      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}

      <Card style={{ gap: 8 }}>
        <T weight="extrabold" style={{ fontSize: 28, letterSpacing: -0.5 }}>{naira(link.amount)}</T>
        <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>
          {[
            t("detail.made", { day: friendlyDay(link.createdAt, new Date(), t) }),
            link.status === "active" ? (link.expiresAt ? t("detail.until", { day: friendlyDay(link.expiresAt, new Date(), t) }) : t("detail.noEnd")) : null,
            link.buyerName ? t("row.for", { name: link.buyerName }) : null,
          ].filter(Boolean).join(" · ")}
        </T>
        <T style={{ color: colors.inkSoft, fontSize: 15 }}>
          {[t("row.views", { count: link.views }), link.paidCount ? t("row.paidTimes", { count: link.paidCount }) : null].filter(Boolean).join(" · ")}
        </T>
      </Card>

      {link.items.length ? (
        <Card style={{ gap: 6 }}>
          <T weight="extrabold" style={{ fontSize: 16 }}>{t("detail.items")}</T>
          {link.items.map((item, index) => (
            <T key={`${item.name}-${index}`} style={{ fontSize: 15 }}>{t("detail.item", { quantity: item.quantity, name: item.name })}</T>
          ))}
        </Card>
      ) : null}

      {link.order ? (
        <PillButton title={t("detail.order", { number: link.order.orderNumber })} size="md" onPress={() => router.push({ pathname: "/order/[id]", params: { id: link.order!.id } })} />
      ) : null}

      {link.status === "active" ? (
        <Card>
          <LinkShareButtons url={link.url} message={message} />
        </Card>
      ) : (
        <Notice tone="info">{t("detail.notPayable")}</Notice>
      )}

      {canCancel(link) ? <LinkButton title={t("cancel.button")} color={colors.danger} onPress={() => setConfirm(true)} /> : null}

      <Sheet visible={confirm} onClose={() => setConfirm(false)} title={t("cancel.title")}>
        <T style={{ fontSize: 15, lineHeight: 22, color: colors.inkSoft }}>{t("cancel.body")}</T>
        <PillButton title={t("cancel.yes")} busy={busy} style={{ backgroundColor: colors.danger }} onPress={() => void cancel()} />
        <LinkButton title={t("cancel.keep")} onPress={() => setConfirm(false)} />
      </Sheet>
    </Screen>
  );
}
