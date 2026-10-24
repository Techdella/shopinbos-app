import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { ScheduleSheet } from "@/components/familiar/ScheduleSheet";
import { ShareSheet } from "@/components/familiar/ShareSheet";
import { Pill, Sub, Title } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { EmptyState, ErrorState } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Field, LinkButton, Mascot, Notice, PillButton, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { fetchCreateJob, savePost, startCreate, updatePost, type CreateJob, type PostPlatform } from "@/lib/familiar";
import { FORMAT_KEY, POLL_LIMIT, pollDelay } from "@/lib/familiar-pure";
import type { ShareTarget } from "@/lib/familiar-share";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// Create with Rex, step 2 ("Familiar app" prototype `making` then `result`): "Rex is making 3 designs" while
// GET /api/mobile/create/[id] says "making" (polled), then the three designs to pick from, the caption to edit,
// "Make 3 more", Share now (the phone's share sheet) and Schedule. A seller's post goes on their Social posts
// calendar (the website's), so Facebook and Instagram post by themselves when the Page is connected and WhatsApp
// and TikTok get a reminder; suppliers and delivery partners get a reminder for every app.

const PLATFORM_OF: Record<ShareTarget, PostPlatform | null> = { whatsapp_status: "whatsapp", whatsapp_chat: "whatsapp", tiktok: "tiktok", instagram: "instagram", facebook: "facebook", save: null };

