import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon } from "@/components/icons";
import { Mascot, PillButton, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { shareOnWhatsApp } from "@/lib/share";
import {
  askRexToEdit,
  changeLabelKey,
  changeTone,
  findPage,
  kindLabelKey,
  shownHost,
  summariseChanges,
  type ChangeItem,
  type EdSection,
  type EdSnapshot,
  type RexEdit,
} from "@/lib/store-editor";
import { TILE, type TileTone } from "@/components/design";
import { colors, fonts, radii } from "@/theme";
import { BigTitle, Chip, ChipRow, EditorSheet, TopIcon } from "./parts";
import type { SheetContext } from "./sheets";
import { StorePreview } from "./StorePreview";

// ─── Ask Rex (SE-11) ─────────────────────────────────────────────────────────

export function RexSheet({
  ctx,
  section,
  initial,
  onChanged,
  onKeep,
  onUndoAll,
  onClose,
}: {
  ctx: SheetContext;
  section: EdSection | null;
  initial?: string;
  /** Rex changed the draft (`before` is the draft he started from): the canvas marks what changed. */
  onChanged: (result: RexEdit, before: EdSnapshot) => void;
  onKeep: () => void;
  onUndoAll: () => void;
  onClose: () => void;
}) {
  const t = useT("storeEditor");
  const [message, setMessage] = useState(initial ?? "");
  const [asked, setAsked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RexEdit | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const suggestions = [t("rex.suggest1"), t("rex.suggest2"), t("rex.suggest3")];

  async function send(text = message) {
    const clean = text.trim();
    if (!clean || busy) return;
    setBusy(true);
    setProblem(null);
    setAsked(clean);
    setMessage("");
    setResult(null);
    try {
      // Rex works on exactly what's on screen: the last change is saved first.
      await ctx.ed.flush();
      const page = findPage(ctx.ed.snapshot, ctx.page);
      const edit = await askRexToEdit({ message: clean, section: section ? ctx.label(section) : undefined, page: page?.title, baseVersion: ctx.ed.version() });
      setResult(edit);
      if (edit.draft) {
        const before = ctx.ed.snapshot;
        ctx.ed.adoptSaved(edit.draft, edit.version, true);
        onChanged(edit, before);
      }
    } catch (error) {
      setProblem(error instanceof ApiError && error.status === 409 ? t("conflict.title") : error instanceof Error ? error.message : t("rex.failed"));
    } finally {
      setBusy(false);
    }
  }

  const changed = Boolean(result?.draft && result.changes.length);
  return (
    <EditorSheet testID="editor-rex-sheet" title={t("rex.title")} onClose={changed ? onKeep : onClose} right={changed ? null : undefined}>
      {asked ? (
        <View style={{ alignItems: "flex-end" }}>
          <View style={{ maxWidth: "82%", backgroundColor: colors.inkFill, borderRadius: 16, borderBottomRightRadius: 4, paddingVertical: 9, paddingHorizontal: 12 }}>
            <T style={{ fontSize: 13.5, color: "#FFFFFF" }}>{asked}</T>
          </View>
        </View>
      ) : null}
      {busy || result || problem ? (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, overflow: "hidden", borderWidth: 2, borderColor: colors.forest }}>
            <Mascot name="rex" size={30} label="" />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            {busy ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ActivityIndicator color={colors.accent} />
                <T style={{ fontSize: 13.5, color: colors.inkSoft }}>{t("rex.working")}</T>
              </View>
            ) : null}
            {problem ? <T style={{ fontSize: 13.5, color: colors.danger }}>{problem}</T> : null}
            {result ? (
              changed ? (
                <>
                  <T weight="bold" style={{ fontSize: 13.5 }}>{t("rex.done", { count: result.changes.length })}</T>
                  {result.changes.map((line) => (
                    <View key={line} style={{ flexDirection: "row", gap: 6 }}>
                      <AppIcon name="check" size={15} color={colors.success} strokeWidth={2.6} />
                      <T style={{ flex: 1, fontSize: 13.5, lineHeight: 19, color: colors.inkSoft }}>{line}</T>
                    </View>
                  ))}
                </>
              ) : (
                <T style={{ fontSize: 13.5, lineHeight: 19 }}>{result.reply || t("rex.nothing")}</T>
              )
            ) : null}
          </View>
        </View>
      ) : (
        <ChipRow>
          {suggestions.map((entry) => <Chip key={entry} label={entry} on={false} onPress={() => void send(entry)} />)}
        </ChipRow>
      )}
      {changed ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <PillButton testID="rex-keep" title={t("rex.keep")} size="sm" style={{ flex: 1 }} onPress={onKeep} />
          <PillButton testID="rex-undo" title={t("rex.undoAll")} tone="white" size="sm" style={{ flex: 1 }} onPress={onUndoAll} />
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radii.pill, paddingVertical: 6, paddingRight: 6, paddingLeft: 16, borderWidth: 1.5, borderColor: colors.line }}>
        <TextInput
          testID="rex-input"
          value={message}
          onChangeText={setMessage}
          placeholder={t("rex.placeholder")}
          placeholderTextColor={colors.inkFaint}
          accessibilityLabel={t("rex.placeholder")}
          editable={!busy}
          returnKeyType="send"
          onSubmitEditing={() => void send()}
          maxLength={1000}
          style={{ flex: 1, fontFamily: fonts.regular, fontSize: 14.5, color: colors.ink, paddingVertical: 8 }}
        />
        <Pressable testID="rex-send" accessibilityRole="button" accessibilityLabel={t("rex.send")} disabled={busy || !message.trim()} onPress={() => void send()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", opacity: busy || !message.trim() ? 0.5 : 1 }}>
          <AppIcon name="send" size={17} color={colors.onAccent} strokeWidth={2.2} />
        </Pressable>
      </View>
    </EditorSheet>
  );
}

