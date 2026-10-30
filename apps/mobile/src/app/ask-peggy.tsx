import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Bubble, ChatScreen, Composer } from "@/components/ChatScreen";
import { CallPeggyButton } from "@/components/CallPeggyButton";
import { CreditsLine } from "@/components/familiar/Credits";
import { TILE } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { ErrorState } from "@/components/kit";
import { Mascot, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { askPeggy, fetchCredits, fetchPeggyIntro, type ChatTurn } from "@/lib/familiar";
import { familiarRole } from "@/lib/familiar-pure";
import { homeFor } from "@/lib/partner-pure";
import { useRole } from "@/lib/role";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors, fonts, surfaceCard } from "@/theme";

// Ask Peggy for sellers, suppliers and delivery partners ("Familiar app" prototype `askPeggy`): GET/POST
// /api/mobile/peggy. Peggy answers from the person's own numbers (products, stock, orders and quotes; jobs, missed
// offers and rates). The credits line shows what's left; Top up emails how to top up on the website.
// The seller's older /peggy screen stays as it is: it can also do things (send a reply, change a price), which this
// read-mostly chat can't, so it isn't replaced.

interface Turn {
  from: "me" | "peggy";
  text: string;
  /** Shown, but not sent back to Peggy. */
  failed?: boolean;
}

const MAX_TURNS = 20;

const DEFAULT_SUGGESTIONS = {
  seller: ["peg.suggest.seller.1", "peg.suggest.seller.2", "peg.suggest.seller.3"],
  supplier: ["peg.suggest.supplier.1", "peg.suggest.supplier.2", "peg.suggest.supplier.3"],
  logistics_partner: ["peg.suggest.partner.1", "peg.suggest.partner.2", "peg.suggest.partner.3"],
} as const;

export default function AskPeggy() {
  const t = useT("m_familiar");
  const { role } = useRole();
  const who = familiarRole(role);
  const intro = useLoad(fetchPeggyIntro);
  const credits = useLoad(fetchCredits);
  const [balance, setBalance] = useState<number | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const { prompt } = useLocalSearchParams<{ prompt?: string }>();
  const asked = useRef(false);

  // No answer from GET (a 404): the normal error with Retry.
  const missing = !intro.loading && !intro.error && !intro.data;
  const shownBalance = balance ?? credits.data?.balance ?? null;
  const suggestions = intro.data?.suggestions?.length ? intro.data.suggestions.slice(0, 4) : DEFAULT_SUGGESTIONS[who].map((key) => t(key));

  async function ask(text = draft) {
    const message = text.trim();
    if (!message || thinking || missing) return;
    setDraft("");
    const next: Turn[] = [...turns, { from: "me", text: message }];
    setTurns(next);
    setThinking(true);
    try {
      const messages: ChatTurn[] = next
        .filter((turn) => !turn.failed)
        .slice(-MAX_TURNS)
        .map((turn) => ({ role: turn.from === "me" ? "user" : "assistant", content: turn.text.slice(0, 4000) }));
      const result = await askPeggy(messages);
      setTurns((current) => [...current, { from: "peggy", text: result.reply }]);
      if (typeof result.creditsLeft === "number") setBalance(result.creditsLeft);
    } catch (error) {
      setTurns((current) => [...current, { from: "peggy", failed: true, text: error instanceof ApiError && (error.status === 404 || error.status === 501) ? t("peg.failed") : error instanceof Error ? error.message : t("peg.failed") }]);
    } finally {
      setThinking(false);
    }
  }

  useEffect(() => {
    if (!prompt || asked.current || intro.loading || missing) return;
    asked.current = true;
    void ask(prompt);
    // Once, when the screen is ready: `ask` changes every render.
  }, [prompt, intro.loading, missing]); // eslint-disable-line react-hooks/exhaustive-deps

  const header = (
    <>
      <Mascot who="peggy" size={40} label="" />
      <View style={{ flex: 1 }}>
        <T weight="extrabold" style={{ fontSize: 17 }} accessibilityRole="header">{t("peg.title")}</T>
        <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>{t(`peg.tagline.${who === "logistics_partner" ? "partner" : who}`)}</T>
      </View>
      {/* A free voice call with Peggy, in the app (hidden where calls can't run). */}
      <CallPeggyButton variant="icon" />
    </>
  );

  return (
    <ChatScreen
      header={header}
      backTo={homeFor(role)}
      scrollKey={turns.length + (thinking ? 0.5 : 0)}
      composer={
        missing ? undefined : (
          <Composer value={draft} onChange={setDraft} onSend={(text) => void ask(text)} busy={thinking} placeholder={t("peg.placeholder")} />
        )
      }
    >
      <CreditsLine balance={shownBalance} who="peggy" />

      {intro.loading && !intro.data ? <T style={{ color: colors.inkSoft }}>{t("peg.loading")}</T> : null}

      {missing ? <ErrorState message={t("peg.failed")} onRetry={() => void intro.reload()} /> : null}

      {!intro.loading && !missing ? (
        <>
          <Bubble mine={false}>{intro.data?.intro || t(`peg.hello.${who === "logistics_partner" ? "partner" : who}`)}</Bubble>
          {!turns.length ? (
            <View style={{ gap: 10 }}>
              {/* The voice-assistant opening: a big question, the round mic (a free call with Peggy, where calls
                  run), then the questions people ask most. */}
              <View style={{ alignItems: "center", gap: 18, paddingVertical: 12 }}>
                <T accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.6, textAlign: "center" }}>{t("peg.helpWith")}</T>
                <CallPeggyButton variant="mic" />
              </View>
              {suggestions.map((question) => (
                <Pressable
                  key={question}
                  accessibilityRole="button"
                  accessibilityLabel={t("peg.askThis", { question })}
                  onPress={() => void ask(question)}
                  style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 12, ...surfaceCard(20), opacity: pressed ? 0.8 : 1 })}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: TILE.peach.bg, alignItems: "center", justifyContent: "center" }}>
                    <AppIcon name="sparkle" size={16} color={TILE.peach.fg} />
                  </View>
                  <T weight="semibold" style={{ flex: 1, fontSize: 15, lineHeight: 20 }}>{question}</T>
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      ) : null}

      {turns.map((turn, index) => (
        <Bubble key={index} mine={turn.from === "me"}>
          {turn.failed ? <T style={{ fontSize: 15, lineHeight: 21, color: colors.inkSoft }}>{turn.text}</T> : turn.text}
        </Bubble>
      ))}
      {thinking ? <T accessibilityLiveRegion="polite" style={{ color: colors.inkSoft }}>{t("peg.thinking")}</T> : null}
    </ChatScreen>
  );
}
