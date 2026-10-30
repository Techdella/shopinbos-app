import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { naira } from "@shared/onboarding";
import { adMoney } from "@/components/ads";
import { MetaCard } from "@/components/MetaAdsCard";
import { AppIcon, type AppIconName } from "@/components/icons";
import { ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Chip, Field, Label, LinkButton, Notice, PillButton, ProgressBars, T } from "@/components/ui";
import { campaignAction, connectMetaAds, fetchAds, saveCampaignDraft, sendAdRequest, writeAdCopy } from "@/lib/ads";
import {
  AD_COUNTRIES,
  AD_CTAS,
  AD_OBJECTIVES,
  AD_SETUP_FEES,
  BUDGET_CHOICES,
  DAY_CHOICES,
  NG_STATES,
  WIZARD_STEPS,
  applyCopy,
  campaignBody,
  campaignTotal,
  canGoOn,
  defaultMode,
  detailsReady,
  lagosDayFrom,
  minBudget,
  modeFee,
  requestBody,
  syncCreatives,
  type AdAudience,
  type AdCreative,
  type AdMode,
  type AdObjective,
  type TeamDetails,
  type WizardStep,
} from "@/lib/ads-pure";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";
import { StatePicker } from "@/components/StatePicker";

// Start a campaign (web /home/ads/new), step by step: how it runs (your own Meta ad account when it's connected,
// or the Shopinbos ads team on Meta or TikTok for the setup fee), the products, goal and audience, budget and
// dates, the ads' words (Peggy can write them), then launch or save on Meta, or send the request to the team and
// pay the fee (Paystack opens in the browser). Pictures come from each product; videos and other pictures are on the web.

const START_CHOICES = [0, 1, 7] as const;

