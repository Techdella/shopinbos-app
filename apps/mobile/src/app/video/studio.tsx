import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { CREDIT_COST } from "@shared/ai-credits";
import { MUSIC_MOODS, REEL_SHOT_LOOKS, REEL_TEMPLATES } from "@shared/video-style";
import { VIDEO_LANGUAGES } from "@shared/video";
import { AppIcon } from "@/components/icons";
import { Badge, ChipRow, ErrorState, LoadingBlock } from "@/components/kit";
import { ProductPickSheet } from "@/components/ProductPickSheet";
import { Screen } from "@/components/Screen";
import { Card, Chip, Field, Label, LinkButton, Notice, PillButton, Segmented, T } from "@/components/ui";
import { uploadProductPhoto } from "@/lib/products";
import { createVideo, fetchStudioProducts, fetchVideo, makeReelShots, patchVideo, writeVideoScript } from "@/lib/video";
import {
  addPhotos,
  applyShots,
  captionsFor,
  currentScript,
  initialStudio,
  MAX_PHOTOS,
  readConfig,
  readPurpose,
  readStatus,
  studioConfig,
  voiceChoices,
  webStudioPath,
  withCaption,
  withProduct,
  withScriptField,
  withTemplate,
  worthSaving,
  type StudioProduct,
  type StudioState,
  type VideoPurpose,
  type VideoRow,
  type VideoStatus,
} from "@/lib/video-pure";
import { openWeb } from "@/lib/web";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// The phone's video studio (web /home/video/studio): photos from a product or the phone, Rex's shots, a style,
// the words (Rex writes them), the voice and music. Everything saves itself as a draft (the web studio's
// VideoConfig). The reel itself is drawn in a browser, so "Finish on the web" opens this draft there to make it.

type NoticeState = { tone: "error" | "info" | "success"; text: string };

export default function VideoStudioScreen() {
  const t = useT("m_video", "m_ui");
  const params = useLocalSearchParams<{ id?: string; purpose?: string; product?: string }>();
  // The draft gets its id after the first save; the screen keeps what it opened with.
  const [start] = useState(() => ({ id: params.id ?? null, purpose: readPurpose(params.purpose), product: params.product ?? null }));
  const [loaded, setLoaded] = useState<{ products: StudioProduct[]; project: VideoRow | null } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchStudioProducts().catch(() => [] as StudioProduct[]), start.id ? fetchVideo(start.id) : Promise.resolve(null)])
      .then(([products, project]) => !cancelled && setLoaded({ products, project }))
      .catch((error) => !cancelled && setProblem(error instanceof Error ? error.message : t("load.problem")));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, attempt]);

  if (!loaded) {
    return (
      <Screen title={t("studio.title")}>
        {problem ? <ErrorState message={problem} onRetry={() => {
              setProblem(null);
              setAttempt((n) => n + 1);
            }} /> : <LoadingBlock />}
      </Screen>
    );
  }
  return <Studio products={loaded.products} project={loaded.project} startPurpose={start.purpose} startProduct={start.product} />;
}

