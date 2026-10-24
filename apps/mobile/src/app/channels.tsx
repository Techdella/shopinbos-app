import { useEffect, useState } from "react";
import { Alert, AppState, Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { ChoiceRow } from "@/components/Sheet";
import { Screen } from "@/components/Screen";
import { Card, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { canDisconnect, canDisconnectEmail, emailCardState, gmailAvailable, GMAIL_CONNECT_PATH } from "@/lib/channels-pure";
import { connectChannel, disconnectChannel, disconnectEmail, fetchChannels, fetchEmailSetup, notifyWhenReady, retryChannel, type ChannelCard, type EmailSetupLite, type LivePlatform, type SoonPlatform } from "@/lib/channels";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Sell everywhere (web /channels): one card per platform with one button. Facebook & Instagram, TikTok and Google
// sign in through the web's own sign-in in an in-app browser that comes back here; WhatsApp sets up its catalog
// in one tap once the number is connected (connecting the number itself runs on the web). Platforms not set up on
// the server, and the ones we can't connect yet, say "Coming soon". Post & share stays on the web.

const MARK: Record<LivePlatform, { letter: string; bg: string }> = {
  whatsapp: { letter: "W", bg: colors.whatsapp },
  meta: { letter: "f", bg: "#1877F2" },
  tiktok: { letter: "T", bg: "#111111" },
  google: { letter: "G", bg: "#4285F4" },
};

type Note = { tone: "success" | "error"; text: string };

function Mark({ platform, faded }: { platform: LivePlatform; faded?: boolean }) {
  const mark = MARK[platform];
  return (
    <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: faded ? colors.lineStrong : mark.bg, alignItems: "center", justifyContent: "center" }}>
      <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 20 }}>{mark.letter}</T>
    </View>
  );
}

function PlatformCard({ card, onChanged, onNote }: { card: ChannelCard; onChanged: () => Promise<void>; onNote: (note: Note | null) => void }) {
  const t = useT("m_channels", "common");
  const [busy, setBusy] = useState<"connect" | "retry" | "disconnect" | null>(null);
  const { state, platform, name } = card;

  async function run(kind: "connect" | "retry" | "disconnect", work: () => Promise<void>) {
    setBusy(kind);
    onNote(null);
    try {
      await work();
    } catch (error) {
      onNote({ tone: "error", text: error instanceof ApiError || error instanceof Error ? error.message : t("openFailed") });
    } finally {
      setBusy(null);
      await onChanged();
    }
  }

  function askWhatsAppSignup() {
    Alert.alert(t("wa.title"), t("wa.body"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("wa.open"), onPress: () => void openWeb("/channels") },
    ]);
  }

  function connect() {
    if (platform === "whatsapp") {
      return run("connect", async () => {
        const result = await retryChannel("whatsapp");
        if (result.needsSignup) askWhatsAppSignup();
        else if (!result.ok) onNote({ tone: "error", text: t("card.waFailed") });
      });
    }
    return run("connect", async () => {
      const outcome = await connectChannel(platform);
      if (outcome === "connected") onNote({ tone: "success", text: t("connected", { name }) });
      else if (outcome === "problem") onNote({ tone: "error", text: t("problem", { name }) });
    });
  }

  function retry() {
    return run("retry", async () => {
      const result = await retryChannel(platform);
      if (result.needsSignup) askWhatsAppSignup();
      else if (!result.ok) onNote({ tone: "error", text: platform === "whatsapp" ? t("card.waFailed") : t("card.failed", { name }) });
    });
  }

  function disconnect() {
    Alert.alert(t("card.disconnect"), t("card.confirm", { name }), [
      { text: t("cancel"), style: "cancel" },
      { text: t("card.disconnect"), style: "destructive", onPress: () => void run("disconnect", async () => void (await disconnectChannel(platform))) },
    ]);
  }

  const working = busy !== null;
  const connectButton = (label: string) => <PillButton title={busy === "connect" ? t("card.connecting") : label} size="md" busy={busy === "connect"} disabled={working} onPress={() => void connect()} />;

  let body: React.ReactNode = null;
  switch (state.kind) {
    case "soon":
      body = <PillButton title={t("card.soon")} size="md" tone="white" disabled />;
      break;
    case "connect":
      body = connectButton(t("card.connect"));
      break;
    case "syncing":
      body = <T weight="bold" style={{ color: colors.inkSoft, fontSize: 15 }}>{t("card.syncing")}</T>;
      break;
    case "connected":
      body = (
        <T weight="bold" style={{ color: colors.success, fontSize: 15 }}>
          {t("card.connected")}
          {state.count !== null ? <T weight="semibold" style={{ color: colors.inkSoft, fontSize: 15 }}> · {t("card.showing", { count: state.count })}</T> : null}
        </T>
      );
      break;
    case "error":
      body = (
        <>
          <T style={{ color: colors.danger, fontSize: 15 }}>{t("card.failed", { name })}</T>
          <PillButton title={t("card.tryAgain")} size="md" busy={busy === "retry"} disabled={working} onPress={() => void retry()} />
        </>
      );
      break;
    case "reauth":
      body = (
        <>
          <T style={{ color: colors.danger, fontSize: 15 }}>{t("card.reauth", { name })}</T>
          {connectButton(t("card.connectAgain"))}
        </>
      );
      break;
    case "needs_account": {
      const which = platform === "whatsapp" ? "meta" : platform;
      body = (
        <>
          <T style={{ fontSize: 15 }}>{t(`card.needs.${which}`)}</T>
          {card.accountUrl ? <PillButton title={t(`card.create.${which}`)} size="sm" tone="white" onPress={() => void Linking.openURL(card.accountUrl!)} /> : null}
          <PillButton title={busy === "retry" ? t("card.connecting") : t("card.done")} size="md" busy={busy === "retry"} disabled={working} onPress={() => void retry()} />
        </>
      );
      break;
    }
  }

  return (
    <Card style={{ gap: 12, opacity: state.kind === "soon" ? 0.75 : 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Mark platform={platform} faded={state.kind === "soon"} />
        <View style={{ flex: 1 }}>
          <T weight="extrabold" style={{ fontSize: 17 }}>{name}</T>
          <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t(`p.${platform}`)}</T>
        </View>
      </View>
      {body}
      {canDisconnect(state) ? <LinkButton title={busy === "disconnect" ? t("card.syncing") : t("card.disconnect")} color={colors.inkSoft} onPress={() => (working ? undefined : disconnect())} style={{ alignSelf: "flex-start" }} /> : null}
    </Card>
  );
}

