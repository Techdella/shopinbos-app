import { useState } from "react";
import { Alert, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { OFFER_SERVICES } from "@shared/delivery-market";
import { Eyebrow, List, Row, Seg, Small, Sub, Tile } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { Chips, PartnerMark } from "@/components/seller/bits";
import { LinkButton, Notice, PillButton, T, Toggle } from "@/components/ui";
import { fetchDeliveryHub, fetchPartnerPage, openPartnerChat, removeConnection, updateConnection, type Connection } from "@/lib/delivery";
import { coverageParts } from "@/lib/delivery-pure";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Delivery settings for one partner (the prototype's dvConn): what customers can choose, what checkout calls it,
// pay on delivery (both sides switch it on, and the business accepts the pay-on-delivery note first), their rates
// and a chat. Remove partner ends the connection; jobs already sent carry on.

export default function ConnectionSettings() {
  const t = useT("m_delivery", "delivery", "common");
  const { id } = useLocalSearchParams<{ id: string }>();
  const loaded = useLoad(async () => {
    const hub = await fetchDeliveryHub();
    const connection = hub.connections.find((entry) => entry.id === String(id)) ?? null;
    const page = connection ? await fetchPartnerPage(connection.partner.slug).catch(() => null) : null;
    return { role: hub.role, connection, page };
  }, String(id));
  const data = loaded.data;

  if (!data?.connection) {
    return (
      <Screen title={t("conn.title")}>
        {loaded.loading ? <LoadingBlock /> : null}
        {loaded.error ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
        {data && !data.connection ? <Notice tone="info">{t("conn.gone")}</Notice> : null}
      </Screen>
    );
  }
  return <ConnectionForm key={data.connection.id} role={data.role} connection={data.connection} cover={data.page ? coverageParts(data.page.partner) : null} onChanged={() => void loaded.reload()} />;
}

function ConnectionForm({ role, connection, cover, onChanged }: { role: string; connection: Connection; cover: { from: string; to: string } | null; onChanged: () => void }) {
  const t = useT("m_delivery", "delivery", "common");
  const partner = connection.partner;
  const offered = OFFER_SERVICES.filter((service) => partner.services.includes(service));
  const [services, setServices] = useState<string[]>(connection.services.filter((service) => (offered as readonly string[]).includes(service)));
  const [showName, setShowName] = useState(connection.showPartnerName);
  const [pod, setPod] = useState(connection.ownerPod);
  const [podSheet, setPodSheet] = useState(false);
  const [busy, setBusy] = useState<"save" | "pod" | "remove" | null>(null);
  const [note, setNote] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function save() {
    setBusy("save");
    setNote(null);
    try {
      await updateConnection(connection.id, { services, showPartnerName: showName });
      setNote({ tone: "success", text: t("flash.partnerSaved") });
      onChanged();
    } catch (saveError) {
      setNote({ tone: "error", text: saveError instanceof Error ? saveError.message : t("saveFailed") });
    } finally {
      setBusy(null);
    }
  }

  async function switchPod(on: boolean) {
    setBusy("pod");
    setNote(null);
    try {
      await updateConnection(connection.id, on ? { ownerPod: true, acceptPodDisclaimer: true } : { ownerPod: false });
      setPod(on);
      setPodSheet(false);
    } catch (podError) {
      setNote({ tone: "error", text: podError instanceof Error ? podError.message : t("saveFailed") });
      setPodSheet(false);
    } finally {
      setBusy(null);
    }
  }

  function confirmRemove() {
    Alert.alert(t("conn.removeTitle", { name: partner.name }), t("conn.removeBody"), [
      { text: t("conn.keep"), style: "cancel" },
      {
        text: t("removePartner"),
        style: "destructive",
        onPress: async () => {
          setBusy("remove");
          try {
            await removeConnection(connection.id);
            router.replace("/delivery");
          } catch (removeError) {
            setNote({ tone: "error", text: removeError instanceof Error ? removeError.message : t("saveFailed") });
            setBusy(null);
          }
        },
      },
    ]);
  }

  const podWords = !partner.offersPayOnDelivery ? t("pod.partnerDoesNotOffer") : !pod ? t("conn.podOff") : connection.partnerPod ? t("conn.podOn") : t("conn.podWaiting", { name: partner.name });

  return (
    <Screen
      title={t("conn.title")}
      footer={
        <>
          {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
          <PillButton title={t("save")} tone="accent" busy={busy === "save"} disabled={!services.length || busy === "remove"} onPress={() => void save()} />
        </>
      }
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <PartnerMark name={partner.name} logoUrl={partner.logoUrl} />
        <View style={{ flex: 1, gap: 3 }}>
          <T weight="bold" style={{ fontSize: 19 }} accessibilityRole="header">{partner.name}</T>
          {cover ? <Sub style={{ fontSize: 14, lineHeight: 19 }}>{t("partner.coverageLine", { from: cover.from || "—", to: cover.to || "—" })}</Sub> : null}
        </View>
      </View>

      <Eyebrow>{t("conn.choose")}</Eyebrow>
      <List>
        {offered.map((service) => {
          const on = services.includes(service);
          const label = t.dynamic(`service.${service}`, service);
          return (
            <Row
              key={service}
              title={label}
              right={<Toggle on={on} label={label} onChange={(next) => setServices((current) => (next ? [...current, service] : current.filter((entry) => entry !== service)))} />}
            />
          );
        })}
      </List>
      {!services.length ? <Small style={{ color: colors.danger }}>{t("conn.needOne")}</Small> : null}

      <View style={{ gap: 10 }}>
        <Small style={{ fontSize: 14 }}>{t("conn.callIt")}</Small>
        <Chips>
          <Seg label={t("conn.standard")} on={!showName} onPress={() => setShowName(false)} />
          <Seg label={partner.name} on={showName} onPress={() => setShowName(true)} />
        </Chips>
      </View>

      <List>
        <Row
          title={t("pod.title")}
          sub={podWords}
          right={partner.offersPayOnDelivery ? <Toggle on={pod} label={t("pod.title")} onChange={(next) => (next ? setPodSheet(true) : void switchPod(false))} /> : undefined}
        />
      </List>

      <List>
        <Row lead={<Tile icon="tag" tone="gray" />} title={t("conn.rates")} onPress={() => router.push({ pathname: "/delivery/partner/[slug]", params: { slug: partner.slug } })} />
        <Row lead={<Tile icon="chat" tone="gray" />} title={t("partner.chat")} onPress={() => openPartnerChat(role, { userId: partner.userId, name: partner.name })} />
      </List>

      <LinkButton title={busy === "remove" ? t("conn.removing") : t("removePartner")} color={colors.danger} onPress={confirmRemove} />

      <Sheet visible={podSheet} onClose={() => setPodSheet(false)} title={t("podSheet.title")}>
        <Sub>{t("pod.disclaimer")}</Sub>
        <Small>{t("podSheet.note", { name: partner.name })}</Small>
        <PillButton tone="accent" busy={busy === "pod"} accessibilityLabel={t("podSheet.on")} onPress={() => void switchPod(true)} title={t("podSheet.on")} />
        <PillButton title={t("cancel")} tone="white" onPress={() => setPodSheet(false)} />
      </Sheet>
    </Screen>
  );
}