export default function CreateResult() {
  const t = useT("m_familiar");
  const { id } = useLocalSearchParams<{ id: string }>();
  const [job, setJob] = useState<CreateJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [picked, setPicked] = useState(0);
  const [caption, setCaption] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"share" | "schedule" | null>(null);
  const [again, setAgain] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [savedPostId, setSavedPostId] = useState<string | null>(null);
  // Bumped to start polling again ("Check again", or after a load problem).
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      try {
        const { job: next } = await fetchCreateJob(id);
        if (!alive) return;
        setJob(next);
        setError(null);
        if (next.status === "making") {
          attempt += 1;
          if (attempt >= POLL_LIMIT) setSlow(true);
          else timer = setTimeout(() => void tick(), pollDelay(attempt));
        }
      } catch (loadError) {
        if (!alive) return;
        // A missing route is an outage too: the normal error with Retry.
        if (loadError instanceof ApiError && (loadError.status === 404 || loadError.status === 501)) setError(t("cr.loadFailed"));
        else setError(loadError instanceof Error ? loadError.message : t("cr.failed"));
      }
    };
    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [id, round, t]);

  const checkAgain = () => {
    setSlow(false);
    setError(null);
    setRound((current) => current + 1);
  };

  const designs = job?.designs ?? [];
  const design = designs[Math.min(picked, Math.max(0, designs.length - 1))] ?? null;
  const text = caption ?? design?.caption ?? "";

  const pick = (index: number) => {
    setPicked(index);
    // A new design brings its own caption unless the person already wrote theirs.
    if (caption !== null && caption === (design?.caption ?? "")) setCaption(null);
  };

  const makeMore = async () => {
    if (!job || again) return;
    setAgain(true);
    setProblem(null);
    try {
      const { job: next } = await startCreate({ format: job.format });
      router.replace({ pathname: "/create/[id]", params: { id: next.id } });
    } catch (startError) {
      setProblem(startError instanceof Error ? startError.message : t("cr.failed"));
    } finally {
      setAgain(false);
    }
  };

  const onShared = async (target: ShareTarget) => {
    const platform = PLATFORM_OF[target];
    if (!design || !platform || savedPostId) return;
    // Keep it in the posts calendar as posted (best effort: the calendar may not be on this server yet).
    try {
      const { post } = await savePost({ designId: design.id, imageUrl: design.imageUrl, caption: text, platforms: [platform] });
      setSavedPostId(post.id);
      await updatePost(post.id, { status: "posted", channel: platform }).catch(() => null);
    } catch {
      // fine: it was shared
    }
  };

  const schedule = async ({ scheduledAt, platforms }: { scheduledAt: Date; platforms: PostPlatform[] }) => {
    if (!design) return;
    try {
      const { post } = await savePost({ designId: design.id, imageUrl: design.imageUrl, caption: text, platforms, scheduledAt: scheduledAt.toISOString() });
      setSheet(null);
      router.replace({ pathname: "/posts/[id]", params: { id: post.id, scheduled: "1" } });
    } catch (saveError) {
      if (saveError instanceof ApiError && (saveError.status === 404 || saveError.status === 501)) throw new Error(t("sched.failed"));
      throw saveError;
    }
  };

  // ─── Making ───
  if (!error && (!job || job.status === "making")) {
    return (
      <Screen title={t("cr.title")} help={false}>
        <View style={{ alignItems: "center", gap: 16, paddingTop: 40 }} accessibilityLiveRegion="polite">
          <Mascot who="rex" mood={slow ? "idle" : "working"} size={120} label="" />
          <Title style={{ textAlign: "center" }}>{t("cr.making")}</Title>
          <Sub style={{ textAlign: "center" }}>{slow ? t("cr.slow") : t("cr.makingSub")}</Sub>
          {slow ? <PillButton title={t("cr.checkAgain")} tone="white" size="md" onPress={checkAgain} /> : <ActivityIndicator color={colors.ink} size="large" />}
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title={t("cr.yourDesigns")}
      footer={
        job?.status === "done" && design ? (
          <>
            <PillButton tone="accent" onPress={() => setSheet("share")} accessibilityLabel={t("cr.shareNow")}>
              <AppIcon name="share" size={20} color={colors.ink} />
              <T weight="extrabold" style={{ fontSize: 17 }}>{t("cr.shareNow")}</T>
            </PillButton>
            <PillButton tone="white" size="md" onPress={() => setSheet("schedule")} accessibilityLabel={t("cr.schedule")}>
              <AppIcon name="clock" size={18} color={colors.ink} />
              <T weight="bold" style={{ fontSize: 16 }}>{t("cr.schedule")}</T>
            </PillButton>
          </>
        ) : null
      }
    >
      {error ? <ErrorState message={error} onRetry={checkAgain} /> : null}

      {job?.status === "failed" ? (
        <View style={{ gap: 12 }}>
          <Notice>{job.error || t("cr.jobFailed")}</Notice>
          <PillButton title={t("cr.tryAgain")} tone="white" size="md" busy={again} onPress={() => void makeMore()} />
        </View>
      ) : null}

      {job?.status === "done" && !designs.length ? <EmptyState icon="image" title={t("cr.none")} /> : null}

      {job?.status === "done" && designs.length ? (
        <>
          <Pill label={t(FORMAT_KEY[job.format] ?? FORMAT_KEY.post)} tone="org" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }} style={{ marginHorizontal: -20 }}>
            {designs.map((item, index) => {
              const on = index === picked;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={t("cr.designLabel", { n: index + 1, total: designs.length })}
                  onPress={() => pick(index)}
                  style={{ width: 210, borderRadius: 24, borderWidth: on ? 3 : 1, borderColor: on ? colors.accent : colors.line, overflow: "hidden", backgroundColor: colors.surface }}
                >
                  <Image source={{ uri: item.imageUrl }} style={{ width: "100%", aspectRatio: job.format === "post" ? 1 : 9 / 14, backgroundColor: colors.grayTint }} contentFit="cover" accessibilityIgnoresInvertColors />
                  {on ? (
                    <View style={{ position: "absolute", top: 10, right: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
                      <AppIcon name="check" size={16} color={colors.ink} strokeWidth={3} />
                    </View>
                  ) : null}
                  {job.format === "reel" ? (
                    <View style={{ position: "absolute", top: 10, left: 10, width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(22,20,31,0.6)", alignItems: "center", justifyContent: "center" }}>
                      <AppIcon name="play" size={16} color="#FFFFFF" />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={{ gap: 8 }}>
            <T weight="bold" style={{ fontSize: 15 }}>{t("cr.caption")}</T>
            <Field value={text} onChangeText={setCaption} multiline maxLength={2000} accessibilityLabel={t("cr.caption")} style={{ height: 130, paddingTop: 14, textAlignVertical: "top", borderRadius: radii.field }} />
          </View>

          <LinkButton title={again ? t("cr.makingMore") : t("cr.makeMore")} onPress={() => void makeMore()} />
          {problem ? <Notice>{problem}</Notice> : null}
          {savedPostId ? <T style={{ fontSize: 14, color: colors.inkSoft }}>{t("share.saved")}</T> : null}
        </>
      ) : null}

      <ShareSheet visible={sheet === "share"} onClose={() => setSheet(null)} imageUrl={design?.imageUrl ?? null} caption={text} onShared={(target) => void onShared(target)} />
      {sheet === "schedule" ? <ScheduleSheet visible onClose={() => setSheet(null)} onSave={schedule} /> : null}
    </Screen>
  );
}