function RadioCard({ icon, title, sub, on, disabled, onPress }: { icon: AppIconName; title: string; sub: string; on: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={{ flexDirection: "row", gap: 12, alignItems: "center", padding: 14, borderRadius: 20, borderWidth: 2, borderColor: on ? colors.ink : colors.line, backgroundColor: colors.surface, opacity: disabled ? 0.5 : 1 }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" }}>
        <AppIcon name={icon} size={20} color={colors.accentInk} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T weight="extrabold" style={{ fontSize: 16 }}>{title}</T>
        <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{sub}</T>
      </View>
      {on ? <AppIcon name="check" size={20} /> : null}
    </Pressable>
  );
}

export default function NewAdCampaign() {
  const t = useT("m_ads", "ads", "m_ui");
  const params = useLocalSearchParams<{ product?: string }>();
  const data = useLoad(fetchAds);
  const overview = data.data;
  const [step, setStep] = useState<WizardStep>("how");
  const [mode, setMode] = useState<AdMode | null>(null);
  const [productIds, setProductIds] = useState<string[]>(params.product ? [String(params.product)] : []);
  const [query, setQuery] = useState("");
  const [objective, setObjective] = useState<AdObjective>("traffic");
  const [audience, setAudience] = useState<AdAudience>({ countries: ["NG"], states: [], ageMin: 18, ageMax: 55, gender: "all", interests: [] });
  const [interest, setInterest] = useState("");
  const [dailyBudget, setDailyBudget] = useState(5000);
  const [startIn, setStartIn] = useState<number>(0);
  const [days, setDays] = useState(7);
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [name, setName] = useState("");
  const [details, setDetails] = useState<TeamDetails | null>(null);
  const [busy, setBusy] = useState<"copy" | "launch" | "draft" | "pay" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const meta = overview?.meta ?? { configured: false, status: "off" as const, accountId: null, accountName: null, pageName: null, currency: "NGN" };
  const chosenMode: AdMode = mode ?? defaultMode(meta);
  const currency = chosenMode === "meta" ? meta.currency : "NGN";
  const setupFees = overview?.prices?.setup ?? AD_SETUP_FEES;
  const minDailyNgn = overview?.prices?.minDailyNgn;
  const fee = modeFee(chosenMode, setupFees);
  const products = useMemo(() => overview?.products ?? [], [overview]);
  const chosen = products.filter((product) => productIds.includes(product.id));
  const money = (value: number) => adMoney(value, currency);

  // Every chosen product gets a photo ad; ads of products taken out go (worked out while rendering, React's
  // "adjust state when a prop changes" pattern, so there's no extra render pass).
  const adsFor = `${products.length}|${productIds.join(",")}|${objective}`;
  const [syncedFor, setSyncedFor] = useState("");
  if (adsFor !== syncedFor) {
    setSyncedFor(adsFor);
    setCreatives((current) => syncCreatives(current, products, productIds, objective, naira));
  }
  if (overview && !details) setDetails({ ...overview.contact, handle: "", pageUrl: "", goals: "" });

  if (!overview) {
    return (
      <Screen title={t("c.title")}>
        {data.error ? <ErrorState message={data.error} onRetry={() => void data.reload()} /> : <LoadingBlock />}
      </Screen>
    );
  }

  const index = WIZARD_STEPS.indexOf(step);
  const state = { mode: chosenMode, meta, productIds, audience, dailyBudget, currency, days, creatives, minDailyNgn };
  const ready = canGoOn(step, state);
  const campaignName = name.trim() || (chosen.length === 1 ? t("c.nameOne", { product: chosen[0].name }) : t("c.nameMany", { count: chosen.length || productIds.length }));
  const visible = products.filter((product) => !query.trim() || product.name.toLowerCase().includes(query.trim().toLowerCase()));

  function update(i: number, patch: Partial<AdCreative>) {
    setCreatives((current) => current.map((creative, n) => (n === i ? { ...creative, ...patch } : creative)));
  }

  function toggle<V>(list: V[], value: V) {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  async function writeWithPeggy() {
    setBusy("copy");
    setProblem(null);
    try {
      const copy = await writeAdCopy(productIds, objective);
      setCreatives((current) => applyCopy(current, copy));
    } catch (copyError) {
      setProblem(copyError instanceof Error ? copyError.message : t("c.err.copy"));
    } finally {
      setBusy(null);
    }
  }

  async function finish(launch: boolean) {
    setBusy(chosenMode === "meta" ? (launch ? "launch" : "draft") : "pay");
    setProblem(null);
    try {
      const body = campaignBody({ name: campaignName, mode: chosenMode, objective, productIds, audience, creatives, dailyBudget, currency, startAt: lagosDayFrom(startIn), days });
      const saved = await saveCampaignDraft(body);
      if (chosenMode === "meta") {
        if (launch) await campaignAction(saved.id, "launch");
        router.replace({ pathname: "/ads", params: { done: launch ? "launched" : "draft" } });
        return;
      }
      const paid = await sendAdRequest(requestBody(saved.id, chosenMode, objective, audience, dailyBudget, days, details!));
      router.replace({ pathname: "/ads", params: { done: paid.outcome === "paid" ? "requestPaid" : paid.outcome === "pending" ? "request" : "requestUnpaid" } });
    } catch (finishError) {
      setProblem(finishError instanceof Error ? finishError.message : t("c.err.save"));
      setBusy(null);
    }
  }

  const goBack = () => (index === 0 ? router.back() : setStep(WIZARD_STEPS[index - 1]));
  const footer =
    step === "review" ? null : (
      <View style={{ gap: 6 }}>
        <PillButton title={t("c.next")} disabled={!ready} onPress={() => setStep(WIZARD_STEPS[index + 1])} />
        {index > 0 ? <LinkButton title={t("c.back")} onPress={goBack} /> : null}
      </View>
    );

  return (
    <Screen title={t("c.title")} sub={t(`step.${step}Sub`)} footer={footer}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <ProgressBars total={WIZARD_STEPS.length} current={index} />
      </View>
      <T weight="extrabold" style={{ fontSize: 18 }}>{t(`c.step.${step}`)}</T>
      {problem ? <Notice>{problem}</Notice> : null}

      {step === "how" ? (
        <>
          <RadioCard icon="globe" title={t("c.mode.meta")} sub={t("c.mode.metaHint")} on={chosenMode === "meta"} onPress={() => setMode("meta")} />
          <RadioCard icon="users" title={t("c.mode.managedMeta")} sub={t("c.mode.managedMetaHint", { fee: naira(setupFees.meta) })} on={chosenMode === "managed_meta"} onPress={() => setMode("managed_meta")} />
          <RadioCard icon="play" title={t("c.mode.tiktok")} sub={t("c.mode.tiktokHint", { fee: naira(setupFees.tiktok) })} on={chosenMode === "managed_tiktok"} onPress={() => setMode("managed_tiktok")} />
          {chosenMode === "meta" ? (
            meta.status === "needs_account" && meta.configured ? (
              // Pick the ad account and Page right here, without leaving the wizard.
              <MetaCard meta={meta} onChanged={data.reload} />
            ) : meta.status === "connected" ? (
              <Notice tone="success">{t("m.connected", { account: meta.accountName ?? meta.accountId ?? "", page: meta.pageName ?? "" })}</Notice>
            ) : (
              <Card style={{ gap: 8 }}>
                <T style={{ fontSize: 15, lineHeight: 22 }}>{!meta.configured ? t("m.notReady") : meta.status === "needs_account" ? t("meta.pickFirst") : t("m.off")}</T>
                {meta.configured && meta.status !== "needs_account" ? <PillButton title={t("m.connect")} size="sm" style={{ alignSelf: "flex-start" }} onPress={() => void connectMetaAds().then(() => data.reload())} /> : null}
              </Card>
            )
          ) : (
            <Notice tone="info">{t("c.managedNote", { fee: naira(fee) })}</Notice>
          )}
        </>
      ) : null}

      {step === "products" ? (
        <>
          <T weight="bold" style={{ color: colors.inkSoft }}>{t("c.chosen", { count: productIds.length })}</T>
          {products.length ? <Field value={query} onChangeText={setQuery} placeholder={t("c.search")} accessibilityLabel={t("c.search")} autoCorrect={false} /> : <Notice tone="info">{t("noProducts")}</Notice>}
          {visible.slice(0, 80).map((product) => {
            const on = productIds.includes(product.id);
            return (
              <Pressable
                key={product.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={product.name}
                onPress={() => setProductIds((current) => (on ? current.filter((id) => id !== product.id) : [...current, product.id].slice(0, 20)))}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 18, borderWidth: 2, borderColor: on ? colors.ink : colors.line, backgroundColor: colors.surface }}
              >
                {product.image ? <Image source={{ uri: product.image }} style={{ width: 52, height: 52, borderRadius: 12 }} contentFit="cover" /> : null}
                <View style={{ flex: 1 }}>
                  <T weight="bold" style={{ fontSize: 15 }} numberOfLines={2}>{product.name}</T>
                  <T style={{ color: colors.inkSoft, fontSize: 14 }}>{naira(product.price)}</T>
                </View>
                <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: on ? colors.ink : colors.lineStrong, backgroundColor: on ? colors.inkFill : colors.surface, alignItems: "center", justifyContent: "center" }}>
                  {on ? <AppIcon name="check" size={14} color="#FFFFFF" /> : null}
                </View>
              </Pressable>
            );
          })}
        </>
      ) : null}

      {step === "audience" ? (
        <>
          <Label>{t("c.goal")}</Label>
          {AD_OBJECTIVES.map((value) => {
            const off = value === "whatsapp" && !overview.hasWhatsapp;
            return <RadioCard key={value} icon={value === "whatsapp" ? "whatsapp" : value === "awareness" ? "megaphone" : "store"} title={t(`c.obj.${value}`)} sub={off ? t("dest.addWhatsApp") : t(`c.obj.${value}Hint`)} on={objective === value} disabled={off} onPress={() => setObjective(value)} />;
          })}
          <Label>{t("c.where")}</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {AD_COUNTRIES.map((country) => <Chip key={country.code} label={country.name} on={audience.countries.includes(country.code)} onPress={() => setAudience((a) => ({ ...a, countries: toggle(a.countries, country.code), states: country.code === "NG" && a.countries.includes("NG") ? [] : a.states }))} />)}
          </View>
          {audience.countries.includes("NG") ? (
            <>
              <StatePicker
                testID="ad-states"
                options={NG_STATES.map((place) => ({ value: place, label: place === "Federal Capital Territory" ? "Abuja (FCT)" : place }))}
                selected={audience.states}
                onToggle={(place) => setAudience((a) => ({ ...a, states: toggle(a.states, place) }))}
                placeholder={t("c.allNigeria")}
              />
            </>
          ) : null}
          <Label>{t("c.age")}</Label>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Field style={{ width: 90 }} keyboardType="number-pad" accessibilityLabel={t("c.ageFrom")} value={String(audience.ageMin)} onChangeText={(text) => setAudience((a) => ({ ...a, ageMin: Math.max(18, Math.min(65, Number(text.replace(/\D/g, "")) || 18)) }))} />
            <T>{t("c.to")}</T>
            <Field style={{ width: 90 }} keyboardType="number-pad" accessibilityLabel={t("c.ageTo")} value={String(audience.ageMax)} onChangeText={(text) => setAudience((a) => ({ ...a, ageMax: Math.max(18, Math.min(65, Number(text.replace(/\D/g, "")) || 65)) }))} />
          </View>
          {audience.ageMin > audience.ageMax ? <Notice>{t("ageOrder")}</Notice> : null}
          <Label>{t("c.gender")}</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(["all", "women", "men"] as const).map((value) => <Chip key={value} label={t(`c.gender.${value}`)} on={audience.gender === value} onPress={() => setAudience((a) => ({ ...a, gender: value }))} />)}
          </View>
          <Label tip={{ text: t("c.interestsHint") }}>{t("c.interests")}</Label>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Field
              style={{ flex: 1 }}
              value={interest}
              onChangeText={setInterest}
              placeholder={t("c.interestPh")}
              accessibilityLabel={t("c.interests")}
              returnKeyType="done"
              onSubmitEditing={() => {
                const word = interest.trim().slice(0, 60);
                if (word && !audience.interests.includes(word)) setAudience((a) => ({ ...a, interests: [...a.interests, word].slice(0, 10) }));
                setInterest("");
              }}
            />
            <PillButton
              title={t("c.add")}
              size="md"
              tone="white"
              disabled={!interest.trim()}
              onPress={() => {
                const word = interest.trim().slice(0, 60);
                if (word && !audience.interests.includes(word)) setAudience((a) => ({ ...a, interests: [...a.interests, word].slice(0, 10) }));
                setInterest("");
              }}
            />
          </View>
          {audience.interests.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {audience.interests.map((word) => <Chip key={word} label={`${word}  ×`} on={false} onPress={() => setAudience((a) => ({ ...a, interests: a.interests.filter((item) => item !== word) }))} />)}
            </View>
          ) : null}
        </>
      ) : null}

      {step === "budget" ? (
        <>
          <Label>{t("c.daily", { currency })}</Label>
          <Field keyboardType="number-pad" value={dailyBudget ? String(dailyBudget) : ""} onChangeText={(text) => setDailyBudget(Number(text.replace(/[^\d]/g, "")) || 0)} accessibilityLabel={t("c.daily", { currency })} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(currency === "NGN" ? BUDGET_CHOICES.NGN : BUDGET_CHOICES.other).map((value) => <Chip key={value} label={money(value)} on={dailyBudget === value} onPress={() => setDailyBudget(value)} />)}
          </View>
          {dailyBudget < minBudget(currency, minDailyNgn) ? <Notice>{t("c.minBudget", { amount: money(minBudget(currency, minDailyNgn)) })}</Notice> : null}
          <Label>{t("c.startDate")}</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {START_CHOICES.map((value) => <Chip key={value} label={t(`start.${value}`)} on={startIn === value} onPress={() => setStartIn(value)} />)}
          </View>
          <Label>{t("c.daysLabel")}</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {DAY_CHOICES.map((value) => <Chip key={value} label={t("days", { count: value })} on={days === value} onPress={() => setDays(value)} />)}
          </View>
          <Field keyboardType="number-pad" value={String(days)} onChangeText={(text) => setDays(Math.max(1, Math.min(90, Number(text.replace(/\D/g, "")) || 1)))} accessibilityLabel={t("c.daysLabel")} />
          <Card>
            <T style={{ fontSize: 15, lineHeight: 22 }}>
              {t("c.totalSpend", { total: money(campaignTotal(dailyBudget, days)), platform: chosenMode === "managed_tiktok" ? "TikTok" : "Meta" })}
              {fee ? ` ${t("c.plusFee", { fee: naira(fee) })}` : ""}
            </T>
          </Card>
        </>
      ) : null}

      {step === "ads" ? (
        <>
          <PillButton title={t("c.writePeggy")} size="md" tone="forest" busy={busy === "copy"} disabled={busy !== null} onPress={() => void writeWithPeggy()} />
          {creatives.map((creative, i) => {
            const product = products.find((item) => item.id === creative.productId);
            return (
              <Card key={`${creative.mediaUrl}-${i}`} style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                  <Image source={{ uri: creative.thumbUrl ?? creative.mediaUrl }} style={{ width: 64, height: 64, borderRadius: 12 }} contentFit="cover" />
                  <T weight="bold" style={{ flex: 1, color: colors.inkSoft, fontSize: 14 }}>{creative.kind === "video" ? t("c.videoAd") : t("c.photoAd")}{product ? ` · ${product.name}` : ""}</T>
                  {creatives.length > 1 ? <LinkButton title={t("c.removeAd")} color={colors.danger} onPress={() => setCreatives((current) => current.filter((_, n) => n !== i))} /> : null}
                </View>
                <Label>{t("headline")}</Label>
                <Field value={creative.headline} maxLength={80} onChangeText={(headline) => update(i, { headline })} accessibilityLabel={t("headline")} />
                <Label>{t("adText")}</Label>
                <Field value={creative.primaryText} maxLength={500} multiline onChangeText={(primaryText) => update(i, { primaryText })} placeholder={t("c.textPh")} accessibilityLabel={t("adText")} style={{ height: 110, paddingTop: 14, textAlignVertical: "top" }} />
                <Label>{t("c.button")}</Label>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {AD_CTAS.map((cta) => <Chip key={cta} label={t(`c.cta.${cta}`)} on={creative.cta === cta} onPress={() => update(i, { cta })} />)}
                </View>
              </Card>
            );
          })}
        </>
      ) : null}

      {step === "review" ? (
        <>
          <Label>{t("c.name")}</Label>
          <Field value={name} onChangeText={setName} placeholder={campaignName} maxLength={120} accessibilityLabel={t("c.name")} />
          <Card style={{ gap: 8 }}>
            {[
              [t("c.step.how"), chosenMode === "meta" ? t("c.mode.meta") : chosenMode === "managed_tiktok" ? t("c.mode.tiktok") : t("c.mode.managedMeta")],
              [t("c.step.products"), chosen.map((product) => product.name).join(", ")],
              [t("c.goal"), t(`c.obj.${objective}`)],
              [t("c.where"), audience.states.length ? audience.states.join(", ") : audience.countries.map((code) => AD_COUNTRIES.find((country) => country.code === code)?.name ?? code).join(", ")],
              [t("c.budget"), `${money(dailyBudget)} × ${t("days", { count: days })} = ${money(campaignTotal(dailyBudget, days))}`],
              [t("c.ads"), t("c.adsCount", { count: creatives.length })],
            ].map(([label, value]) => (
              <View key={label}>
                <T weight="bold" style={{ fontSize: 13, color: colors.inkSoft }}>{label}</T>
                <T weight="bold" style={{ fontSize: 15 }}>{value}</T>
              </View>
            ))}
          </Card>

          {chosenMode === "meta" ? (
            <>
              <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("c.metaBilling", { account: meta.accountName ?? "" })}</T>
              {busy === "launch" ? <Notice tone="info">{t("c.launching")}</Notice> : null}
              <PillButton title={t("c.launch")} busy={busy === "launch"} disabled={busy !== null || meta.status !== "connected"} onPress={() => void finish(true)} />
              <PillButton title={t("c.saveDraft")} tone="white" size="md" busy={busy === "draft"} disabled={busy !== null} onPress={() => void finish(false)} />
            </>
          ) : details ? (
            <>
              <SectionTitle>{t("c.yourDetails")}</SectionTitle>
              <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{chosenMode === "managed_tiktok" ? t("c.tiktokNeeds") : t("c.metaNeeds")}</T>
              {(
                [
                  ["name", t("c.f.name"), true],
                  ["phone", t("c.f.phone"), true],
                  ["email", t("c.f.email"), false],
                  ["businessName", t("c.f.business"), true],
                  ["handle", chosenMode === "managed_tiktok" ? t("c.f.tiktok") : t("c.f.instagram"), chosenMode === "managed_tiktok"],
                  ["pageUrl", chosenMode === "managed_tiktok" ? t("c.f.tiktokProfile") : t("c.f.facebookPage"), false],
                  ["website", t("c.f.website"), false],
                  ["goals", t("c.f.goals"), false],
                ] as const
              ).map(([key, label, required]) => (
                <View key={key}>
                  <Label>{required ? `${label} *` : label}</Label>
                  <Field
                    value={details[key]}
                    onChangeText={(value) => setDetails((current) => (current ? { ...current, [key]: value } : current))}
                    keyboardType={key === "phone" ? "phone-pad" : key === "email" ? "email-address" : "default"}
                    autoCapitalize={key === "email" || key === "website" || key === "pageUrl" || key === "handle" ? "none" : "sentences"}
                    multiline={key === "goals"}
                    style={key === "goals" ? { height: 90, paddingTop: 14, textAlignVertical: "top" } : undefined}
                  />
                </View>
              ))}
              <Notice tone="info">{t("c.feeNote", { fee: naira(fee), platform: chosenMode === "managed_tiktok" ? "TikTok" : "Meta" })}</Notice>
              <PillButton title={t("c.payFee", { fee: naira(fee) })} busy={busy === "pay"} disabled={busy !== null || !detailsReady(chosenMode, details)} onPress={() => void finish(true)} />
            </>
          ) : null}
          <LinkButton title={t("c.back")} onPress={goBack} />
        </>
      ) : null}
    </Screen>
  );
}