function Studio({ products, project, startPurpose, startProduct }: { products: StudioProduct[]; project: VideoRow | null; startPurpose: VideoPurpose; startProduct: string | null }) {
  const t = useT("m_video", "video", "m_ui");
  const purpose = project ? readPurpose(project.purpose) : startPurpose;
  const initialProduct = products.find((item) => item.id === (project?.productId ?? startProduct)) ?? null;
  const [state, setState] = useState<StudioState>(() => initialStudio(purpose, project ? readConfig(project.config) : null, initialProduct, project?.productId ?? null));
  const [projectId, setProjectId] = useState<string | null>(project?.id ?? null);
  const [title, setTitle] = useState(project?.title ?? "");
  const [status, setStatus] = useState<VideoStatus>(readStatus(project?.status));
  const [autosave, setAutosave] = useState<"idle" | "saving" | "saved" | "offline">("idle");
  const [step, setStep] = useState<"idle" | "photos" | "writing" | "shots" | "finishing">("idle");
  const [originals, setOriginals] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [picking, setPicking] = useState(purpose === "product" && !project && !initialProduct && products.length > 0);
  const product = products.find((item) => item.id === state.productId) ?? null;
  const busy = step !== "idle";

  const config = useMemo(() => studioConfig(state), [state]);
  const configKey = JSON.stringify(config);
  const lastSaved = useRef(project ? JSON.stringify(studioConfig(initialStudio(purpose, readConfig(project.config), null, project.productId))) : "");
  const creating = useRef<Promise<string | null> | null>(null);
  const latest = useRef({ config, state, title, projectId });
  useLayoutEffect(() => {
    latest.current = { config, state, title, projectId: latest.current.projectId ?? projectId };
  });

  async function ensureProject(): Promise<string | null> {
    if (latest.current.projectId) return latest.current.projectId;
    if (!creating.current) {
      creating.current = (async () => {
        const now = latest.current;
        const created = await createVideo({ purpose, productId: now.state.productId, config: now.config, ...(now.title.trim() ? { title: now.title.trim() } : {}) });
        latest.current.projectId = created.id;
        setProjectId(created.id);
        setTitle((current) => current || created.title);
        router.setParams({ id: created.id });
        return created.id;
      })().finally(() => {
        creating.current = null;
      });
    }
    return creating.current;
  }

  /** Saves the settings now (autosave, and before opening the web). */
  async function saveNow() {
    const now = latest.current;
    if (!worthSaving(now.state, now.projectId)) return null;
    const key = JSON.stringify(now.config);
    const id = await ensureProject();
    if (!id) return null;
    if (key !== lastSaved.current) {
      const saved = await patchVideo(id, { config: now.config, productId: now.state.productId });
      setStatus(readStatus(saved.status));
    }
    lastSaved.current = key;
    return id;
  }

  // Drafts save themselves: the project is made the first time there is something to keep, then updated.
  useEffect(() => {
    if (configKey === lastSaved.current || !worthSaving(state, projectId)) return;
    const timer = setTimeout(async () => {
      setAutosave("saving");
      try {
        await saveNow();
        setAutosave("saved");
      } catch {
        setAutosave("offline");
      }
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey, projectId]);

  async function saveTitle() {
    if (!title.trim()) return;
    try {
      const id = await ensureProject();
      if (id) await patchVideo(id, { title: title.trim() });
    } catch {
      // The name saves with the next change.
    }
  }

  function update(next: (current: StudioState) => StudioState) {
    setState(next);
  }

  async function pickPhotos() {
    const room = MAX_PHOTOS - state.photos.length;
    if (room <= 0) return;
    setNotice(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setNotice({ tone: "error", text: t("photos.allow") });
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: room, quality: 0.8 });
    if (result.canceled || !result.assets.length) return;
    setStep("photos");
    try {
      for (const asset of result.assets.slice(0, room)) {
        const url = await uploadProductPhoto({ uri: asset.uri, mimeType: asset.mimeType, fileName: asset.fileName });
        update((current) => ({ ...current, photos: addPhotos(current.photos, [url]) }));
      }
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : t("photos.problem") });
    } finally {
      setStep("idle");
    }
  }

  async function makeShots() {
    if (!state.photos.length) return setNotice({ tone: "error", text: t("err.photo") });
    setStep("shots");
    setNotice(null);
    try {
      const answer = await makeReelShots({ photos: state.photos, look: state.look, product: state.name.trim() || undefined });
      const result = applyShots(state.photos, answer.shots);
      if (result.made) {
        setOriginals((before) => before ?? state.photos);
        update((current) => {
          const next = { ...current, photos: result.photos };
          return current.look === "cutout" && !REEL_TEMPLATES.find((item) => item.id === current.template)?.cutout ? withTemplate(next, "float", purpose) : next;
        });
      }
      if (answer.creditsNeeded) setNotice({ tone: "error", text: answer.message ?? t("shots.credits") });
      else if (result.made < result.total) setNotice({ tone: result.made ? "info" : "error", text: result.made ? t("shotsSome", { made: result.made, total: result.total }) : result.firstProblem ?? t("err.shots") });
      else setNotice({ tone: "success", text: t("shots.done", { count: result.made }) });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : t("err.shots") });
    } finally {
      setStep("idle");
    }
  }

  async function writeWords() {
    if (!state.name.trim()) return setNotice({ tone: "error", text: t("err.name") });
    setStep("writing");
    setNotice(null);
    try {
      const script = await writeVideoScript({ name: state.name.trim(), price: state.price.trim(), description: product?.description.slice(0, 600) ?? "", language: state.language, photos: Math.max(1, state.photos.length) });
      update((current) => ({ ...current, script: { captions: script.captions, voiceover: script.voiceover, cta: script.cta } }));
      setNotice(script.drafted === false ? { tone: "info", text: t("words.starter") } : { tone: "success", text: t("words.done") });
    } catch (error) {
      update((current) => ({ ...current, script: currentScript(current, purpose) }));
      setNotice({ tone: "info", text: `${error instanceof Error ? error.message : ""} ${t("words.starter")}`.trim() });
    } finally {
      setStep("idle");
    }
  }

  async function finishOnWeb() {
    setStep("finishing");
    setNotice(null);
    try {
      const id = await saveNow();
      if (!id) return setNotice({ tone: "error", text: t("err.photo") });
      setAutosave("saved");
      await openWeb(webStudioPath(id));
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : t("save.problem") });
    } finally {
      setStep("idle");
    }
  }

  const captions = captionsFor(state, purpose);
  const script = currentScript(state, purpose);
  const voices = voiceChoices(state.voiceSource);
  const voiceLabel = (voice: string) => (voice === "rex" ? t("voice.rex") : voice === "elevenlabs" ? t("voice.eleven") : voice === "record" ? t("voice.record") : voice === "upload" ? t("voice.upload") : t("voice.none"));

  return (
    <Screen
      title={t("studio.title")}
      sub={t("studio.sub")}
      footer={<PillButton title={t("finish.button")} busy={step === "finishing"} disabled={busy && step !== "finishing"} onPress={() => void finishOnWeb()} />}
    >
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Badge label={t(`hub.purpose.${purpose}`)} bg={colors.peach} fg={colors.accentInk} />
          <T weight="bold" style={{ color: colors.inkSoft, fontSize: 13.5 }} accessibilityLiveRegion="polite">
            {t(`hub.status.${status}`)}
            {autosave === "saving" ? ` · ${t("hub.autosaving")}` : autosave === "saved" ? ` · ${t("hub.autosaved")}` : autosave === "offline" ? ` · ${t("save.later")}` : ""}
          </T>
        </View>
        <Label>{t("hub.titleLabel")}</Label>
        <Field value={title} onChangeText={setTitle} onBlur={() => void saveTitle()} placeholder={t("hub.titlePh")} maxLength={120} accessibilityLabel={t("hub.titleLabel")} />
      </Card>

      {status !== "draft" && projectId && project?.videoUrl ? (
        <Card style={{ gap: 8 }}>
          <T weight="extrabold" style={{ fontSize: 16 }}>{t("studio.made")}</T>
          <T style={{ color: colors.inkSoft, fontSize: 14.5, lineHeight: 20 }}>{t("studio.madeBody")}</T>
          <PillButton size="sm" tone="white" title={t("studio.watch")} onPress={() => router.push({ pathname: "/video/[id]", params: { id: projectId } })} />
        </Card>
      ) : null}

      {/* 1. Photos */}
      <Card style={{ gap: 10 }}>
        <T weight="extrabold" style={{ fontSize: 17 }} accessibilityRole="header">{t("photos")}</T>
        {products.length ? (
          <Pressable accessibilityRole="button" onPress={() => setPicking(true)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.line, opacity: pressed ? 0.85 : 1 })}>
            {product?.images[0] ? <Image source={{ uri: product.images[0] }} style={{ width: 40, height: 40, borderRadius: 10 }} contentFit="cover" /> : <AppIcon name="box" size={20} color={colors.inkSoft} />}
            <View style={{ flex: 1 }}>
              <T style={{ color: colors.inkSoft, fontSize: 13 }}>{t("fromProduct")}</T>
              <T weight="bold" style={{ fontSize: 15.5 }} numberOfLines={1}>{product?.name ?? t("chooseProduct")}</T>
            </View>
            <AppIcon name="chevron" size={16} color={colors.inkSoft} />
          </Pressable>
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {state.photos.map((photo, index) => (
            <View key={photo} style={{ width: 84, aspectRatio: 9 / 16, borderRadius: 12, overflow: "hidden", backgroundColor: colors.canvas }}>
              <Image source={{ uri: photo }} style={{ width: "100%", height: "100%" }} contentFit="contain" accessibilityLabel={t("photoN", { n: index + 1 })} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("removePhoto", { n: index + 1 })}
                hitSlop={6}
                onPress={() => update((current) => ({ ...current, photos: current.photos.filter((item) => item !== photo) }))}
                style={{ position: "absolute", top: 4, right: 4, width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center" }}
              >
                <AppIcon name="x" size={14} />
              </Pressable>
            </View>
          ))}
          {state.photos.length < MAX_PHOTOS ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t("photos.add")} disabled={step === "photos"} onPress={() => void pickPhotos()} style={{ width: 84, aspectRatio: 9 / 16, borderRadius: 12, borderWidth: 2, borderStyle: "dashed", borderColor: colors.lineStrong, alignItems: "center", justifyContent: "center", gap: 4 }}>
              {step === "photos" ? <ActivityIndicator color={colors.ink} /> : <AppIcon name="plus" size={22} />}
              <T weight="bold" style={{ fontSize: 12.5, textAlign: "center" }}>{step === "photos" ? t("photos.adding") : t("photos.add")}</T>
            </Pressable>
          ) : null}
        </ScrollView>
        <T style={{ color: colors.inkSoft, fontSize: 13.5 }}>{t("photosTip", { max: MAX_PHOTOS })}</T>

        <View style={{ backgroundColor: colors.canvas, borderRadius: 16, padding: 12, gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <AppIcon name="sparkle" size={16} />
            <T weight="extrabold" style={{ fontSize: 15 }}>{t("shots.title")}</T>
          </View>
          <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("shots.hint")}</T>
          <ChipRow>
            {REEL_SHOT_LOOKS.map((look) => <Chip key={look} label={t(`shots.${look}`)} on={state.look === look} onPress={() => update((current) => ({ ...current, look }))} />)}
          </ChipRow>
          <T style={{ color: colors.inkSoft, fontSize: 13.5 }}>{t(`shots.${state.look}Hint`)}</T>
          <PillButton size="md" title={step === "shots" ? t("shots.making") : t("shots.make", { count: state.photos.length })} busy={step === "shots"} disabled={busy || !state.photos.length} onPress={() => void makeShots()} />
          {originals ? <LinkButton title={t("shots.undo")} onPress={() => { update((current) => ({ ...current, photos: originals })); setOriginals(null); }} /> : null}
          <T style={{ color: colors.inkSoft, fontSize: 12.5 }}>{t("shots.cost", { credits: CREDIT_COST.image })}</T>
        </View>
      </Card>

      {/* 2. Style */}
      <Card style={{ gap: 8 }}>
        <T weight="extrabold" style={{ fontSize: 17 }} accessibilityRole="header">{t("style")}</T>
        {REEL_TEMPLATES.map((option) => {
          const on = state.template === option.id;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => update((current) => withTemplate(current, option.id, purpose))}
              style={{ borderRadius: 16, borderWidth: 2, borderColor: on ? colors.ink : colors.line, backgroundColor: on ? colors.canvas : colors.surface, padding: 12, gap: 2 }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <T weight="extrabold" style={{ flex: 1, fontSize: 15 }}>{t.dynamic(`tpl.${option.id}`, option.name)}</T>
                {on ? <AppIcon name="check" size={18} /> : null}
              </View>
              <T style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19 }}>{t.dynamic(`tpl.${option.id}Blurb`, option.blurb)}</T>
              {option.cutout ? <T weight="bold" style={{ fontSize: 12, color: colors.accentInk, marginTop: 2 }}>{t("tpl.cutoutBest")}</T> : null}
            </Pressable>
          );
        })}
      </Card>

      {/* 3. Words */}
      <Card style={{ gap: 10 }}>
        <T weight="extrabold" style={{ fontSize: 17 }} accessibilityRole="header">{t("whatPeggySays")}</T>
        <View>
          <Label>{t("product")}</Label>
          <Field value={state.name} onChangeText={(name) => update((current) => ({ ...current, name }))} maxLength={160} accessibilityLabel={t("product")} />
        </View>
        <View>
          <Label>{t("priceOnScreen")}</Label>
          <Field value={state.price} onChangeText={(price) => update((current) => ({ ...current, price }))} placeholder="₦29,500" maxLength={40} accessibilityLabel={t("priceOnScreen")} />
        </View>
        <T weight="bold" style={{ fontSize: 14 }}>{t("words.language")}</T>
        <ChipRow>
          {VIDEO_LANGUAGES.map((option) => (
            <Chip key={option.key} label={t.dynamic(`lang.${option.key}`, option.label)} on={state.language === option.key} onPress={() => update((current) => ({ ...current, language: option.key, script: null }))} />
          ))}
        </ChipRow>
        <PillButton size="md" tone="white" title={state.script ? t("words.again") : t("words.write")} busy={step === "writing"} disabled={busy} onPress={() => void writeWords()} />
        {captions.map((caption, index) => (
          <View key={index}>
            <Label>{t("captionN", { n: index + 1 })}</Label>
            <Field value={caption} maxLength={48} onChangeText={(text) => update((current) => withCaption(current, purpose, index, text))} accessibilityLabel={t("captionN", { n: index + 1 })} />
          </View>
        ))}
        {state.voiceSource === "rex" || state.voiceSource === "elevenlabs" ? (
          <View>
            <Label>{t("voiceover")}</Label>
            <Field
              value={script.voiceover}
              multiline
              maxLength={600}
              onChangeText={(text) => update((current) => withScriptField(current, purpose, "voiceover", text))}
              style={{ height: 110, paddingTop: 12, textAlignVertical: "top" }}
              accessibilityLabel={t("voiceover")}
            />
          </View>
        ) : null}
        <View>
          <Label>{t("lastScreen")}</Label>
          <Field value={script.cta} maxLength={40} onChangeText={(text) => update((current) => withScriptField(current, purpose, "cta", text))} accessibilityLabel={t("lastScreen")} />
        </View>
      </Card>

      {/* 4. Sound */}
      <Card style={{ gap: 10 }}>
        <T weight="extrabold" style={{ fontSize: 17 }} accessibilityRole="header">{t("sound")}</T>
        <T weight="bold" style={{ fontSize: 14 }}>{t("voice.title")}</T>
        <ChipRow>
          {voices.map((voice) => <Chip key={voice} label={voiceLabel(voice)} on={state.voiceSource === voice} onPress={() => update((current) => ({ ...current, voiceSource: voice }))} />)}
        </ChipRow>
        {state.voiceSource === "rex" || state.voiceSource === "elevenlabs" ? (
          <>
            <Segmented options={[{ value: "female", label: t("voice.female") }, { value: "male", label: t("voice.male") }]} value={state.gender} onChange={(gender) => update((current) => ({ ...current, gender }))} />
            <T style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19 }}>{t("voice.rexHint")} {t("voice.inVideo")}</T>
          </>
        ) : state.voiceSource === "record" || state.voiceSource === "upload" ? (
          <T style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19 }}>{t("voice.onWeb")}</T>
        ) : (
          <T style={{ color: colors.inkSoft, fontSize: 13.5 }}>{t("voice.noneHint")}</T>
        )}
        <T weight="bold" style={{ fontSize: 14, marginTop: 4 }}>{t("music.title")}</T>
        <ChipRow>
          {MUSIC_MOODS.map((mood) => <Chip key={mood.id} label={t.dynamic(`music.${mood.id}`, mood.name)} on={state.music === mood.id} onPress={() => update((current) => ({ ...current, music: mood.id, musicTouched: true }))} />)}
          <Chip label={t("music.none")} on={state.music === "none"} onPress={() => update((current) => ({ ...current, music: "none", musicTouched: true }))} />
        </ChipRow>
        {state.music !== "none" ? <T style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19 }}>{t("music.hint")}</T> : null}
      </Card>

      {/* 5. Make it */}
      <Card style={{ gap: 6, backgroundColor: colors.mintTint }}>
        <T weight="extrabold" style={{ fontSize: 16, color: colors.forest }}>{t("finish.title")}</T>
        <T style={{ fontSize: 14.5, lineHeight: 21, color: colors.forest }}>{t("finish.body")}</T>
        <T style={{ fontSize: 13, color: colors.forest }}>{t("cost", { credits: CREDIT_COST.video })}</T>
      </Card>

      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      <ProductPickSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title={t("chooseProduct")}
        products={products}
        loading={false}
        onPick={(picked) => {
          const chosen = products.find((item) => item.id === picked.id);
          if (chosen) {
            update((current) => withProduct(current, chosen));
            setOriginals(null);
          }
          setPicking(false);
        }}
      />
    </Screen>
  );
}
