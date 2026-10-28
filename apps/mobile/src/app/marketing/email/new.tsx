import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { EmailPreview } from "@/components/EmailPreview";
import { ChipRow } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { ChoiceRow, Sheet } from "@/components/Sheet";
import { Card, Chip, Field, Label, LinkButton, Mascot, Notice, PillButton, T } from "@/components/ui";
import { audienceCount, draftEmail, saveEmailDraft, sendEmail, type EmailDraft } from "@/lib/grow";
import { campaignName, EMAIL_AUDIENCES, lagosSlot, type EmailAudience } from "@/lib/grow-pure";
import { fetchSetup } from "@/lib/setup";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// New email, Rex writes it (canvas board M-EmailCreate): who it goes to (with how many people), what it's about in
// the seller's words, Rex's draft with the subject and a preview, "ask Rex to change it", then Send now (after a
// yes) or Schedule (tomorrow or in a few days, 9am Lagos time), or keep it as a draft. Rex writes with the web
// builder's writer (POST /api/mobile/marketing/email-draft); the email is saved and sent as an email campaign
// (lib/grow.ts sendEmail). The email's design is changed on the web.

const AUDIENCE_LABEL: Record<EmailAudience, "new.everyone" | "new.subscribers" | "new.repeat"> = { everyone: "new.everyone", subscribers: "new.subscribers", repeat: "new.repeat" };
const SLOTS = [
  { key: "tomorrow", days: 1, label: "new.slot.tomorrow" },
  { key: "in3", days: 3, label: "new.slot.in3" },
  { key: "week", days: 7, label: "new.slot.week" },
] as const;

