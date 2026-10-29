import { useState } from "react";
import { Alert, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Badge, ErrorState, LoadingBlock } from "@/components/kit";
import { ChoiceRow } from "@/components/Sheet";
import { Screen } from "@/components/Screen";
import { ButtonRow, Card, Field, Label, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { canPublish, draftLegalText, fetchLegalText, saveLegalText, type LegalText } from "@/lib/legal";
import { useLoad } from "@/lib/useLoad";
import { formatDate } from "@shared/i18n";
import { useLocale, useT } from "@/lib/i18n";
import { colors, themed } from "@/theme";

// One legal page (web /home/legal/[key]): read it, change its words in one big plain-text box (# for a heading,
// - for a list), let Peggy write a draft, and Save draft / Publish / Save changes / Unpublish with the web's rules
// (a name is needed, an empty page can't be published). Look, SEO and pages with videos or buttons stay on the web.

const STATUS = themed(() => ({
  published: { label: "status.published", bg: colors.successTint, fg: colors.success },
  draft: { label: "status.draft", bg: "#FDF0D5", fg: "#8A5A00" },
  empty: { label: "status.empty", bg: colors.canvas, fg: colors.inkSoft },
} as const));

type Note = { tone: "success" | "error" | "info"; text: string };

export default function LegalPage() {
  const t = useT("m_legal");
  const { key } = useLocalSearchParams<{ key: string }>();
  const page = useLoad(() => fetchLegalText(String(key)), String(key));
  if (!page.data) {
    return (
      <Screen title={t("name")} refreshing={page.refreshing} onRefresh={() => void page.refresh()}>
        {page.loading ? <LoadingBlock /> : null}
        {page.error ? <ErrorState message={page.error} onRetry={() => void page.reload()} /> : null}
        {!page.loading && !page.error ? <Notice>{t("gone")}</Notice> : null}
      </Screen>
    );
  }
  // The editor keeps its own copy, so coming back to the screen (which reloads) never wipes unsaved words.
  return <Editor key={page.data.key} initial={page.data} onSaved={page.setData} />;
}

function Editor({ initial, onSaved }: { initial: LegalText; onSaved: (page: LegalText) => void }) {
  const t = useT("m_legal", "common");
  const locale = useLocale();
  const [page, setPage] = useState(initial);
  const [title, setTitle] = useState(page.title);
  const [text, setText] = useState(page.text);
  const [asking, setAsking] = useState(false);
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState<"draft" | "publish" | "update" | "unpublish" | "peggy" | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const dirty = title.trim() !== page.title || text !== page.text;
  const empty = page.textEditable ? !canPublish(text) : page.status === "empty";
  const status = STATUS[page.published ? "published" : empty ? "empty" : "draft"];

  async function save(published: boolean, kind: "draft" | "publish" | "update" | "unpublish") {
    if (!title.trim()) return setNote({ tone: "error", text: t("addName") });
    if (published && empty) return setNote({ tone: "error", text: t("writeFirst") });
    setBusy(kind);
    setNote(null);
    try {
      const saved = await saveLegalText(page.key, { title: title.trim(), ...(page.textEditable && text !== page.text ? { text } : {}), published });
      // Show the words as they were stored (e.g. "* item" comes back as "- item").
      setPage(saved);
      setTitle(saved.title);
      setText(saved.text);
      onSaved(saved);
      setNote({ tone: "success", text: t(kind === "publish" ? "published" : kind === "update" ? "updated" : kind === "unpublish" ? "unpublished" : "savedDraft") });
    } catch (saveError) {
      setNote({ tone: "error", text: saveError instanceof Error ? saveError.message : t("saveFailed") });
    } finally {
      setBusy(null);
    }
  }

  async function write() {
    setBusy("peggy");
    setNote(null);
    try {
      const draft = await draftLegalText(page.key, { title: title.trim() || page.title, brief: brief.trim() });
      setText(draft.text);
      setAsking(false);
      setNote({ tone: "info", text: draft.source === "ai" ? t("drafted") : t("draftedTemplate") });
    } catch (draftError) {
      setNote({ tone: "error", text: draftError instanceof Error ? draftError.message : t("draftFailed") });
    } finally {
      setBusy(null);
    }
  }

  function askWrite() {
    if (!text.trim()) return void write();
    Alert.alert(t("replaceTitle"), t("replaceBody"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("replace"), style: "destructive", onPress: () => void write() },
    ]);
  }

  const working = busy !== null;
  const footer = (
    <ButtonRow labels={page.published ? [t("unpublish"), t("update")] : [t("saveDraft"), t("publish")]} primaryLast>
      {page.published ? (
        <>
          <PillButton title={t("unpublish")} tone="white" size="md" style={{ flex: 1 }} busy={busy === "unpublish"} disabled={working} onPress={() => void save(false, "unpublish")} />
          <PillButton title={t("update")} size="md" style={{ flex: 1 }} busy={busy === "update"} disabled={working || !dirty} onPress={() => void save(true, "update")} />
        </>
      ) : (
        <>
          <PillButton title={t("saveDraft")} tone="white" size="md" style={{ flex: 1 }} busy={busy === "draft"} disabled={working} onPress={() => void save(false, "draft")} />
          <PillButton title={t("publish")} size="md" style={{ flex: 1 }} busy={busy === "publish"} disabled={working || empty} onPress={() => void save(true, "publish")} />
        </>
      )}
    </ButtonRow>
  );

  return (
    <Screen title={title.trim() || page.title} footer={footer}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <Badge label={t(status.label)} bg={status.bg} fg={status.fg} />
        <T style={{ color: colors.inkSoft, fontSize: 14 }}>{page.updatedAt ? t("saved", { date: formatDate(page.updatedAt, locale) }) : t("notSaved")}</T>
      </View>
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      {dirty && !note ? <Notice tone="info">{t("unsaved")}</Notice> : null}

      <View>
        <Label>{t("name")}</Label>
        <Field value={title} onChangeText={setTitle} maxLength={120} />
      </View>

      {page.textEditable ? (
        <>
          {asking ? (
            <Card style={{ gap: 10 }}>
              <T weight="extrabold" style={{ fontSize: 16 }}>{t("write")}</T>
              <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("writeSub")}</T>
              <Label>{t("brief")}</Label>
              <Field value={brief} onChangeText={setBrief} maxLength={1000} multiline placeholder={t("briefPlaceholder")} style={{ height: 96, paddingTop: 14, textAlignVertical: "top" }} />
              <PillButton title={t("writeGo")} size="md" tone="accent" busy={busy === "peggy"} disabled={working} onPress={askWrite} />
              <LinkButton title={t("cancel")} color={colors.inkSoft} onPress={() => setAsking(false)} />
            </Card>
          ) : (
            <ChoiceRow icon="sparkle" tint={colors.peach} iconColor={colors.accentInk} title={t("write")} sub={t("writeSub")} onPress={() => setAsking(true)} />
          )}
          <View>
            <Label>{t("text")}</Label>
            <Field value={text} onChangeText={setText} multiline maxLength={200_000} placeholder={t("textPlaceholder")} style={{ minHeight: 420, height: undefined, paddingTop: 14, paddingBottom: 14, textAlignVertical: "top", lineHeight: 22 }} />
            <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20, marginTop: 6 }}>{t("textHint")}</T>
          </View>
        </>
      ) : (
        <>
          <Notice tone="info">{t("richOnly")}</Notice>
          <Card>
            <T selectable style={{ lineHeight: 22 }}>{page.text}</T>
          </Card>
        </>
      )}

      {page.published ? <LinkButton title={t("view")} color={colors.accentInk} onPress={() => void WebBrowser.openBrowserAsync(page.url)} /> : null}
    </Screen>
  );
}
