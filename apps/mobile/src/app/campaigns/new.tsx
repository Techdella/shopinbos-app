import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Field, Label, Notice, PillButton, T, Toggle } from "@/components/ui";
import { DateButton, DateTimeSheet, useServerNow } from "@/components/campaigns";
import { createCampaign, createCampaignCode, fetchCampaign, updateCampaign, type CampaignDetail } from "@/lib/campaigns";
import { campaignStatus, cleanCode, isRunning, percentOk, PRESETS, scheduleProblem, suggestCampaignCode, toMs } from "@/lib/campaigns-pure";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// New seasonal campaign, like the web: pick a preset (that makes a draft with the season's look, as on the web),
// then the name, start and end, and an optional percent-off code that only works while it runs. With ?id= it
// changes an existing campaign's name, dates and code. The look and what shows (banners, pop-up, badges) aren't
// edited on the phone.

export default function NewCampaign() {
  const t = useT("m_campaigns", "campaigns", "m_ui");
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = Boolean(id);
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [offset, setOffset] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [making, setMaking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState<number | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [picking, setPicking] = useState<"start" | "end" | null>(null);
  const [withCode, setWithCode] = useState(false);
  const [percent, setPercent] = useState(10);
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  // A code made on an earlier try (when saving the campaign didn't go through), so trying again doesn't make two.
  const [madeCode, setMadeCode] = useState<{ id: string; code: string } | null>(null);
  const now = useServerNow(offset, 30_000);

  function fill(detail: CampaignDetail) {
    setCampaign(detail);
    setName(detail.name);
    setStartsAt(toMs(detail.startsAt ?? detail.suggested?.startsAt));
    setEndsAt(toMs(detail.endsAt ?? detail.suggested?.endsAt));
  }

  useEffect(() => {
    if (!id) return;
    fetchCampaign(String(id))
      .then((data) => {
        setOffset(data.offset);
        fill(data.campaign);
      })
      .catch((loadFailed) => setLoadError(loadFailed instanceof Error ? loadFailed.message : t("loadFailed")));
    // Loads once for this campaign.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function pick(preset: string) {
    setMaking(preset);
    setError(null);
    try {
      const data = await createCampaign(preset);
      fill(data.campaign);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t("form.tryAgain"));
    } finally {
      setMaking(null);
    }
  }

  // ─── Step 1: pick a season ────────────────────────────────────────────────
  if (!editing && !campaign) {
    return (
      <Screen title={t("pick.title")} sub={t("pick.sub")}>
        {error ? <Notice>{error}</Notice> : null}
        {PRESETS.map((preset) => (
          <Pressable
            key={preset.id}
            accessibilityRole="button"
            accessibilityState={{ busy: making === preset.id, disabled: making !== null }}
            disabled={making !== null}
            onPress={() => void pick(preset.id)}
            style={({ pressed }) => ({ opacity: making !== null && making !== preset.id ? 0.5 : pressed ? 0.85 : 1 })}
          >
            <Card style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", height: 40, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: colors.line }} accessibilityElementsHidden importantForAccessibility="no">
                {preset.swatch.map((colour) => <View key={colour} style={{ flex: 1, backgroundColor: colour }} />)}
              </View>
              <T weight="extrabold" style={{ fontSize: 17 }}>{t.dynamic(`preset.${preset.id}.name`, preset.id)}</T>
              <T style={{ color: colors.inkSoft, fontSize: 14.5, lineHeight: 20 }}>{making === preset.id ? t("pick.making") : t.dynamic(`preset.${preset.id}.description`, "")}</T>
            </Card>
          </Pressable>
        ))}
      </Screen>
    );
  }

  if (!campaign) {
    return (
      <Screen title={t("form.editTitle")}>
        {loadError ? <ErrorState message={loadError} /> : <LoadingBlock />}
      </Screen>
    );
  }

  // ─── Step 2: name, dates and an optional code ─────────────────────────────
  const zone = campaign.timezone || "Africa/Lagos";
  const status = campaignStatus(campaign, now);
  const problem = scheduleProblem(startsAt, endsAt, now);
  const hasCode = Boolean(campaign.discount);
  const suggestion = suggestCampaignCode(name || campaign.name, percent);
  const codeProblem = withCode && !hasCode && !madeCode && !percentOk(percent);
  const usingSuggestion = !campaign.startsAt && Boolean(campaign.suggested);

  async function save() {
    if (!campaign || problem || codeProblem || startsAt === null || endsAt === null) return;
    setSaving(true);
    setError(null);
    const start = new Date(startsAt).toISOString();
    const end = new Date(endsAt).toISOString();
    try {
      let discount = madeCode;
      if (withCode && !hasCode && !discount) {
        discount = await createCampaignCode({ name: name.trim() || campaign.name, code: cleanCode(code) || suggestion, percent, startsAt: start, endsAt: end });
        setMadeCode(discount);
      }
      await updateCampaign(campaign.id, {
        name: name.trim() || campaign.name,
        startsAt: start,
        endsAt: end,
        ...(discount ? { discountId: discount.id, discountAutoToggle: true } : {}),
      });
      router.replace({ pathname: "/campaigns/[id]", params: { id: campaign.id } });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("form.tryAgain"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      title={editing ? t("form.editTitle") : t("form.title")}
      sub={editing ? undefined : t("form.sub")}
      footer={<PillButton title={editing ? t("form.save") : t("form.create")} busy={saving} disabled={Boolean(problem) || codeProblem} onPress={() => void save()} />}
    >
      {editing && isRunning(status) ? <Notice tone="info">{t("form.liveNote")}</Notice> : null}

      <Label>{t("form.name")}</Label>
      <Field value={name} onChangeText={setName} maxLength={120} placeholder={campaign.name} />

      <SectionTitle>{t("form.when")}</SectionTitle>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <DateButton label={t("form.starts")} value={startsAt} zone={zone} now={now} onPress={() => setPicking("start")} />
        <DateButton label={t("form.ends")} value={endsAt} zone={zone} now={now} onPress={() => setPicking("end")} />
      </View>
      <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("form.zone", { zone: zone.split("/").pop()?.replace(/_/g, " ") ?? zone })}</T>
      {usingSuggestion ? <Notice tone="info">{t("form.suggested")}</Notice> : null}
      {problem && (startsAt !== null || endsAt !== null) ? <Notice>{t.dynamic(`form.${problem}`)}</Notice> : null}

      <SectionTitle>{t("form.discount")}</SectionTitle>
      {campaign.discount ? (
        <Card>
          <T style={{ fontSize: 15, lineHeight: 22 }}>{t("form.linked", { code: campaign.discount.automatic ? campaign.discount.name : campaign.discount.code })}</T>
        </Card>
      ) : madeCode ? (
        <Card>
          <T style={{ fontSize: 15, lineHeight: 22 }}>{t("form.linked", { code: madeCode.code })}</T>
        </Card>
      ) : (
        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <T weight="bold" style={{ fontSize: 15.5 }}>{t("form.addDiscount")}</T>
              <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 2 }}>{t("form.discountSub")}</T>
            </View>
            <Toggle on={withCode} onChange={setWithCode} label={t("form.addDiscount")} />
          </View>
          {withCode ? (
            <>
              <Label>{t("form.percent")}</Label>
              <Field keyboardType="number-pad" value={percent ? String(percent) : ""} onChangeText={(text) => setPercent(Math.min(100, Number(text.replace(/\D/g, "")) || 0))} placeholder="10" />
              {codeProblem ? <Notice>{t("form.percentProblem")}</Notice> : null}
              <Label>{t("form.code")}</Label>
              <Field autoCapitalize="characters" autoCorrect={false} value={code} onChangeText={(text) => setCode(cleanCode(text))} placeholder={suggestion} />
            </>
          ) : null}
        </Card>
      )}

      {error ? <Notice>{error}</Notice> : null}

      <DateTimeSheet
        key={picking ?? "closed"}
        visible={picking !== null}
        title={picking === "end" ? t("form.ends") : t("form.starts")}
        value={picking === "end" ? endsAt : startsAt}
        zone={zone}
        now={now}
        onClose={() => setPicking(null)}
        onPick={(ms) => {
          if (picking === "end") setEndsAt(ms);
          else setStartsAt(ms);
          setPicking(null);
        }}
      />
    </Screen>
  );
}
