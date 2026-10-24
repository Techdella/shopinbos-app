import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { AppIcon } from "@/components/icons";
import { Bubble, ChatScreen, Composer } from "@/components/ChatScreen";
import { ShareSheet } from "@/components/familiar/ShareSheet";
import { Chip, Mascot, Notice, PillButton, T } from "@/components/ui";
import { emailTopUp, fetchCredits } from "@/lib/familiar";
import { askRex, cardNote, REX_STARTERS, type RexCard } from "@/lib/rex";
import { startVideoFromRex } from "@/lib/video";
import { openPath, openWeb } from "@/lib/web";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// Ask Rex ("Familiar app" prototype `askRex`; Rex Studio chat, web /studio), like Peggy's screen: "I build and
// change your shop", the credits with Top up (an email, never a sale in the app), three suggestions and the rest
// of what Rex can do. Rex changes the draft store, makes pictures, logos, descriptions and campaigns. Cards show
// what he made; a reel opens the phone's video studio as a draft with his words; his pictures share from the phone's
// share sheet; previewing and publishing the shop open the web.

interface Turn {
  from: "me" | "rex";
  text: string;
  cards?: RexCard[];
  /** Errors are shown but not sent back to Rex as part of the conversation. */
  failed?: boolean;
}

const MAX_TURNS = 20;

/** Rex's reel card: a draft with his words for the product, opened in the phone's video studio. */
async function makeVideo(card: Extract<RexCard, { type: "video" }>) {
  try {
    const id = await startVideoFromRex(card);
    router.push({ pathname: "/video/studio", params: { id } });
  } catch {
    // The draft didn't save: start one for the product instead (Rex's words can be written again there).
    router.push({ pathname: "/video/studio", params: { purpose: "social", product: card.product.id } });
  }
}

function CardAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ alignSelf: "flex-start", borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 8 }}>
      <T weight="bold" style={{ fontSize: 14 }}>{label}</T>
    </Pressable>
  );
}

