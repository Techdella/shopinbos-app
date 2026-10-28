import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { naira } from "@shared/onboarding";
import { SIZE_BANDS, type SizeBand } from "@shared/delivery-market";
import { List, Pill, Row, Seg, Small, Tile } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { Chips, PartnerMark, Section } from "@/components/seller/bits";
import { Field, Label, Notice, PillButton, T, Toggle } from "@/components/ui";
import { fetchDeliveryHub, saveDeliverySettings, type DeliveryHub, type DeliverySettings, type SettingsPatch } from "@/lib/delivery";
import { stateName, whereWords } from "@/lib/delivery-pure";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Delivery (the "Seller app" prototype's dvHub) for sellers and suppliers: where I sell, my delivery partners (and
// private rates waiting for me), Find delivery partners, and my own options. Sellers also choose what customers see
// when no partner covers an address, pick up from them, and which prices checkout uses (their own delivery prices,
// app/delivery/zones.tsx, or their partners'). Suppliers say where they ship from, their usual parcel size and
// whether they deliver orders themselves ("I deliver myself", with a fee); the settings route ignores the rest.

export default function DeliveryHubScreen() {
  const t = useT("m_delivery", "delivery", "common");
  const f = useT("m_faults");
  const hub = useLoad(fetchDeliveryHub);
  const [note, setNote] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"pickup" | "fee" | "self" | null>(null);
  const data = hub.data;

  /** Saves at once and shows the change straight away; puts it back if the server says no. */
  async function save(patch: SettingsPatch) {
    if (!data) return false;
    const before = data;
    hub.setData({
      ...data,
      settings: {
        ...data.settings,
        ...patch,
        fallbackFee: patch.fallbackFee === undefined ? data.settings.fallbackFee : Number(patch.fallbackFee),
        selfDeliveryFee: patch.selfDeliveryFee === undefined ? data.settings.selfDeliveryFee : Number(patch.selfDeliveryFee),
      },
    });
    setNote(null);
    try {
      const saved = await saveDeliverySettings(patch);
      hub.setData((current: DeliveryHub | null) => (current ? { ...current, settings: saved.settings } : current));
      return true;
    } catch (saveError) {
      hub.setData(before);
      setNote(saveError instanceof Error ? saveError.message : t("saveFailed"));
      return false;
    }
  }

  const seller = data?.role !== "supplier";
  const settings = data?.settings;
  const offers = (data?.privateCards ?? []).filter((card) => card.status === "proposed");
  const origin = settings ? [settings.originArea, settings.originState ? stateName(settings.originState) : null].filter(Boolean).join(", ") || data?.city || null : null;
  const pickupPlace = settings?.pickupAddress || origin;

  return (
    <Screen title={t("hub.title")} refreshing={hub.refreshing} onRefresh={() => void hub.refresh()}>
      {hub.loading && !data ? <LoadingBlock /> : null}
      {hub.error && !data ? <ErrorState message={hub.error} onRetry={() => void hub.reload()} /> : null}
      {note ? <Notice>{note}</Notice> : null}

      {data && settings ? (
        <>
          <List>
            <Row lead={<Tile icon="globe" tone="gray" />} title={t("where.title")} sub={whereWords(settings, t)} onPress={() => router.push("/delivery/where")} />
            <Row lead={<Tile icon="pin" tone="gray" />} title={t("hub.shipFrom")} sub={origin ?? t("hub.shipFromAdd")} onPress={() => router.push("/delivery/where")} />
          </List>

          <Section title={t("hub.partners")}>
            {offers.length || data.connections.length ? (
              <List>
                {offers.map((card) => (
                  <Row
                    key={card.id}
                    lead={<Tile icon="tag" tone="warn" />}
                    title={t("hub.rateRow", { name: card.partner.displayName })}
                    sub={t("hub.rateRowSub")}
                    onPress={() => router.push({ pathname: "/delivery/rate/[id]", params: { id: card.id } })}
                  />
                ))}
                {data.connections.map((connection) => (
                  <Row
                    key={connection.id}
                    lead={<PartnerMark name={connection.partner.name} logoUrl={connection.partner.logoUrl} />}
                    title={connection.partner.name}
                    sub={connection.partner.live ? connection.services.map((service) => t.dynamic(`service.${service}`, service)).join(" · ") : t("hub.paused")}
                    right={!connection.partner.live ? <Pill label={t("hub.pausedPill")} tone="gray" /> : undefined}
                    chevron
                    onPress={() => router.push({ pathname: "/delivery/connection/[id]", params: { id: connection.id } })}
                  />
                ))}
              </List>
            ) : (
              <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 20 }}>
                <T style={{ fontSize: 15, lineHeight: 22, color: colors.inkSoft }}>{t("hub.noPartners")}</T>
              </View>
            )}
            <PillButton tone="accent" onPress={() => router.push("/delivery/find")} accessibilityLabel={t("hub.find")} icon="search" title={t("hub.find")} />
          </Section>

          <Section title={t("hub.own")}>
            <List>
              {seller ? (
                <Row
                  title={t("hub.pickup")}
                  sub={pickupPlace ? [t("hub.free"), pickupPlace, settings.pickupHours].filter(Boolean).join(" · ") : t("hub.pickupAdd")}
                  onPress={() => setSheet("pickup")}
                  chevron={false}
                  accessibilityLabel={t("hub.pickupEdit")}
                  right={
                    <Toggle
                      on={settings.selfPickup}
                      label={t("hub.pickup")}
                      onChange={(on) => {
                        if (on && !settings.pickupAddress) setSheet("pickup");
                        else void save({ selfPickup: on });
                      }}
                    />
                  }
                />
              ) : null}
              {seller ? (
                <View style={{ paddingBottom: 14 }}>
                  <Row title={t("hub.fallback")} sub={t("hub.fallbackSub")} />
                  <View style={{ paddingHorizontal: 16 }}>
                    <Chips>
                      <Seg label={t("hub.pickupOnly")} on={settings.fallback !== "flat_fee"} onPress={() => void save({ fallback: "pickup_only" })} />
                      <Seg
                        label={settings.fallback === "flat_fee" && settings.fallbackFee > 0 ? t("hub.flatFee", { amount: naira(settings.fallbackFee) }) : t("hub.flatFeeAsk")}
                        on={settings.fallback === "flat_fee"}
                        onPress={() => setSheet("fee")}
                      />
                    </Chips>
                  </View>
                </View>
              ) : null}
              {!seller ? (
                <Row
                  title={t("self.title")}
                  sub={settings.selfDelivery && settings.selfDeliveryFee ? t("self.on", { amount: naira(settings.selfDeliveryFee), place: origin ?? t("self.yourState") }) : t("self.sub")}
                  onPress={() => setSheet("self")}
                  chevron={false}
                  accessibilityLabel={t("self.edit")}
                  right={
                    <Toggle
                      on={Boolean(settings.selfDelivery)}
                      label={t("self.title")}
                      onChange={(on) => {
                        if (on && !settings.selfDeliveryFee) setSheet("self");
                        else void save({ selfDelivery: on });
                      }}
                    />
                  }
                />
              ) : null}
              <View style={{ paddingBottom: 14 }}>
                <Row title={t("hub.size")} sub={t("hub.sizeSub")} />
                <View style={{ paddingHorizontal: 16 }}>
                  <Chips>
                    {SIZE_BANDS.map((band: SizeBand) => (
                      <Seg key={band} label={t(`size2.${band}`)} on={settings.defaultSizeBand === band} onPress={() => void save({ defaultSizeBand: band })} />
                    ))}
                  </Chips>
                </View>
              </View>
              {seller ? (
                <View style={{ paddingBottom: 14 }}>
                  <Row title={t("hub.checkout")} sub={t("hub.checkoutSub")} />
                  <View style={{ paddingHorizontal: 16 }}>
                    <Chips>
                      <Seg label={t("hub.modePartners")} on={settings.checkoutMode === "partners"} onPress={() => void save({ checkoutMode: "partners" })} />
                      <Seg label={t("hub.modeZones")} on={settings.checkoutMode !== "partners"} onPress={() => void save({ checkoutMode: "zones" })} />
                    </Chips>
                  </View>
                </View>
              ) : null}
              {seller ? <Row lead={<Tile icon="coin" tone="gray" />} title={t("hub.zones")} sub={t("hub.zonesSub")} onPress={() => router.push("/delivery/zones")} /> : null}
              {/* Returns for a change of mind (shared/fault-matrix.ts): on or off, the window, who pays the trip back. */}
              {seller ? <Row lead={<Tile icon="route" tone="gray" />} title={f("settings.title")} sub={f("settings.rowSub")} onPress={() => router.push("/delivery/returns")} /> : null}
            </List>
          </Section>

          {seller ? (
            <PickupSheet
              visible={sheet === "pickup"}
              settings={settings}
              onClose={() => setSheet(null)}
              onSave={async (patch) => {
                if (await save(patch)) setSheet(null);
              }}
            />
          ) : null}
          {!seller ? (
            <FeeSheet
              visible={sheet === "self"}
              fee={settings.selfDeliveryFee ?? 0}
              title={t("self.feeTitle")}
              sub={t("self.feeSub")}
              onClose={() => setSheet(null)}
              onSave={async (fee) => {
                if (await save({ selfDelivery: true, selfDeliveryFee: fee })) setSheet(null);
              }}
            />
          ) : null}
          {seller ? (
            <FeeSheet
              visible={sheet === "fee"}
              fee={settings.fallbackFee}
              onClose={() => setSheet(null)}
              onSave={async (fee) => {
                if (await save({ fallback: "flat_fee", fallbackFee: fee })) setSheet(null);
              }}
            />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

/** Where customers pick up from the shop: the address (needed to switch it on), hours and directions. */
function PickupSheet({ visible, settings, onClose, onSave }: { visible: boolean; settings: DeliverySettings; onClose: () => void; onSave: (patch: SettingsPatch) => Promise<void> }) {
  const t = useT("m_delivery", "common");
  const [address, setAddress] = useState(settings.pickupAddress ?? "");
  const [hours, setHours] = useState(settings.pickupHours ?? "");
  const [directions, setDirections] = useState(settings.pickupInstructions ?? "");
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(visible);
  if (shown !== visible) {
    setShown(visible);
    if (visible) {
      setAddress(settings.pickupAddress ?? "");
      setHours(settings.pickupHours ?? "");
      setDirections(settings.pickupInstructions ?? "");
    }
  }
  return (
    <Sheet visible={visible} onClose={onClose} title={t("pickup.title")}>
      <View>
        <Label>{t("pickup.address")}</Label>
        <Field value={address} onChangeText={setAddress} maxLength={200} placeholder={t("pickup.addressPlaceholder")} accessibilityLabel={t("pickup.address")} />
      </View>
      <View>
        <Label>{t("pickup.hours")}</Label>
        <Field value={hours} onChangeText={setHours} maxLength={120} placeholder={t("pickup.hoursPlaceholder")} accessibilityLabel={t("pickup.hours")} />
      </View>
      <View>
        <Label>{t("pickup.directions")}</Label>
        <Field value={directions} onChangeText={setDirections} maxLength={300} placeholder={t("pickup.directionsPlaceholder")} accessibilityLabel={t("pickup.directions")} />
      </View>
      <PillButton
        title={settings.selfPickup ? t("save") : t("pickup.turnOn")}
        tone="accent"
        busy={busy}
        disabled={!address.trim()}
        onPress={async () => {
          setBusy(true);
          await onSave({ selfPickup: true, pickupAddress: address.trim(), pickupHours: hours.trim(), pickupInstructions: directions.trim() });
          setBusy(false);
        }}
      />
    </Sheet>
  );
}

/** The flat fee customers pay when none of the shop's partners covers their address. */
function FeeSheet({ visible, fee, title, sub, onClose, onSave }: { visible: boolean; fee: number; title?: string; sub?: string; onClose: () => void; onSave: (fee: number) => Promise<void> }) {
  const t = useT("m_delivery", "common");
  const [text, setText] = useState(fee ? String(fee) : "");
  const [busy, setBusy] = useState(false);
  const amount = Number(text.replace(/[^\d.]/g, ""));
  return (
    <Sheet visible={visible} onClose={onClose} title={title ?? t("fee.title")}>
      <Small style={{ fontSize: 15, lineHeight: 21 }}>{sub ?? t("fee.sub")}</Small>
      <View>
        <Label>{t("fee.label")}</Label>
        <Field value={text} onChangeText={(value) => setText(value.replace(/[^\d.,]/g, ""))} keyboardType="number-pad" placeholder="3000" accessibilityLabel={t("fee.label")} />
      </View>
      <PillButton
        title={t("save")}
        tone="accent"
        busy={busy}
        disabled={!(amount > 0)}
        onPress={async () => {
          setBusy(true);
          await onSave(amount);
          setBusy(false);
        }}
      />
    </Sheet>
  );
}
