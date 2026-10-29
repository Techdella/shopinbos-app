import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Small, Title } from "@/components/design";
import { AppIcon, type AppIconName } from "@/components/icons";
import { LoadingBlock } from "@/components/kit";
import { LinkShareButtons } from "@/components/LinkShareButtons";
import { OnboardingFrame } from "@/components/OnboardingFrame";
import { useOnboarding } from "@/components/OnboardingContext";
import { Field, InfoTip, Label, Notice, PillButton, T } from "@/components/ui";
import { finishOnboarding } from "@/lib/onboarding";
import { fetchBio, saveBio } from "@/lib/paylinks";
import { STARTER_SOCIALS, starterBioBlocks, type BioBlock, type BioPage, type StarterSocial } from "@/lib/paylinks-pure";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// "Your link in bio" (seller onboarding, after "Your store is live!"): one link for the Instagram, TikTok and
// WhatsApp bio. It starts from the page the server suggests (GET /api/app/bio: "Shop now", new arrivals, top
// products, the WhatsApp button, "Track my order"), adds the socials the seller types, and saves it with
// PUT /api/app/bio, the same page as Link in bio (app/link-in-bio.tsx) and the web's /home/social/link-in-bio. Then
// Copy and Share. Skippable: Home's link-in-bio card offers it again (?from=home, which goes back to Home instead
// of finishing onboarding).

const SOCIAL_ICON: Record<StarterSocial, AppIconName> = { instagram: "camera", tiktok: "play", facebook: "users" };

/** The block names the preview lists, in the order the page shows them. */
function previewLines(blocks: BioBlock[], words: { shop: string; arrivals: string; whatsapp: string; socials: string; track: string; products: (count: number) => string }): { icon: AppIconName; text: string }[] {
  const lines: { icon: AppIconName; text: string }[] = [];
  let products = 0;
  for (const block of blocks) {
    if (block.type === "shop") lines.push({ icon: "store", text: block.label || words.shop });
    else if (block.type === "arrivals") lines.push({ icon: "grid", text: block.label || words.arrivals });
    else if (block.type === "product") products += 1;
    else if (block.type === "whatsapp") lines.push({ icon: "chat", text: words.whatsapp });
    else if (block.type === "socials") lines.push({ icon: "users", text: words.socials });
    else if (block.type === "track") lines.push({ icon: "truck", text: block.label || words.track });
    else if (block.type === "link") lines.push({ icon: "link", text: block.label });
  }
  // The product cards sit under "Shop now" and "New arrivals", as on the page.
  if (products) lines.splice(Math.min(lines.length, 2), 0, { icon: "bag", text: words.products(products) });
  return lines;
}