// ─── Publish: see what changed, then one tap (SE-13) ─────────────────────────

export function useChangeWords() {
  const t = useT("storeEditor");
  return (change: ChangeItem) => {
    const kindKey = change.sectionKind ? kindLabelKey(change.sectionKind) : null;
    const name = change.sectionKind ? (kindKey ? t.dynamic(kindKey, change.sectionName ?? "") : change.sectionName ?? "") : change.pageTitle;
    const presetName = change.preset ? t.dynamic(`theme.${change.preset}`, change.preset) : "";
    const words = t.dynamic(changeLabelKey(change.kind, change.preset), change.kind, { name: change.kind === "theme" ? presetName : name });
    const onPage = ["added", "removed", "moved", "pageAdded", "pageRemoved"].includes(change.kind);
    const where = change.kind === "theme" ? t("publish.everywhere") : onPage ? change.pageTitle : name;
    return { words, where };
  };
}

export function PublishSheet({ ctx, onPublished, onClose }: { ctx: SheetContext; onPublished: (url: string | null) => void; onClose: () => void }) {
  const t = useT("storeEditor");
  const words = useChangeWords();
  const changes = useMemo(() => summariseChanges(ctx.ed.published, ctx.ed.snapshot), [ctx.ed.published, ctx.ed.snapshot]);
  const first = !ctx.ed.published;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const nothing = !first && changes.length === 0;

  async function publish() {
    setBusy(true);
    setProblem(null);
    try {
      const result = await ctx.ed.publish();
      onPublished(result.url);
    } catch (error) {
      setProblem(error instanceof ApiError && error.status === 409 ? t("conflict.body") : error instanceof ApiError && error.status === 0 ? t("publish.offline") : error instanceof Error ? error.message : t("publish.failed"));
    } finally {
      setBusy(false);
    }
  }

  const saved = ctx.ed.status !== "saving" && ctx.ed.status !== "offline" && ctx.ed.status !== "conflict";
  return (
    <EditorSheet
      testID="editor-publish-sheet"
      title={first ? t("publish.firstTitle") : t("publish.title", { count: changes.length })}
      dim
      onClose={onClose}
      right={saved ? <View style={{ borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.mintTint }}><T weight="bold" style={{ fontSize: 12, color: colors.forest }}>{t("publish.saved")}</T></View> : null}
    >
      {first ? <T style={{ fontSize: 14, lineHeight: 20, color: colors.inkSoft }}>{t("publish.first")}</T> : null}
      {nothing ? <T style={{ fontSize: 14, lineHeight: 20, color: colors.inkSoft }}>{t("publish.nothing")}</T> : null}
      <View>
        {changes.slice(0, 12).map((change, index) => {
          const tone = changeTone(change.kind);
          const tile = TILE[tone.tone === "gray" ? "gray" : (tone.tone as TileTone)];
          const { words: line, where } = words(change);
          return (
            <View key={`${change.kind}-${change.page}-${change.sectionName ?? ""}-${index}`} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line }}>
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: tile.bg, alignItems: "center", justifyContent: "center" }}>
                <AppIcon name={tone.icon} size={17} color={tile.fg} strokeWidth={2} />
              </View>
              <T weight="semibold" numberOfLines={2} style={{ flex: 1, fontSize: 14 }}>{line}</T>
              <T numberOfLines={1} style={{ fontSize: 12, color: colors.inkSoft, maxWidth: "35%" }}>{where}</T>
            </View>
          );
        })}
        {changes.length > 12 ? <T style={{ fontSize: 13, color: colors.inkSoft, paddingVertical: 6 }}>{t("publish.more", { count: changes.length - 12 })}</T> : null}
      </View>
      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        <AppIcon name="clock" size={18} color={colors.inkSoft} />
        <T style={{ flex: 1, fontSize: 13, color: colors.inkSoft }}>{t("publish.note")}</T>
      </View>
      {problem ? <T style={{ fontSize: 14, color: colors.danger }}>{problem}</T> : null}
      <PillButton testID="publish-now" title={busy ? t("publish.publishing") : t("publish.now")} icon="check" tone="accent" busy={busy} disabled={nothing} onPress={() => void publish()} />
    </EditorSheet>
  );
}

