import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { EmailPreview } from "@/components/EmailPreview";
import { ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { Card, Field, Label, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { copyTemplate, deleteTemplate, fetchTemplates, saveTemplate, sendTestTemplate } from "@/lib/marketing";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// One email template (web /home/marketing/templates/:id): what it says and shows, its name, subject and preview
// line to change, a test to the seller's own inbox, and delete. A ready-made one (id "new", ?from=<key>) is shown
// as it is, with "Copy and edit" to make it the shop's own. Changing the design (blocks, colours) is on the web.

export default function Template() {
  const t = useT("m_marketing", "emailBuilder", "m_ui");
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const data = useLoad(fetchTemplates);
  const starter = id === "new" ? data.data?.library.find((row) => row.key === from) : undefined;
  const saved = id !== "new" ? data.data?.saved.find((row) => row.id === id) : undefined;
  const template = saved ?? starter;
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [filled, setFilled] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | "copy" | "delete" | null>(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  // Fill the form when the template arrives (or changes after a save), while rendering rather than in an effect.
  const stamp = template ? `${template.id ?? template.key}:${template.name}:${template.subject}:${template.preheader ?? ""}` : null;
  if (template && stamp !== filled) {
    setName(template.name);
    setSubject(template.subject);
    setPreheader(template.preheader ?? "");
    setFilled(stamp);
  }

  if (!template) {
    return (
      <Screen title={t("tpl.metaOne")}>
        {data.error ? <ErrorState message={data.error} onRetry={() => void data.reload()} /> : data.data ? <Notice tone="info">{t("tpl.gone")}</Notice> : <LoadingBlock />}
      </Screen>
    );
  }

  const bodyHtml = template.bodyHtml ?? "";
  const changed = Boolean(saved) && (name.trim() !== template.name || subject.trim() !== template.subject || preheader.trim() !== (template.preheader ?? ""));

  async function run(kind: "save" | "test" | "copy" | "delete") {
    setBusy(kind);
    setNote(null);
    try {
      if (kind === "save" && saved?.id) {
        await saveTemplate({ id: saved.id, name: name.trim(), subject: subject.trim(), preheader: preheader.trim() || null, bodyHtml, category: saved.category ?? "general" });
        setNote({ tone: "success", text: t("tpl.saved") });
        await data.reload();
      } else if (kind === "test") {
        const sent = await sendTestTemplate({ subject: subject.trim() || template!.subject, preheader: preheader.trim() || null, bodyHtml });
        setNote({ tone: "success", text: t("tpl.testSent", { to: sent.to }) });
      } else if (kind === "copy" && starter?.key) {
        const copy = await copyTemplate(starter.key);
        await data.reload();
        router.replace({ pathname: "/marketing/template/[id]", params: { id: copy.id } });
      } else if (kind === "delete" && saved?.id) {
        await deleteTemplate(saved.id);
        setAsking(false);
        router.back();
      }
    } catch (runError) {
      setAsking(false);
      setNote({ tone: "error", text: runError instanceof Error ? runError.message : t("tpl.notDone") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen
      title={template.name}
      sub={saved ? t("tpl.yoursSub") : t("tpl.readyMadeSub")}
      refreshing={data.refreshing}
      onRefresh={() => void data.refresh()}
      footer={saved ? (changed ? <PillButton title={t("tpl.save")} busy={busy === "save"} disabled={!name.trim() || !subject.trim()} onPress={() => void run("save")} /> : undefined) : <PillButton title={t("tpl.copyEdit")} busy={busy === "copy"} onPress={() => void run("copy")} />}
    >
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}

      {saved ? (
        <>
          <Label>{t("tpl.name")}</Label>
          <Field value={name} onChangeText={setName} maxLength={120} placeholder={t("tpl.namePlaceholder")} accessibilityLabel={t("tpl.name")} />
          <Label>{t("tpl.subjectLine")}</Label>
          <Field value={subject} onChangeText={setSubject} maxLength={200} placeholder={t("tpl.subjectPlaceholder")} accessibilityLabel={t("tpl.subjectLine")} />
          <Label>{t("tpl.previewText")}</Label>
          <Field value={preheader} onChangeText={setPreheader} maxLength={200} placeholder={t("tpl.previewTextPlaceholder")} accessibilityLabel={t("tpl.previewText")} />
          <T style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19 }}>{t("tpl.previewTextHint")}</T>
        </>
      ) : (
        <Card style={{ gap: 4 }}>
          <T weight="bold" style={{ fontSize: 13, color: colors.inkSoft }}>{t("tpl.subjectLine")}</T>
          <T weight="extrabold" style={{ fontSize: 16 }}>{template.subject}</T>
          {template.preheader ? <T style={{ color: colors.inkSoft, fontSize: 14.5 }}>{template.preheader}</T> : null}
          {template.description ? <T style={{ fontSize: 14.5, lineHeight: 20, marginTop: 4 }}>{template.description}</T> : null}
        </Card>
      )}

      <SectionTitle>{t("tpl.looks")}</SectionTitle>
      <T style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19 }}>{t("tpl.sampleNote")}</T>
      <EmailPreview html={bodyHtml} />

      <PillButton title={t("tpl.sendTest")} tone="white" size="md" busy={busy === "test"} disabled={busy !== null || !bodyHtml.trim()} onPress={() => void run("test")} />
      <LinkButton title={t("tpl.designWeb")} color={colors.inkSoft} onPress={() => void openWeb(saved?.id ? `/home/marketing/templates/${encodeURIComponent(saved.id)}` : `/home/marketing/templates/new?from=${encodeURIComponent(starter?.key ?? "")}`)} />
      {saved ? <LinkButton title={t("tpl.delete")} color={colors.danger} onPress={() => setAsking(true)} /> : null}

      <Sheet visible={asking} onClose={() => setAsking(false)} title={t("tpl.deleteTitle")}>
        <T style={{ fontSize: 15, lineHeight: 22, color: colors.inkSoft }}>{t("tpl.confirmDelete", { name: template.name })}</T>
        <PillButton title={t("tpl.deleteYes")} busy={busy === "delete"} onPress={() => void run("delete")} />
        <LinkButton title={t("tpl.keep")} onPress={() => setAsking(false)} />
      </Sheet>
    </Screen>
  );
}