function CardView({ card, ask, share }: { card: RexCard; ask: (text: string) => void; share: (imageUrl: string) => void }) {
  const t = useT("m_rex", "common", "m_familiar");
  const frame = { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 8 } as const;
  switch (card.type) {
    case "image":
      return (
        <View style={frame}>
          <T weight="extrabold" style={{ fontSize: 14.5 }}>{card.title}{card.product ? ` · ${card.product.name}` : ""}</T>
          <Image source={{ uri: card.after }} style={{ width: "100%", aspectRatio: 1, borderRadius: 12, backgroundColor: colors.lilac }} contentFit="cover" accessibilityLabel={card.title} />
          <CardAction label={t("posts.share")} onPress={() => share(card.after)} />
        </View>
      );
    case "logos":
      return (
        <View style={frame}>
          <T weight="extrabold" style={{ fontSize: 14.5 }}>{t("card.logos")}</T>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {card.options.map((option) => (
              <View key={option.url} style={{ flex: 1, gap: 4 }}>
                <Image source={{ uri: option.url }} style={{ width: "100%", aspectRatio: 1, borderRadius: 12, backgroundColor: colors.canvas }} contentFit="contain" accessibilityLabel={option.label} />
                <T style={{ fontSize: 13, color: colors.inkSoft }} numberOfLines={1}>{option.label}</T>
              </View>
            ))}
          </View>
          <CardAction label={t("card.pickLogo")} onPress={() => void openWeb("/studio")} />
        </View>
      );
    case "store":
      return (
        <View style={frame}>
          <T weight="extrabold" style={{ fontSize: 14.5 }}>{card.version ? t("card.changedVersion", { n: card.version.n }) : t("card.changed")}</T>
          {card.changes.map((change, index) => <T key={index} style={{ fontSize: 14, color: colors.inkSoft }}>• {change}</T>)}
          <CardAction label={t("card.preview")} onPress={() => void openWeb("/studio")} />
        </View>
      );
    case "themes":
      return (
        <View style={frame}>
          <T weight="extrabold" style={{ fontSize: 15 }}>{t("card.themes")}</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {card.themes.map((theme) => <Chip key={theme.id} label={theme.name} on={theme.id === card.current} onPress={() => ask(t("card.switchTheme", { name: theme.name }))} />)}
          </View>
        </View>
      );
    case "copy":
      return (
        <View style={frame}>
          <T weight="extrabold" style={{ fontSize: 14.5 }}>{t("card.description", { name: card.product.name })}</T>
          <T style={{ fontSize: 14.5, lineHeight: 19 }}>{card.after}</T>
          <CardAction label={t("card.use")} onPress={() => void openWeb("/studio")} />
        </View>
      );
    case "video":
      return (
        <View style={frame}>
          <T weight="extrabold" style={{ fontSize: 14.5 }}>{t("card.reel", { name: card.product.name })}</T>
          {card.script.captions.map((caption, index) => <T key={index} style={{ fontSize: 14, color: colors.inkSoft }}>{index + 1}. {caption}</T>)}
          <CardAction label={t("card.makeVideo")} onPress={() => void makeVideo(card)} />
        </View>
      );
    case "marketing":
      return (
        <Pressable accessibilityRole="link" onPress={() => void openPath(card.href)} style={[frame, { flexDirection: "row", alignItems: "center" }]}>
          <AppIcon name="megaphone" size={18} />
          <View style={{ flex: 1 }}>
            <T weight="extrabold" style={{ fontSize: 14.5 }}>{card.title}</T>
            <T style={{ fontSize: 14, color: colors.inkSoft }} numberOfLines={2}>{card.summary}</T>
          </View>
          <AppIcon name="chevron" size={16} color={colors.inkSoft} />
        </Pressable>
      );
    case "health":
      return (
        <View style={frame}>
          <T weight="extrabold" style={{ fontSize: 14.5 }}>{t("card.health", { score: card.score })}</T>
          {card.missing.map((item, index) => (
            <Pressable key={index} disabled={!item.rexPrompt && !item.href} onPress={() => (item.rexPrompt ? ask(item.rexPrompt) : item.href ? void openPath(item.href) : undefined)} style={{ flexDirection: "row", gap: 8, alignItems: "center", paddingVertical: 4 }}>
              <T style={{ flex: 1, fontSize: 14 }}>• {item.label}</T>
              {item.rexPrompt || item.href ? <T weight="bold" style={{ fontSize: 14, color: colors.accentInk }}>{item.rexPrompt ? t("card.fix") : t("open")}</T> : null}
            </Pressable>
          ))}
        </View>
      );
    case "preview":
      return <CardAction label={t("card.openPreview")} onPress={() => void openWeb("/studio")} />;
    default:
      return null;
  }
}

/** "120 credits · Top up": the shared AI credit balance (never sold in the app: Top up emails how to buy more on the
 * website, App Store and Play rules). Hidden on a server without credits. */
