import { useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { NG_STATES } from "@shared/delivery-market";
import { AppIcon } from "@/components/icons";
import { StatePicker } from "@/components/StatePicker";
import { Chip, Field, Notice, T } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { FunLoader } from "@/components/FunLoader";
import { stateName } from "@/lib/delivery-pure";
import { useLocale, useT } from "@/lib/i18n";
import { RexStillWorking, useRexResume } from "@/lib/rex-jobs";
import {
  LIBRARY_SHOP_CATEGORIES,
  defaultAreas,
  libraryTabs,
  nextDays,
  plainAboutStory,
  saveContact,
  validWhatsapp,
  writeAbout,
  type DeliveryAreaChoice,
} from "@/lib/seller-onboarding";
import { colors, fonts, radii, surfaceCard } from "@/theme";
import { RexFrame, RexSays } from "./Frame";
import { SwitchRow } from "./parts";
import type { StepCtx } from "./context";

// Step 4, the pages: Rex's photo library (D4a, RB-11), the About story (D4b, RB-12) and the contact page with
// delivery (D4c, RB-13).

/** D4a "Need photos for your About page?" Pick from Rex's library (numbered as they're picked), by category. */
export function MediaStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("m_rexBuild");
  const { width } = useWindowDimensions();
  const cell = Math.floor((Math.min(width, 600) - 36 - 16) / 3);
  const tabs = libraryTabs(ctx.flow.categories);
  const [tab, setTab] = useState(tabs[0]!);
  const [picked, setPicked] = useState<string[]>(ctx.flow.media ?? []);
  const library = ctx.data.library ?? [];
  const shown = useMemo(() => library.filter((photo) => photo.category === tab), [library, tab]);
  const label = (key: string) => ((LIBRARY_SHOP_CATEGORIES as readonly string[]).includes(key) ? t.dynamic(`sell.cat.${key}`, key) : t.dynamic(`media.cat.${key}`, key));
  const toggle = (url: string) => setPicked((current) => (current.includes(url) ? current.filter((item) => item !== url) : [...current, url].slice(-6)));

  return (
    <RexFrame
      {...ctx.frame}
      primary={{ title: picked.length ? (picked.length === 1 ? t("media.useOne") : t("media.use", { count: picked.length })) : t("media.skip"), onPress: () => void ctx.next({ media: picked }), testID: "media-use" }}
      onRexChoose={shown.length ? () => ctx.rexChose(t("media.use", { count: Math.min(2, shown.length) }), { media: shown.slice(0, 2).map((photo) => photo.url) }) : null}
    >
      <RexSays title={t("media.title")} sub={t("media.sub")} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -18 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 18 }}>
        {tabs.map((key) => <Chip key={key} label={label(key)} on={tab === key} onPress={() => setTab(key)} />)}
      </ScrollView>
      {shown.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {shown.map((photo) => {
            const number = picked.indexOf(photo.url) + 1;
            return (
              <Pressable
                key={photo.id}
                accessibilityRole="button"
                accessibilityLabel={photo.alt || t("media.pick", { number: shown.indexOf(photo) + 1 })}
                accessibilityState={{ selected: number > 0 }}
                onPress={() => toggle(photo.url)}
                style={{ width: cell, height: cell * 1.12, borderRadius: 16, overflow: "hidden", borderWidth: number ? 3 : 0, borderColor: colors.accent }}
              >
                <Image source={{ uri: photo.thumb }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                {/* The photographer's credit (Unsplash), as the library asks where there's room. */}
                {photo.credit ? (
                  <T numberOfLines={1} style={{ position: "absolute", left: 6, right: 6, bottom: 4, fontSize: 9.5, color: "rgba(255,255,255,0.92)", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 3 }}>{`${photo.credit.name} / Unsplash`}</T>
                ) : null}
                {number ? (
                  <View style={{ position: "absolute", top: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
                    <T weight="extrabold" style={{ color: colors.onAccent, fontSize: 14 }}>{number}</T>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Notice tone="info">{t("media.empty")}</Notice>
      )}
    </RexFrame>
  );
}

/** D4b "Tell me about your business." Two short answers (typed or spoken); Rex writes the story; "Rewrite it". */
export function AboutStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("m_rexBuild");
  const locale = useLocale();
  const [started, setStarted] = useState(ctx.flow.about?.started ?? "");
  const [different, setDifferent] = useState(ctx.flow.about?.different ?? "");
  const [story, setStory] = useState(ctx.flow.about?.story ?? "");
  const [round, setRound] = useState(1);
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const about = (text: string) => ({ started, different, story: text, images: ctx.flow.media ?? [] });

  // A story Rex finished while the seller was away comes back here (already paid for).
  useRexResume(["store_words"], (job) => {
    if (typeof job.result?.story === "string" && !story) setStory(job.result.story);
  }, !story);

  async function write(next: number, rexPicked = false) {
    setWriting(true);
    setNote(null);
    let text = "";
    try {
      if (!started.trim() && !different.trim()) throw new Error("empty");
      text = (await writeAbout({ started, different, round: next, language: locale })).story;
    } catch (cause) {
      text = plainAboutStory(ctx.data.store.name, started, different);
      setNote(cause instanceof RexStillWorking ? cause.message : t("about.offline"));
    } finally {
      setWriting(false);
    }
    setRound(next);
    setStory(text);
    void ctx.save({ about: about(text) });
    if (rexPicked) ctx.rexChose(t("about.rexWrote").replace(/:$/, ""), { about: about(text) });
  }

  const card = (label: string, value: string, set: (value: string) => void, placeholder: string, testID: string) => (
    <View style={{ ...surfaceCard(22), paddingHorizontal: 16, paddingVertical: 12 }}>
      <T weight="semibold" style={{ fontSize: 13.5, color: colors.inkSoft }}>{label}</T>
      <TextInput testID={testID} value={value} onChangeText={set} placeholder={placeholder} placeholderTextColor={colors.inkFaint} multiline maxLength={400} accessibilityLabel={label} style={{ fontSize: 17, lineHeight: 23, fontFamily: fonts.regular, color: colors.ink, paddingTop: 4, minHeight: 30 }} />
    </View>
  );

  return (
    <RexFrame
      {...ctx.frame}
      primary={story ? { title: t("about.good"), onPress: () => void ctx.next({ about: about(story) }), testID: "about-good" } : { title: t("about.write"), busy: writing, disabled: !started.trim() && !different.trim(), onPress: () => void write(1), testID: "about-write" }}
      link={story ? { title: t("about.rewrite"), onPress: () => void write(round + 1), testID: "about-rewrite" } : null}
      onRexChoose={story ? null : () => void write(1, true)}
    >
      <RexSays title={t("about.title")} sub={t("about.sub")} />
      {card(t("about.started"), started, setStarted, t("about.startedPlaceholder"), "about-started")}
      {card(t("about.different"), different, setDifferent, t("about.differentPlaceholder"), "about-different")}
      <View style={{ ...surfaceCard(32), flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 18, paddingRight: 8, minHeight: 64 }}>
        <T style={{ flex: 1, fontSize: 16, color: colors.inkSoft }}>{t("about.talk")}</T>
        {/* A voice note fills the answer still empty (or adds to the second). */}
        <VoiceInput variant="icon" mode="append" value={started.trim() ? different : started} onChange={(spoken) => (started.trim() ? setDifferent(spoken) : setStarted(spoken))} language={locale} context="how a small business started and what makes it different" />
      </View>
      {writing ? <FunLoader kind="image" /> : null}
      {note ? <Notice tone="info">{note}</Notice> : null}
      {story && !writing ? (
        <View testID="about-story" style={{ backgroundColor: colors.mintTint, borderRadius: 22, padding: 16, gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <AppIcon name="sparkle" size={16} color={colors.forest} />
            <T weight="extrabold" style={{ color: colors.forest, fontSize: 15 }}>{t("about.rexWrote")}</T>
          </View>
          <TextInput value={story} onChangeText={setStory} multiline maxLength={2000} accessibilityLabel={t("about.rexWrote")} style={{ fontSize: 16, lineHeight: 23, fontFamily: fonts.regular, color: colors.forest }} />
        </View>
      ) : null}
    </RexFrame>
  );
}

const STATE_OPTIONS = NG_STATES.map((state) => ({ value: state, label: stateName(state) }));

/** D4c "I filled your contact page. Just check it's right." WhatsApp, where they deliver (with days), pickup, pay on delivery. */
export function ContactStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("m_rexBuild");
  const saved = ctx.flow.contact;
  const [whatsapp, setWhatsapp] = useState(saved?.whatsapp ?? ctx.data.contact?.whatsapp ?? "");
  const [areas, setAreas] = useState<DeliveryAreaChoice[]>(saved?.areas?.length ? saved.areas : defaultAreas(ctx.data.store.state || ctx.data.store.city));
  const [pickup, setPickup] = useState(saved?.pickup ?? ctx.data.contact?.pickup ?? "");
  const [pod, setPod] = useState(saved?.pod ?? true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function confirm() {
    if (!validWhatsapp(whatsapp)) return ctx.setError(t("contact.whatsappNeeded"));
    setBusy(true);
    ctx.setError(null);
    try {
      const result = await saveContact({ whatsapp, areas, pickup, pod });
      if (result.podProblem) {
        setPod(false);
        setNote(t("contact.podPlan"));
      }
      await ctx.next({ contact: { whatsapp, areas, pickup, pod: pod && !result.podProblem } });
    } catch (cause) {
      ctx.setError(cause instanceof Error && cause.message ? cause.message : t("error.save"));
    } finally {
      setBusy(false);
    }
  }

  const box = { ...surfaceCard(22), paddingHorizontal: 16, paddingVertical: 12, gap: 6 } as const;
  return (
    <RexFrame {...ctx.frame} primary={{ title: t("contact.ok"), busy, onPress: () => void confirm(), testID: "contact-ok" }}>
      <RexSays title={t("contact.title")} sub={t("contact.sub")} />
      <View style={box}>
        <T weight="semibold" style={{ fontSize: 13.5, color: colors.inkSoft }}>{t("contact.whatsapp")}</T>
        <TextInput testID="contact-whatsapp" value={whatsapp} onChangeText={setWhatsapp} keyboardType="phone-pad" placeholder={t("contact.whatsappPlaceholder")} placeholderTextColor={colors.inkFaint} maxLength={20} accessibilityLabel={t("contact.whatsapp")} style={{ fontSize: 19, fontFamily: fonts.regular, color: colors.ink, paddingVertical: 2 }} />
      </View>
      <View style={box}>
        <T weight="semibold" style={{ fontSize: 13.5, color: colors.inkSoft }}>{t("contact.areas")}</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {areas.map((area) => (
            <Pressable
              key={area.state}
              accessibilityRole="button"
              accessibilityHint={t("contact.areaHint")}
              onPress={() => setAreas((current) => current.map((item) => (item.state === area.state ? { ...item, days: nextDays(item.days) } : item)))}
              onLongPress={() => setAreas((current) => current.filter((item) => item.state !== area.state))}
              style={{ backgroundColor: colors.mintTint, borderRadius: radii.pill, paddingHorizontal: 14, paddingVertical: 9 }}
            >
              <T weight="bold" style={{ color: colors.forest, fontSize: 15 }}>{t("contact.area", { state: stateName(area.state), days: t(`contact.days.${area.days}`) })}</T>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={() => setAdding((value) => !value)} style={{ backgroundColor: colors.grayTint, borderRadius: radii.pill, paddingHorizontal: 14, paddingVertical: 9 }}>
            <T weight="bold" style={{ fontSize: 15 }}>{`+ ${t("contact.add")}`}</T>
          </Pressable>
        </View>
        {adding ? (
          <StatePicker
            testID="contact-add-state"
            options={STATE_OPTIONS}
            selected={areas.map((area) => area.state)}
            onToggle={(state) => setAreas((current) => (current.some((item) => item.state === state) ? current.filter((item) => item.state !== state) : [...current, { state, days: "2-3", fee: 3500 }]))}
            title={t("contact.areas")}
          />
        ) : null}
        <T style={{ fontSize: 12.5, color: colors.inkSoft }}>{t("contact.areaHint")}</T>
      </View>
      <View style={box}>
        <T weight="semibold" style={{ fontSize: 13.5, color: colors.inkSoft }}>{t("contact.pickup")}</T>
        <Field value={pickup} onChangeText={setPickup} placeholder={t("contact.pickupPlaceholder")} maxLength={200} accessibilityLabel={t("contact.pickup")} style={{ backgroundColor: "transparent", paddingHorizontal: 0, borderWidth: 0 }} />
      </View>
      <SwitchRow testID="contact-pod" title={t("contact.pod")} sub={t("contact.podSub")} on={pod} onChange={setPod} />
      {note ? <Notice tone="info">{note}</Notice> : null}
    </RexFrame>
  );
}
