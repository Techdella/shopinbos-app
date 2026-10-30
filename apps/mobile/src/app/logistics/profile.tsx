import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { NATIONWIDE, startingPrice } from "@shared/delivery-market";
import { naira } from "@shared/onboarding";
import { List, Pill, Row, Small, Sub, Tile } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Initial, LabeledInput } from "@/components/PartnerKit";
import { Screen } from "@/components/Screen";
import { Card, Notice, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchMarket, saveBusiness, type MarketData } from "@/lib/logistics";
import { SERVICE_KEYS, stateLabel } from "@/lib/logistics-pure";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Business details ("Delivery partner app" prototype `profile`): the company's name, CAC number, contact person,
// phone, email and office address, edited here (PUT /api/mobile/logistics/market { section: "business" }, the
// set-up's own call), then the card sellers and suppliers find you by, built from your rating, rate card, coverage,
// services and pickup points. Peggy's "Business details" step opens this screen.

type Details = { companyName: string; cacNumber: string; contactName: string; contactPhone: string; contactEmail: string; address: string };

function detailsOf(partner: MarketData["partner"]): Details {
  return {
    companyName: partner.companyName ?? partner.name ?? "",
    cacNumber: partner.cacNumber ?? "",
    contactName: partner.contactName ?? "",
    contactPhone: partner.contactPhone ?? "",
    contactEmail: partner.contactEmail ?? "",
    address: partner.address ?? "",
  };
}

export default function ProfilePreview() {
  const t = useT("m_partner", "common");
  const tDetails = useT("details");
  const market = useLoad(fetchMarket);
  const data = market.data;
  const [form, setForm] = useState<Details | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  // Start from what's saved (once; a refresh after saving doesn't overwrite what's being typed). Set while
  // rendering, guarded so it settles at once.
  if (data && !form) setForm(detailsOf(data.partner));

  const set = (key: keyof Details) => (value: string) => {
    setNote(null);
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };
  const changed = Boolean(data && form && JSON.stringify(form) !== JSON.stringify(detailsOf(data.partner)));

  async function save() {
    if (!form) return;
    if (form.companyName.trim().length < 2) return setNote({ tone: "error", text: t("profile.needName") });
    setBusy(true);
    setNote(null);
    try {
      const trimmed = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()])) as Details;
      await saveBusiness(trimmed);
      setForm(trimmed);
      setNote({ tone: "success", text: t("profile.saved") });
      await market.reload();
    } catch (error) {
      setNote({ tone: "error", text: error instanceof Error ? error.message : t("error.retry") });
    } finally {
      setBusy(false);
    }
  }

  let card = null;
  if (data) {
    const partner = data.partner;
    const rows = data.rateCard?.rows ?? [];
    const from = startingPrice(rows);
    const min = rows.length ? Math.min(...rows.map((row) => row.minDays)) : null;
    const max = rows.length ? Math.max(...rows.map((row) => row.maxDays)) : null;
    const time = max === null ? null : max <= 0 ? t("days.same") : min === max ? t("days.n", { count: max }) : t("days.range", { min: min ?? 0, max });
    const headline = [partner.ratingCount > 0 ? `★ ${partner.rating.toFixed(1)}` : null, from !== null ? t("profile.from", { price: naira(from) }) : null, time].filter(Boolean).join(" · ");
    const delivers = partner.deliveryAreas.includes(NATIONWIDE) ? t("profile.nationwide") : t("profile.deliversTo", { places: partner.deliveryAreas.map(stateLabel).join(", ") });
    const detail = [
      partner.pickupAreas.length ? t("profile.picksUp", { places: partner.pickupAreas.map(stateLabel).join(", ") }) : null,
      partner.deliveryAreas.length ? delivers : null,
      partner.services.map((service) => t.dynamic(SERVICE_KEYS[service] ?? service, service)).join(", ") || null,
      data.pickupPoints.length ? t("biz.pointsSub", { count: data.pickupPoints.length }) : null,
    ].filter(Boolean).join(" · ");
    card = (
      <Card style={{ padding: 20, gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <Initial name={partner.name} />
          <View style={{ flex: 1, gap: 3 }}>
            <T weight="bold" style={{ fontSize: 16 }}>{partner.name}</T>
            {headline ? <T style={{ fontSize: 14, color: colors.inkSoft }}>{headline}</T> : null}
          </View>
          {partner.verificationStatus === "verified" ? <Pill tone="ok" label={t("verify.verified.label")} /> : null}
        </View>
        {detail ? <Small>{detail}</Small> : null}
      </Card>
    );
  }

  return (
    <Screen
      title={t("profile.detailsTitle")}
      refreshing={market.refreshing}
      onRefresh={() => void market.refresh()}
      footer={form && changed ? <PillButton tone="forest" title={t("profile.save")} busy={busy} disabled={busy} onPress={() => void save()} /> : null}
    >
      {market.loading && !data ? <LoadingBlock /> : null}
      {market.error && !data ? <ErrorState message={market.error} onRetry={() => void market.reload()} /> : null}
      {/* The person's own name, email and phone (and the company's phone, base address and state) are in My details. */}
      <List>
        <Row lead={<Tile icon="user" tone="peach" />} title={tDetails("menu")} sub={tDetails("menuHint")} onPress={() => router.push("/my-details")} />
      </List>
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      {form ? (
        <View style={{ gap: 14 }}>
          <LabeledInput label={t("setup.company")} value={form.companyName} onChangeText={set("companyName")} autoCapitalize="words" maxLength={120} />
          <LabeledInput label={t("setup.cac")} value={form.cacNumber} onChangeText={set("cacNumber")} autoCapitalize="characters" maxLength={40} />
          <LabeledInput label={t("setup.contact")} value={form.contactName} onChangeText={set("contactName")} autoCapitalize="words" autoComplete="name" maxLength={80} />
          <LabeledInput label={t("setup.phone")} value={form.contactPhone} onChangeText={set("contactPhone")} keyboardType="phone-pad" maxLength={30} />
          <LabeledInput label={t("setup.email")} value={form.contactEmail} onChangeText={set("contactEmail")} keyboardType="email-address" autoCapitalize="none" maxLength={120} />
          <LabeledInput label={t("setup.office")} value={form.address} onChangeText={set("address")} autoCapitalize="words" maxLength={300} />
        </View>
      ) : null}
      {card ? (
        <View style={{ gap: 10 }}>
          <Sub>{t("profile.sub")}</Sub>
          {card}
          <Small>{t("profile.private")}</Small>
        </View>
      ) : null}
    </Screen>
  );
}
