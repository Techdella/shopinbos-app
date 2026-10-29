import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { router } from "expo-router";
import { AGREEMENT_POINTS, type StockCheck } from "@shared/supplier-trust";
import { cleanSignedName, dropshipDocument } from "@shared/contracts";
import { Badge } from "@/components/kit";
import { Card, Field, Notice, PillButton, T, Toggle } from "@/components/ui";
import { sendAgreement, type FindProduct, type Listing } from "@/lib/marketplace";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// What a seller should know about a supplier before selling their products (the web's SupplierTrust and
// BeforeYouList, shared/supplier-trust.ts): verified or not, the risk score and how far away; then, before
// dropshipping, call the supplier, see the stock and accept the Dropship agreement, which the supplier accepts too.
// Words: the shared "marketplace" namespace (trust.*), the same as the web.

const LEVEL = {
  low: { bg: colors.successTint, fg: colors.success },
  medium: { bg: "#FDF0D5", fg: "#8A5A00" },
  high: { bg: colors.dangerTint, fg: colors.danger },
} as const;

export function SupplierTrustBadges({ supplier }: { supplier: FindProduct["supplier"] }) {
  const t = useT("marketplace");
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {supplier.verificationStatus === "verified" ? (
        <Badge label={`✓ ${t("trust.verified")}`} bg={colors.successTint} fg={colors.success} />
      ) : (
        <Badge label={supplier.verificationStatus === "pending" ? t("trust.pending") : t("trust.unverified")} bg={colors.dangerTint} fg={colors.danger} />
      )}
      {supplier.risk ? <Badge label={t.dynamic(`trust.risk.${supplier.risk.level}`, supplier.risk.level, { score: supplier.risk.score })} bg={LEVEL[supplier.risk.level].bg} fg={LEVEL[supplier.risk.level].fg} /> : null}
      {supplier.far ? <Badge label={t("sup.farBadge")} bg="#FDF0D5" fg="#8A5A00" /> : null}
      {typeof supplier.km === "number" ? <Badge label={t("trust.km", { km: supplier.km < 1 ? "<1" : String(Math.round(supplier.km)) })} /> : null}
    </View>
  );
}

/** The supplier's risk reasons. `badges={false}` when the screen already shows SupplierTrustBadges (no pills twice). */
export function SupplierRiskCard({ supplier, badges = true }: { supplier: FindProduct["supplier"]; badges?: boolean }) {
  const t = useT("marketplace");
  if (!supplier.risk) return null;
  return (
    <Card style={{ gap: 8 }}>
      {badges ? <SupplierTrustBadges supplier={supplier} /> : null}
      {supplier.risk.reasons.length ? (
        supplier.risk.reasons.map((reason) => <T key={reason} style={{ fontSize: 14, lineHeight: 20 }}>{`• ${t.dynamic(`trust.reason.${reason}`, reason)}`}</T>)
      ) : (
        <T style={{ fontSize: 14 }}>{t("trust.noReasons")}</T>
      )}
      <T style={{ color: colors.inkSoft, fontSize: 13, lineHeight: 18 }}>{t("trust.riskHelp")}</T>
    </Card>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8, backgroundColor: colors.canvas, borderRadius: radii.card, padding: 12 }}>
      <T weight="extrabold" style={{ fontSize: 15 }}>{`${n}. ${title}`}</T>
      {children}
    </View>
  );
}

export function Check({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <T weight="bold" style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>{label}</T>
      <Toggle on={on} onChange={onChange} label={label} />
    </View>
  );
}

/** The full Dropship agreement (shared/contracts.ts), in English like the web. */
export function AgreementText({ doc }: { doc: ReturnType<typeof dropshipDocument> }) {
  return (
    <View style={{ gap: 10, backgroundColor: colors.surface, borderRadius: radii.card, padding: 12 }}>
      <T weight="extrabold" style={{ fontSize: 16 }}>{doc.title}</T>
      <T style={{ fontSize: 13.5 }}>{`${doc.partyA.name} (${doc.partyA.label}) · ${doc.partyB.name} (${doc.partyB.label})`}</T>
      {doc.sections.map((section, index) => (
        <View key={section.heading} style={{ gap: 4 }}>
          <T weight="bold" style={{ fontSize: 14 }}>{`${index + 1}. ${section.heading}`}</T>
          {section.paragraphs.map((paragraph, at) => <T key={at} style={{ fontSize: 13.5, lineHeight: 19 }}>{paragraph}</T>)}
        </View>
      ))}
    </View>
  );
}

