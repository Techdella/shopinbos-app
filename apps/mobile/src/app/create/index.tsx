import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CreditsLine } from "@/components/familiar/Credits";
import { Eyebrow, List, Row, Seg, TILE, Tile } from "@/components/design";
import { Screen } from "@/components/Screen";
import { Field, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { fetchCredits, fetchIdeas, startCreate, type CreateFormat, type CreateIdea } from "@/lib/familiar";
import { asFormat, familiarRole, FORMAT_KEY, FORMATS } from "@/lib/familiar-pure";
import { useRole } from "@/lib/role";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Create with Rex, step 1 ("Familiar app" prototype `create`): pick a format (Status, Reel, Post, Flyer), tap
// "Make it" on one of Rex's ideas for you, or say what you want. Rex makes 3 designs (POST /api/mobile/create) and the
// next screen waits for them. Credits are shown, never sold here.

export default function Create() {
  const t = useT("m_familiar");
  const { role } = useRole();
  const who = familiarRole(role);
  const params = useLocalSearchParams<{ format?: string; productId?: string; prompt?: string }>();
  const [format, setFormat] = useState<CreateFormat>(asFormat(params.format) ?? "status");
  const [prompt, setPrompt] = useState(typeof params.prompt === "string" ? params.prompt : "");
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const ideas = useLoad(fetchIdeas);
  const credits = useLoad(fetchCredits);

  const make = async (input: { format: CreateFormat; ideaId?: string; prompt?: string }, key: string) => {
    if (busy) return;
    setBusy(key);
    setProblem(null);
    try {
      const { job } = await startCreate({ ...input, productId: typeof params.productId === "string" ? params.productId : undefined });
      router.push({ pathname: "/create/[id]", params: { id: job.id } });
      void credits.reload();
    } catch (error) {
      // A missing route reads as an outage: "Rex couldn't start just now. Try again."
      setProblem(error instanceof ApiError && (error.status === 404 || error.status === 501) ? t("cr.failed") : error instanceof Error ? error.message : t("cr.failed"));
    } finally {
      setBusy(null);
    }
  };

  const list: CreateIdea[] = ideas.data?.ideas ?? [];
  // Ideas in the picked format first.
  const sorted = [...list].sort((a, b) => Number(b.format === format) - Number(a.format === format));
  const tipKey = who === "logistics_partner" ? "cr.tip.partner" : who === "supplier" ? "cr.tip.supplier" : "cr.tip.seller";

  return (
    <Screen
      title={t("cr.title")}
      footer={
        <PillButton
          title={t("cr.make", { format: t(FORMAT_KEY[format]) })}
          tone="accent"
          busy={busy === "prompt"}
          disabled={!prompt.trim() || Boolean(busy)}
          onPress={() => void make({ format, prompt: prompt.trim().slice(0, 600) }, "prompt")}
        />
      }
    >
      <CreditsLine balance={credits.data?.balance} who="rex" />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel={t("cr.formatLabel")}>
        {FORMATS.map((option) => <Seg key={option} label={t(FORMAT_KEY[option])} on={format === option} onPress={() => setFormat(option)} />)}
      </View>

      {sorted.length ? (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Eyebrow>{t("cr.ideas")}</Eyebrow>
            <LinkButton title={t("cr.myPosts")} onPress={() => router.push("/posts")} />
          </View>
          <List>
            {sorted.slice(0, 6).map((idea) => (
              <Row
                key={idea.id}
                lead={<Tile icon={idea.format === "reel" ? "play" : idea.format === "flyer" ? "doc" : "image"} tone={idea.format === "status" ? "lime" : idea.format === "reel" ? "lilac" : idea.format === "flyer" ? "butter" : "sky"} />}
                title={idea.title}
                sub={`${t(FORMAT_KEY[idea.format] ?? FORMAT_KEY.post)} · ${idea.line}`}
                right={<PillButton title={t("cr.makeIt")} tone="accent" size="sm" busy={busy === idea.id} accessibilityLabel={t("cr.makeItLabel", { title: idea.title })} onPress={() => void make({ format: idea.format, ideaId: idea.id }, idea.id)} />}
              />
            ))}
          </List>
        </View>
      ) : (
        <View style={{ alignItems: "flex-end" }}>
          <LinkButton title={t("cr.myPosts")} onPress={() => router.push("/posts")} />
        </View>
      )}

      <View style={{ gap: 8 }}>
        <T weight="bold" style={{ fontSize: 15 }} nativeID="create-prompt">{t("cr.promptLabel")}</T>
        <Field
          value={prompt}
          onChangeText={setPrompt}
          placeholder={t("cr.promptHint")}
          multiline
          maxLength={600}
          accessibilityLabel={t("cr.promptLabel")}
          accessibilityLabelledBy="create-prompt"
          style={{ height: 110, paddingTop: 14, textAlignVertical: "top" }}
        />
      </View>

      {problem ? <Notice>{problem}</Notice> : null}

      <View style={{ backgroundColor: TILE.butter.bg, borderRadius: 24, padding: 18, gap: 6 }}>
        <T weight="extrabold" style={{ fontSize: 16 }}>{t("cr.tipTitle")}</T>
        <T style={{ fontSize: 14.5, lineHeight: 21, color: colors.ink }}>{t(tipKey)}</T>
      </View>
    </Screen>
  );
}
