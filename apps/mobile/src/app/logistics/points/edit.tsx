import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { LabeledInput } from "@/components/PartnerKit";
import { Screen } from "@/components/Screen";
import { LinkButton, Notice, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { addPickupPoint, editPickupPoint, fetchMarket, removePickupPoint, type PickupPoint } from "@/lib/logistics";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// New or changed pickup point ("Delivery partner app" prototype `pointAdd`): name, address, state, LGA or city,
// opening hours, contact phone, and an optional pin (where you're standing now). Remove sits under it.

function PointForm({ point }: { point: PickupPoint | null }) {
  const t = useT("m_partner", "common");
  const [name, setName] = useState(point?.name ?? "");
  const [address, setAddress] = useState(point?.address ?? "");
  const [state, setState] = useState(point?.state ?? "");
  const [area, setArea] = useState(point?.area ?? "");
  const [hours, setHours] = useState(point?.hours ?? "");
  const [phone, setPhone] = useState(point?.phone ?? "");
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(point?.lat != null && point?.lng != null ? { lat: point.lat, lng: point.lng } : null);
  const [busy, setBusy] = useState<null | "save" | "pin" | "remove">(null);
  const [error, setError] = useState<string | null>(null);

  async function dropPin() {
    setBusy("pin");
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) return setError(t("points.pinOff"));
      const here = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setPin({ lat: Math.round(here.coords.latitude * 1e5) / 1e5, lng: Math.round(here.coords.longitude * 1e5) / 1e5 });
    } catch {
      setError(t("points.pinFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!name.trim() || !address.trim() || !state.trim()) return setError(t("points.needFields"));
    setBusy("save");
    setError(null);
    const input = { name: name.trim(), address: address.trim(), state: state.trim(), area: area.trim(), hours: hours.trim(), phone: phone.trim(), lat: pin?.lat ?? null, lng: pin?.lng ?? null };
    try {
      if (point) await editPickupPoint(point.id, input);
      else await addPickupPoint(input);
      router.back();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("error.retry"));
    } finally {
      setBusy(null);
    }
  }

  function remove() {
    if (!point) return;
    Alert.alert(t("points.removeTitle"), t("points.removeBody", { name: point.name }), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("remove"),
        style: "destructive",
        onPress: () => {
          setBusy("remove");
          removePickupPoint(point.id)
            .then(() => router.back())
            .catch((removeError: unknown) => setError(removeError instanceof Error ? removeError.message : t("error.retry")))
            .finally(() => setBusy(null));
        },
      },
    ]);
  }

  return (
    <Screen title={point ? point.name : t("points.new")} footer={<PillButton tone="forest" title={t("save")} busy={busy === "save"} disabled={Boolean(busy)} onPress={() => void save()} />}>
      <LabeledInput label={t("points.name")} value={name} onChangeText={setName} autoCapitalize="words" />
      <LabeledInput label={t("points.address")} value={address} onChangeText={setAddress} autoCapitalize="words" />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <LabeledInput label={t("points.state")} value={state} onChangeText={setState} autoCapitalize="words" />
        </View>
        <View style={{ flex: 1 }}>
          <LabeledInput label={t("points.area")} value={area} onChangeText={setArea} autoCapitalize="words" />
        </View>
      </View>
      <LabeledInput label={t("points.hours")} value={hours} onChangeText={setHours} />
      <LabeledInput label={t("points.phone")} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Pressable
        accessibilityRole="button"
        disabled={Boolean(busy)}
        onPress={() => void dropPin()}
        style={({ pressed }) => ({ height: 150, borderRadius: 20, backgroundColor: "#E9EEE8", borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: pressed ? 0.85 : 1 })}
      >
        <AppIcon name="pin" size={18} color={pin ? colors.success : colors.grayInk} />
        <T weight="bold" style={{ color: pin ? colors.success : colors.grayInk }}>{busy === "pin" ? t("points.pinning") : pin ? t("points.pinned") : t("points.pin")}</T>
      </Pressable>
      {error ? <Notice>{error}</Notice> : null}
      {point ? <LinkButton title={t("points.remove")} color={colors.danger} onPress={remove} /> : null}
    </Screen>
  );
}

export default function PointEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const t = useT("m_partner");
  const market = useLoad(fetchMarket);
  if (!id) return <PointForm point={null} />;
  const point = market.data?.pickupPoints.find((entry) => entry.id === id);
  if (point) return <PointForm point={point} />;
  return (
    <Screen title={t("biz.points")}>
      {market.loading ? <LoadingBlock /> : null}
      {market.error ? <ErrorState message={market.error} onRetry={() => void market.reload()} /> : null}
    </Screen>
  );
}