// Email in the Inbox (web Inbox → Email): customers get emails from the seller's Gmail or own domain, and their
// replies land in Chats. Gmail's sign-in runs on the web (Google sends the browser back to the web's email page,
// not the app), so the card checks again when the browser closes. Own-domain email (DNS records) is web only.
function EmailCard({ email, onNote }: { email: ReturnType<typeof useLoad<EmailSetupLite>>; onNote: (note: Note | null) => void }) {
  const t = useT("m_channels", "common");
  const [busy, setBusy] = useState<"gmail" | "disconnect" | null>(null);
  const view = email.data;
  const state = view ? emailCardState(view) : null;

  async function connectGmail() {
    setBusy("gmail");
    onNote(null);
    try {
      await openWeb(GMAIL_CONNECT_PATH);
    } catch {
      onNote({ tone: "error", text: t("openFailed") });
    } finally {
      await email.reload();
      setBusy(null);
    }
  }

  function disconnect() {
    Alert.alert(t("card.disconnect"), t("email.confirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("card.disconnect"),
        style: "destructive",
        onPress: async () => {
          setBusy("disconnect");
          onNote(null);
          try {
            email.setData(await disconnectEmail());
            onNote({ tone: "success", text: t("email.disconnected") });
          } catch (error) {
            onNote({ tone: "error", text: error instanceof Error ? error.message : t("openFailed") });
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  }

  const working = busy !== null;
  const usingGmail = state && (state.kind === "connected" || state.kind === "attention") && state.provider === "gmail";

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }}>
          <AppIcon name="mail" size={22} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <T weight="extrabold" style={{ fontSize: 17 }}>{t("email.name")}</T>
          <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("email.sub")}</T>
        </View>
      </View>

      {email.loading && !view ? <LoadingBlock /> : null}
      {email.error && !view ? <ErrorState message={email.error} onRetry={() => void email.reload()} /> : null}

      {state?.kind === "connected" ? (
        <T weight="bold" style={{ color: colors.success, fontSize: 15 }}>
          {t("card.connected")}
          {state.address ? <T weight="semibold" style={{ color: colors.inkSoft, fontSize: 15 }}> · {state.address}</T> : null}
        </T>
      ) : null}
      {state?.kind === "attention" ? (
        <T style={{ color: colors.danger, fontSize: 15 }}>{state.provider === "gmail" ? t("email.gmailExpired") : t("email.attention")}</T>
      ) : null}
      {state?.kind === "domainWaiting" ? <T style={{ fontSize: 15 }}>{t("email.domainWaiting", { domain: state.domain })}</T> : null}
      {state?.kind === "off" ? <T style={{ fontSize: 15, color: colors.inkSoft }}>{t("email.off")}</T> : null}

      {view && state && (state.kind !== "connected" || state.provider !== "gmail") ? (
        gmailAvailable(view) ? (
          <>
            <PillButton
              title={busy === "gmail" ? t("card.connecting") : usingGmail || view.gmail ? t("email.gmailAgain") : t("email.gmail")}
              size="md"
              busy={busy === "gmail"}
              disabled={working}
              onPress={() => void connectGmail()}
            />
            <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("email.gmailHint")}</T>
          </>
        ) : (
          <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("email.gmailNotReady")}</T>
        )
      ) : null}

      {state && canDisconnectEmail(state) ? (
        <LinkButton title={busy === "disconnect" ? t("card.syncing") : t("card.disconnect")} color={colors.inkSoft} onPress={() => (working ? undefined : disconnect())} style={{ alignSelf: "flex-start" }} />
      ) : null}
    </Card>
  );
}

