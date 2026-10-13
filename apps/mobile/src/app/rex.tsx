import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { AppIcon } from "@/components/icons";
import { Bubble, ChatScreen, Composer } from "@/components/ChatScreen";
import { Chip, Mascot, PillButton, T } from "@/components/ui";
import { askRex, cardNote, REX_STARTERS, type RexCard } from "@/lib/rex";
import { openPath, openWeb } from "@/lib/web";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// Rex Studio chat (web /studio), like Peggy's screen: Rex changes the draft store, makes pictures, logos,
// descriptions and campaigns. Cards show what he made; previewing, publishing and saving pictures open the web.

interface Turn {
  from: "me" | "rex";
  text: string;
  cards?: RexCard[];
  /** Errors are shown but not sent back to Rex as part of the conversation. */
  failed?: boolean;
}

const MAX_TURNS = 20;

function CardAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ alignSelf: "flex-start", borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 8 }}>
      <T weight="bold" style={{ fontSize: 14 }}>{label}</T>
    </Pressable>
  );
}

function CardView({ card, ask }: { card: RexCard; ask: (text: string) => void }) {
  const t = useT("m_rex", "common");
  const frame = { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 8 } as const;
  switch (card.type) {
    case "image":
      return (
        <View style={frame}>
          <T weight="extrabold" style={{ fontSize: 14.5 }}>{card.title}{card.product ? ` · ${card.product.name}` : ""}</T>
          <Image source={{ uri: card.after }} style={{ width: "100%", aspectRatio: 1, borderRadius: 12, backgroundColor: colors.lilac }} contentFit="cover" accessibilityLabel={card.title} />
          <CardAction label={t("card.save")} onPress={() => void openWeb("/studio")} />
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
          <CardAction label={t("card.makeVideo")} onPress={() => void openWeb("/home/video")} />
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

export default function Rex() {
  const t = useT("m_rex");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
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
          <View style={{ flex: 1 }}>
            <T weight="extrabold" style={{ fontSize: 16 }}>Rex Studio</T>
            <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("tagline")}</T>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t("openWeb")} onPress={() => void openWeb("/studio")} hitSlop={6} style={{ height: 38, borderRadius: radii.pill, paddingHorizontal: 12, justifyContent: "center", backgroundColor: colors.surface }}>
            <T weight="bold" style={{ fontSize: 14 }}>{t("previewButton")}</T>
          </Pressable>
        </>
      }
      scrollKey={turns.length + (thinking ? 1 : 0)}
      composer={<Composer value={draft} onChange={setDraft} onSend={() => void ask()} busy={thinking} placeholder={t("placeholder")} />}
    >
      {!turns.length ? (
        <>
          <Bubble mine={false}>{t("hello")}</Bubble>
          <View style={{ gap: 8 }}>
            {REX_STARTERS.map((starter, index) => (
              <Pressable key={starter.title} accessibilityRole="button" onPress={() => void ask(t.dynamic(`starter.${index + 1}.prompt`, starter.prompt))} style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 }}>
                <AppIcon name="sparkle" size={18} />
                <T weight="semibold" style={{ flex: 1, fontSize: 14 }}>{t.dynamic(`starter.${index + 1}.title`, starter.title)}</T>
                <AppIcon name="chevron" size={16} color={colors.inkSoft} />
              </Pressable>
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
            {turn.cards?.map((card, cardIndex) => <CardView key={cardIndex} card={card} ask={(text) => void ask(text)} />)}
          </View>
        ),
      )}
      {thinking ? <T style={{ color: colors.inkSoft }}>{t("working")}</T> : null}
      {turns.length ? <PillButton title={t("openWeb")} tone="white" size="sm" style={{ alignSelf: "center", marginTop: 6 }} onPress={() => void openWeb("/studio")} /> : null}
    </ChatScreen>
  );
}