export default function OnboardingBio() {
  const t = useT("m_onboarding", "common");
  const { status } = useOnboarding();
  const fromHome = useLocalSearchParams<{ from?: string }>().from === "home";
  const [page, setPage] = useState<BioPage | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [socials, setSocials] = useState<Record<StarterSocial, string>>({ instagram: "", tiktok: "", facebook: "" });
  const [busy, setBusy] = useState<"save" | "leave" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<BioPage | null>(null);

  useEffect(() => {
    let alive = true;
    fetchBio()
      .then((loaded) => {
        if (!alive) return;
        setPage(loaded);
        // Already made (on the web, or a second time through): straight to the link.
        if (loaded.exists) setSaved(loaded);
      })
      .catch(() => alive && setLoadError(true));
    return () => {
      alive = false;
    };
  }, []);

  async function leave() {
    if (fromHome) return router.canGoBack() ? router.back() : router.replace("/home");
    setBusy("leave");
    await finishOnboarding(Boolean(status?.store.live)).catch(() => null);
    router.replace("/home");
  }

  async function create() {
    if (!page) return;
    setBusy("save");
    setProblem(null);
    try {
      const next = await saveBio({ published: true, title: page.title, bio: page.bio, avatarUrl: page.avatarUrl, theme: page.theme, blocks: starterBioBlocks(page.blocks, socials) });
      setSaved(next);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : t("bio.failed"));
    } finally {
      setBusy(null);
    }
  }

  const blocks = page ? starterBioBlocks(page.blocks, socials) : [];
  const name = status?.store.name ?? page?.title ?? "";

  return (
    <OnboardingFrame
      step="checklist"
      onSkip={saved ? null : () => void leave()}
      footer={
        saved ? (
          <PillButton testID="bio-done" title={t("bio.done")} tone="accent" busy={busy === "leave"} onPress={() => void leave()} />
        ) : (
          <>
            {problem ? <Notice>{problem}</Notice> : null}
            <PillButton testID="bio-create" title={t("bio.create")} tone="accent" busy={busy === "save"} disabled={!page || busy !== null} onPress={() => void create()} />
          </>
        )
      }
    >
      {/* What the page is (and, once made, where to put it): in the tip next to the title. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Title style={{ flexShrink: 1 }}>{saved ? t("bio.readyTitle") : t("bio.title")}</Title>
        <InfoTip testID="bio-tip" title={saved ? t("bio.readyTitle") : t("bio.title")} text={saved ? [t("bio.readySub"), t("bio.where")] : t("bio.sub")} size={20} />
      </View>

      {!page && !loadError ? (
        <View style={{ marginTop: 20 }}>
          <LoadingBlock />
        </View>
      ) : null}
      {loadError ? (
        <View style={{ marginTop: 20 }}>
          <Notice tone="info">{t("bio.loadFailed")}</Notice>
        </View>
      ) : null}

      {saved ? (
        <View style={{ marginTop: 20, gap: 14 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <AppIcon name="check" size={18} color={colors.success} />
              <T weight="bold" style={{ color: colors.success, fontSize: 15 }}>{t("bio.live")}</T>
            </View>
            <LinkShareButtons url={saved.url} message={t("bio.shareMessage", { name, url: saved.url })} showWhatsapp={false} />
          </View>
        </View>
      ) : page ? (
        <View style={{ marginTop: 20, gap: 16 }}>
          {/* A small picture of the page: the shop's name and what's on it, in order. */}
          <View testID="bio-preview" style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 8 }}>
            <View style={{ alignItems: "center", gap: 4, marginBottom: 4 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.mintTint, alignItems: "center", justifyContent: "center" }}>
                <T weight="extrabold" style={{ fontSize: 22, color: colors.forest }}>{(name.trim()[0] ?? "S").toUpperCase()}</T>
              </View>
              <T weight="extrabold" style={{ fontSize: 16 }} numberOfLines={1}>{name}</T>
              <T style={{ color: colors.inkSoft, fontSize: 13 }} numberOfLines={1}>{page.url.replace(/^https?:\/\//, "")}</T>
            </View>
            {previewLines(blocks, { shop: t("bio.preview.shop"), arrivals: t("bio.preview.arrivals"), whatsapp: t("bio.preview.whatsapp"), socials: t("bio.preview.socials"), track: t("bio.preview.track"), products: (count) => t("bio.preview.products", { count }) }).map((line, index) => (
              <View key={`${line.icon}-${index}`} style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.canvas, borderRadius: radii.pill, paddingHorizontal: 14, minHeight: 40 }}>
                <AppIcon name={line.icon} size={16} color={colors.inkSoft} />
                <T weight="semibold" style={{ flex: 1, fontSize: 14 }} numberOfLines={1}>{line.text}</T>
              </View>
            ))}
          </View>

          <View style={{ gap: 10 }}>
            <T weight="bold" style={{ fontSize: 15 }}>{t("bio.socials")}</T>
            {STARTER_SOCIALS.map((key) => (
              <View key={key}>
                <Label>{t(`bio.social.${key}`)}</Label>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" }}>
                    <AppIcon name={SOCIAL_ICON[key]} size={18} />
                  </View>
                  <Field
                    testID={`bio-${key}`}
                    style={{ flex: 1 }}
                    value={socials[key]}
                    onChangeText={(value) => setSocials((current) => ({ ...current, [key]: value }))}
                    placeholder={t("bio.handleHint")}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={200}
                    accessibilityLabel={t(`bio.social.${key}`)}
                  />
                </View>
              </View>
            ))}
            <Small>{t("bio.socialsHint")}</Small>
          </View>
        </View>
      ) : null}
    </OnboardingFrame>
  );
}