/** The call, the stock check and the agreement, until both sides have agreed (then the seller can list). */
export function BeforeYouList({ product, listing, onSent }: { product: FindProduct; listing: Listing; onSent: () => void }) {
  const t = useT("marketplace", "contracts");
  const [signedName, setSignedName] = useState("");
  const [reading, setReading] = useState(false);
  const name = product.supplier.name;
  const [called, setCalled] = useState(false);
  const [stockCheck, setStockCheck] = useState<StockCheck | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const phone = listing.phone?.replace(/[^\d+]/g, "") ?? "";

  async function send() {
    if (!stockCheck) return;
    setBusy(true);
    setError(null);
    try {
      const result = await sendAgreement({ supplierId: product.supplier.id, called, stockCheck, agreed, note: note.trim() || undefined, signedName });
      setSent(result.message);
      onSent();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ gap: 4 }}>
        <T weight="extrabold" style={{ fontSize: 16 }} accessibilityRole="header">{t("trust.beforeTitle", { name })}</T>
        <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("trust.beforeSub")}</T>
      </View>
      {product.supplier.far ? <Notice tone="info">{t("sup.farFees")}</Notice> : null}
      {listing.step === "noPlace" ? (
        <>
          <Notice tone="info">{t("trust.addCity")}</Notice>
          <PillButton title={t("trust.addCityBtn")} tone="white" size="md" onPress={() => router.push("/settings")} />
        </>
      ) : listing.step === "waiting" || sent ? (
        <Notice tone="success">{sent ?? t("trust.waiting", { name })}</Notice>
      ) : (
        <>
          {listing.step === "declined" ? <Notice>{`${t("trust.declined", { name })}${listing.supplierNote ? ` "${listing.supplierNote}"` : ""}`}</Notice> : null}
          <Step n={1} title={t("trust.step.call", { name })}>
            {phone ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <PillButton title={listing.phone ?? ""} size="sm" onPress={() => void Linking.openURL(`tel:${phone}`)} />
                <PillButton title="WhatsApp" tone="white" size="sm" onPress={() => void Linking.openURL(`https://wa.me/${phone.replace(/\D/g, "").replace(/^0/, "234")}`)} />
              </View>
            ) : (
              <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("trust.noPhone")}</T>
            )}
            <T style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19 }}>{t("trust.callAsk")}</T>
            <Check on={called} onChange={setCalled} label={t("trust.called", { name })} />
          </Step>
          <Step n={2} title={t("trust.step.stock")}>
            {listing.address ? <T style={{ fontSize: 14 }}>{t("trust.where", { address: listing.address })}</T> : null}
            {(["visit", "video"] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected: stockCheck === value }}
                onPress={() => setStockCheck(value)}
                style={{ minHeight: 46, borderRadius: radii.pill, borderWidth: 1, borderColor: stockCheck === value ? colors.ink : colors.line, backgroundColor: stockCheck === value ? colors.ink : colors.surface, justifyContent: "center", paddingHorizontal: 16 }}
              >
                <T weight="bold" style={{ fontSize: 14, color: stockCheck === value ? "#FFFFFF" : colors.ink }}>{value === "visit" ? t("trust.visit") : t("trust.video")}</T>
              </Pressable>
            ))}
          </Step>
          <Step n={3} title={t("trust.step.agree")}>
            {Array.from({ length: AGREEMENT_POINTS }, (_, index) => <T key={index} style={{ fontSize: 13.5, lineHeight: 19 }}>{`• ${t.dynamic(`trust.point.${index}`, "")}`}</T>)}
            <Field value={note} onChangeText={setNote} placeholder={t("trust.notePh")} maxLength={600} multiline />
            <PillButton title={reading ? t("cancel") : t("sign.read")} tone="white" size="sm" onPress={() => setReading((on) => !on)} />
            {reading ? <AgreementText doc={dropshipDocument({ shop: { name: listing.shopName ?? "Your shop", city: listing.shopCity }, supplier: { name, city: product.supplier.city, address: listing.address }, stockCheck: stockCheck ?? "visit", sellerNote: note, returnPolicy: product.supplier.returnPolicy, date: new Date() })} /> : null}
            <Check on={agreed} onChange={setAgreed} label={`${t("trust.agree", { name })}. ${t("sign.confirm")}`} />
            <Field value={signedName} onChangeText={setSignedName} placeholder={t("sign.ph")} maxLength={80} autoComplete="name" accessibilityLabel={t("sign.label")} />
            <T style={{ color: colors.inkSoft, fontSize: 12.5, lineHeight: 17 }}>{t("sign.help")}</T>
          </Step>
          {error ? <Notice>{error}</Notice> : null}
          <PillButton title={busy ? t("trust.sending") : t("trust.send", { name })} size="md" tone="accent" busy={busy} disabled={!called || !stockCheck || !agreed || !cleanSignedName(signedName)} onPress={() => void send()} />
        </>
      )}
    </Card>
  );
}