function SoonRow({ item, onNoted, onNote }: { item: SoonPlatform; onNoted: () => void; onNote: (note: Note | null) => void }) {
  const t = useT("m_channels");
  const [busy, setBusy] = useState(false);
  async function notify() {
    setBusy(true);
    onNote(null);
    try {
      await notifyWhenReady(item.platform);
      onNoted();
    } catch (error) {
      onNote({ tone: "error", text: error instanceof Error ? error.message : t("openFailed") });
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, paddingVertical: 6 }}>
      <T weight="extrabold" style={{ flex: 1, fontSize: 15, color: colors.inkSoft }}>{item.name}</T>
      {item.noted ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 }}>
          <AppIcon name="check" size={16} color={colors.success} />
          <T weight="bold" style={{ color: colors.success, fontSize: 14 }}>{t("soon.noted")}</T>
        </View>
      ) : (
        <PillButton title={t("soon.notify")} size="sm" tone="white" busy={busy} onPress={() => void notify()} />
      )}
    </View>
  );
}

export default function Channels() {
  const t = useT("m_channels");
  const params = useLocalSearchParams<{ connected?: string; problem?: string }>();
  const data = useLoad(fetchChannels);
  const email = useLoad(fetchEmailSetup);
  const [note, setNote] = useState<Note | null>(null);
  const overview = data.data;

  // Back from the browser (Gmail's sign-in ends on the web): check the Email card again.
  const reloadEmail = email.reload;
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void reloadEmail();
    });
    return () => sub.remove();
  }, [reloadEmail]);

  // Opened from the sign-in's return link (shopinbos://channels?connected=meta) outside the in-app browser.
  const nameOf = (platform?: string) => overview?.cards.find((card) => card.platform === platform)?.name ?? platform;
  const returned = params.connected ? { tone: "success" as const, text: t("connected", { name: nameOf(params.connected) ?? "" }) } : params.problem ? { tone: "error" as const, text: t("problem", { name: nameOf(params.problem) ?? "" }) } : null;
  const [showReturned, setShowReturned] = useState(true);
  const showNote = (next: Note | null) => {
    setShowReturned(false);
    setNote(next);
  };

  function markNoted(platform: string) {
    if (!overview) return;
    data.setData({ ...overview, soon: overview.soon.map((item) => (item.platform === platform ? { ...item, noted: true } : item)) });
  }

  return (
    <Screen title={t("title")} sub={t("sub")} refreshing={data.refreshing} onRefresh={() => void Promise.all([data.refresh(), email.refresh()])}>
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : showReturned && returned ? <Notice tone={returned.tone}>{returned.text}</Notice> : null}
      {data.loading && !overview ? <LoadingBlock /> : null}
      {data.error && !overview ? <ErrorState message={data.error} onRetry={() => void data.reload()} /> : null}
      {overview ? (
        <>
          {!overview.saved ? <Notice tone="info">{t("cantSave")}</Notice> : null}
          {overview.cards.map((card) => <PlatformCard key={card.platform} card={card} onChanged={data.reload} onNote={showNote} />)}
          {overview.listed !== null ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
              <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("ready", { count: overview.listed })}</T>
              {overview.skipped > 0 ? <LinkButton title={t("fix", { count: overview.skipped })} color={colors.accentInk} onPress={() => router.push("/products")} /> : null}
            </View>
          ) : null}

          <SectionTitle>{t("email.title")}</SectionTitle>
          <EmailCard email={email} onNote={showNote} />

          <ChoiceRow icon="megaphone" tint={colors.mintTint} iconColor={colors.forest} title={t("post.title")} sub={t("post.sub")} onPress={() => void openWeb("/channels?tab=post")} />

          <SectionTitle>{t("soon.title")}</SectionTitle>
          <Card style={{ paddingVertical: 6 }}>
            {overview.soon.map((item) => <SoonRow key={item.platform} item={item} onNoted={() => markNoted(item.platform)} onNote={showNote} />)}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