function CreditsLine() {
  const t = useT("m_rex");
  const [credits, setCredits] = useState<{ balance: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchCredits()
      .then((answer) => alive && setCredits(answer))
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, []);
  if (!credits) return null;

  async function topUp() {
    setSending(true);
    setNote(null);
    try {
      await emailTopUp();
      setNote({ tone: "success", text: t("credits.emailed") });
    } catch (topUpError) {
      setNote({ tone: "error", text: topUpError instanceof Error ? topUpError.message : t("credits.emailFailed") });
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={{ gap: 8, alignItems: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line, paddingLeft: 14, paddingRight: 4, minHeight: 44 }}>
        <T weight="bold" style={{ fontSize: 14 }}>{t("credits.count", { count: credits.balance })}</T>
        <Pressable testID="rex-top-up" accessibilityRole="button" accessibilityLabel={t("credits.topUpLabel")} disabled={sending} onPress={() => void topUp()} style={{ minHeight: 36, borderRadius: radii.pill, paddingHorizontal: 12, justifyContent: "center", backgroundColor: colors.canvas, opacity: sending ? 0.6 : 1 }}>
          <T weight="extrabold" style={{ fontSize: 14 }}>{t("credits.topUp")}</T>
        </Pressable>
      </View>
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
    </View>
  );
}

/** What a seller asks Rex most ("Familiar app" prototype `askRex`). */
const SUGGESTIONS = ["suggest.1", "suggest.2", "suggest.3"] as const;

export default function Rex() {
  const t = useT("m_rex");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);
  const { prompt } = useLocalSearchParams<{ prompt?: string }>();
  const asked = useRef(false);

  async function ask(text = draft) {
    const message = text.trim();
    if (!message || thinking) return;
    setDraft("");
    const next: Turn[] = [...turns, { from: "me", text: message }];
    setTurns(next);
    setThinking(true);
    try {
      // The whole conversation goes to Rex, with a short note of each card so he can refer back to it.
      const messages = next
        .filter((turn) => !turn.failed)
        .slice(-MAX_TURNS)
        .map((turn) => ({
          role: turn.from === "me" ? ("user" as const) : ("assistant" as const),
          content: [turn.text, ...(turn.cards ?? []).map(cardNote)].filter(Boolean).join("\n").slice(0, 4000),
        }));
      const reply = await askRex(messages);
      setTurns((current) => [...current, { from: "rex", text: reply.text, cards: reply.cards ?? [] }]);
    } catch (askError) {
      setTurns((current) => [...current, { from: "rex", failed: true, text: askError instanceof Error ? askError.message : t("failed") }]);
    } finally {
      setThinking(false);
    }
  }

  useEffect(() => {
    if (!prompt || asked.current) return;
    asked.current = true;
    void ask(prompt);
    // Only on open: `ask` changes every render.
  }, [prompt]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ChatScreen
      header={
        <>
          <Mascot name="rex" size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T weight="extrabold" style={{ fontSize: 16 }} numberOfLines={1}>{t("askRex")}</T>
            <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>{t("line")}</T>
          </View>
          {/* A round icon (not a word) so "Ask Rex" and its line keep the header's width. */}
          <Pressable accessibilityRole="button" accessibilityLabel={`${t("previewButton")}: ${t("openWeb")}`} onPress={() => void openWeb("/studio")} hitSlop={6} style={{ width: 44, height: 44, borderRadius: radii.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
            <AppIcon name="globe" size={20} />
          </Pressable>
        </>
      }
      scrollKey={turns.length + (thinking ? 1 : 0)}
      composer={<Composer value={draft} onChange={setDraft} onSend={() => void ask()} busy={thinking} placeholder={t("placeholder")} />}
    >
      <CreditsLine />
      {!turns.length ? (
        <>
          <Bubble mine={false}>{t("hello2")}</Bubble>
          <View style={{ gap: 8 }}>
            {SUGGESTIONS.map((key) => (
              <Pressable key={key} accessibilityRole="button" onPress={() => void ask(t(key))} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 12 }}>
                <AppIcon name="sparkle" size={18} color={colors.accentInk} />
                <T weight="bold" style={{ flex: 1, fontSize: 14.5 }}>{t(key)}</T>
              </Pressable>
            ))}
          </View>
          <T weight="extrabold" style={{ fontSize: 13, letterSpacing: 0.8, textTransform: "uppercase", color: colors.inkSoft, marginTop: 4 }}>{t("more")}</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {REX_STARTERS.map((starter, index) => (
              <Chip key={starter.title} label={t.dynamic(`starter.${index + 1}.title`, starter.title)} on={false} onPress={() => void ask(t.dynamic(`starter.${index + 1}.prompt`, starter.prompt))} />
            ))}
          </View>
        </>
      ) : null}
      {turns.map((turn, index) =>
        turn.from === "me" ? (
          <Bubble key={index} mine>{turn.text}</Bubble>
        ) : (
          <View key={index} style={{ gap: 8, marginRight: 24 }}>
            {turn.text ? <Bubble mine={false}><T style={{ fontSize: 15, lineHeight: 21, color: turn.failed ? colors.inkSoft : colors.ink }}>{turn.text}</T></Bubble> : null}
            {turn.cards?.map((card, cardIndex) => <CardView key={cardIndex} card={card} ask={(text) => void ask(text)} share={setSharing} />)}
          </View>
        ),
      )}
      {thinking ? <T style={{ color: colors.inkSoft }}>{t("working")}</T> : null}
      {turns.length ? <PillButton title={t("openWeb")} tone="white" size="sm" style={{ alignSelf: "center", marginTop: 6 }} onPress={() => void openWeb("/studio")} /> : null}
      {/* Rex's pictures are shared in the app: the phone's share sheet (WhatsApp, Instagram, TikTok, Facebook, Save). */}
      <ShareSheet visible={Boolean(sharing)} onClose={() => setSharing(null)} imageUrl={sharing} caption="" />
    </ChatScreen>
  );
}