export default function NewEmail() {
  const t = useT("m_grow", "m_ui");
  const params = useLocalSearchParams<{ about?: string }>();
  const setup = useLoad(fetchSetup);
  const [audience, setAudience] = useState<EmailAudience>("everyone");
  const [counts, setCounts] = useState<Partial<Record<EmailAudience, number>>>({});
  const [about, setAbout] = useState(typeof params.about === "string" ? params.about : "");
  const [change, setChange] = useState("");
  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState<"write" | "change" | "send" | "schedule" | "save" | null>(null);
  const [note, setNote] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  // How many people each choice reaches, asked once per choice.
  useEffect(() => {
    if (counts[audience] !== undefined) return;
    let live = true;
    audienceCount(audience)
      .then((result) => live && setCounts((now) => ({ ...now, [audience]: result.count })))
      .catch(() => null);
    return () => {
      live = false;
    };
  }, [audience, counts]);

  const count = counts[audience];
  const content = draft ? { subject: subject.trim() || draft.subject, preheader: draft.preheader, bodyHtml: draft.bodyHtml } : null;
  const shopName = setup.data?.store?.name ?? undefined;

  async function write(kind: "write" | "change") {
    setBusy(kind);
    setNote(null);
    try {
      const next = await draftEmail(kind === "write" ? about.trim() : change.trim(), kind === "change" ? content : null);
      setDraft(next);
      setSubject(next.subject);
      if (kind === "change") setChange("");
    } catch (writeError) {
      setNote({ tone: "error", text: writeError instanceof Error ? writeError.message : t("new.notWritten") });
    } finally {
      setBusy(null);
    }
  }

  async function finish(when: "now" | "save" | { at: string }) {
    if (!content) return;
    setBusy(when === "now" ? "send" : when === "save" ? "save" : "schedule");
    setConfirm(false);
    setScheduling(false);
    setNote(null);
    const name = campaignName(content.subject, t("new.title"));
    try {
      if (when === "save") await saveEmailDraft({ name, draft: content, audience });
      else await sendEmail({ name, draft: content, audience, when });
      router.replace("/marketing/email" as never);
    } catch (sendError) {
      setNote({ tone: "error", text: sendError instanceof Error ? sendError.message : t("new.notSent") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen
      title={t("new.title")}
      footer={
        content ? (
          <>
            <T style={{ textAlign: "center", fontSize: 14, color: colors.inkSoft }}>{count === undefined ? " " : t("new.goesTo", { count })}</T>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <PillButton testID="email-schedule" tone="white" size="md" title={t("new.schedule")} style={{ flex: 1 }} busy={busy === "schedule"} disabled={busy !== null} onPress={() => setScheduling(true)} />
              <PillButton testID="email-send" size="md" title={t("new.sendNow")} style={{ flex: 1 }} busy={busy === "send"} disabled={busy !== null || count === 0} onPress={() => setConfirm(true)} />
            </View>
          </>
        ) : null
      }
    >
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}

      <View style={{ gap: 8 }}>
        <Label>{t("new.sendTo")}</Label>
        <ChipRow>
          {(Object.keys(EMAIL_AUDIENCES) as EmailAudience[]).map((key) => <Chip key={key} label={t(AUDIENCE_LABEL[key])} on={audience === key} onPress={() => setAudience(key)} />)}
        </ChipRow>
      </View>

      <View style={{ gap: 8 }}>
        <Label>{t("new.about")}</Label>
        <Field testID="email-about" value={about} onChangeText={setAbout} placeholder={t("new.aboutPlaceholder")} multiline maxLength={1000} style={{ minHeight: 72, textAlignVertical: "top" }} />
        <PillButton testID="email-write" tone={draft ? "white" : "ink"} size="md" icon="sparkle" title={draft ? t("new.writeAgain") : t("new.write")} busy={busy === "write"} disabled={busy !== null || about.trim().length < 2} onPress={() => void write("write")} />
      </View>

      {draft && content ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
            <Mascot name="rex" size={32} label="" />
            <T style={{ flex: 1, fontSize: 14.5, lineHeight: 20, color: colors.inkSoft }}>{draft.note}</T>
          </View>
          <View style={{ gap: 8 }}>
            <Label>{t("new.subject")}</Label>
            <Field testID="email-subject" value={subject} onChangeText={setSubject} maxLength={200} />
          </View>
          <Card style={{ gap: 4 }}>
            <T weight="extrabold" style={{ fontSize: 16 }}>{content.subject}</T>
            <T style={{ fontSize: 13, color: colors.inkSoft }}>{t("new.from", { shop: shopName ?? t("new.yourShop") })}</T>
          </Card>
          <EmailPreview html={content.bodyHtml} shopName={shopName} />
          <View style={{ gap: 8 }}>
            <Label>{t("new.change")}</Label>
            <Field testID="email-change" value={change} onChangeText={setChange} placeholder={t("new.changePlaceholder")} maxLength={1000} />
            <PillButton tone="white" size="md" icon="sparkle" title={t("new.askRex")} busy={busy === "change"} disabled={busy !== null || change.trim().length < 2} onPress={() => void write("change")} />
          </View>
          <LinkButton title={t("new.saveDraft")} color={colors.inkSoft} onPress={() => void finish("save")} />
        </>
      ) : null}

      <Sheet visible={confirm} onClose={() => setConfirm(false)} title={t("new.confirmTitle", { count: count ?? 0 })}>
        <T style={{ fontSize: 15, lineHeight: 22, color: colors.inkSoft }}>{t("new.confirmBody")}</T>
        <PillButton testID="email-send-yes" title={t("new.confirmYes")} busy={busy === "send"} onPress={() => void finish("now")} style={{ marginTop: 14 }} />
        <LinkButton title={t("new.notYet")} onPress={() => setConfirm(false)} />
      </Sheet>

      <Sheet visible={scheduling} onClose={() => setScheduling(false)} title={t("new.when")}>
        {SLOTS.map((slot) => (
          <ChoiceRow key={slot.key} testID={`email-slot-${slot.key}`} icon="clock" title={t(slot.label)} sub={t("new.at9")} onPress={() => void finish({ at: lagosSlot(slot.days, 9) })} />
        ))}
      </Sheet>
    </Screen>
  );
}