// ─── Live in seconds (SE-14) ─────────────────────────────────────────────────

export function LiveScreen({ url, onClose, onKeepEditing }: { url: string | null; onClose: () => void; onKeepEditing: () => void }) {
  const t = useT("storeEditor");
  const insets = useSafeAreaInsets();
  const [stamp] = useState(() => Date.now().toString(36));
  const host = shownHost(url);
  return (
    <View testID="editor-live" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 60, backgroundColor: colors.canvas, paddingTop: insets.top + 12, paddingHorizontal: 18, paddingBottom: Math.max(insets.bottom, 16) + 16, gap: 16 }}>
      <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
        <TopIcon icon="x" label={t("close")} onPress={onClose} testID="live-close" />
      </View>
      <View style={{ alignItems: "center", gap: 12 }}>
        <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: colors.successTint, alignItems: "center", justifyContent: "center" }}>
          <AppIcon name="check" size={34} color={colors.success} strokeWidth={2.6} />
        </View>
        <BigTitle>{t("live.title")}</BigTitle>
        {host ? (
          <T style={{ fontSize: 14.5, lineHeight: 22, color: colors.inkSoft, textAlign: "center" }}>{t("live.body", { host })}</T>
        ) : null}
      </View>
      {url ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 22, padding: 12, flexShrink: 1 }}>
          <StorePreview url={`${url}${url.includes("?") ? "&" : "?"}v=${stamp}`} accessibilityLabel={t("entry.preview")} style={{ height: 300, borderRadius: 16 }} />
        </View>
      ) : null}
      <View style={{ marginTop: "auto", gap: 10 }}>
        {url ? <PillButton testID="live-status" title={t("live.status")} icon="whatsapp" tone="accent" onPress={() => void shareOnWhatsApp(t("live.shareMessage", { url }))} /> : null}
        <PillButton testID="live-keep" title={t("live.keep")} tone="white" onPress={onKeepEditing} />
      </View>
    </View>
  );
}
