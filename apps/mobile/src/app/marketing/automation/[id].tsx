import { useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useFlowSwitch } from "@/components/FlowSwitch";
import { EmailPreview } from "@/components/EmailPreview";
import { Badge, ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { Card, Chip, Field, Label, LinkButton, Notice, PillButton, T, Toggle } from "@/components/ui";
import { friendlyDay } from "@/lib/friendly";
import { fetchAutomations, removeAutomation, updateAutomation } from "@/lib/marketing";
import { changeStep, editableField, flowPatch, stepGaps, waitMinutes, waitParts, type FlowStep } from "@/lib/marketing-pure";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// One automation (web /home/automations/:id): its switch, name, what starts it, the steps in order with their words
// to change (email subjects, SMS and WhatsApp text, notes to you), the waits, and what it did. Adding, moving or
// removing steps and the email designs stay on the web.

const UNITS = ["minutes", "hours", "days"] as const;

export default function Automation() {
  const t = useT("m_marketing", "automations", "m_ui");
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useLoad(fetchAutomations);
  const flow = data.data?.flows.find((row) => row.id === String(id));
  const flowSwitch = useFlowSwitch(data.reload);
  const [name, setName] = useState("");
  const [days, setDays] = useState("");
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [preview, setPreview] = useState<FlowStep | null>(null);
  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Fill the form once per automation (a reload after saving keeps what's on screen in step).
  const stamp = flow ? `${flow.id}:${JSON.stringify(flow.steps)}:${flow.name}:${flow.settings.days ?? ""}` : null;
  if (flow && stamp !== loadedFor) {
    setName(flow.name);
    setDays(String(flow.settings.days ?? 90));
    setSteps(flow.steps);
    setLoadedFor(stamp);
  }

  if (!flow) {
    return (
      <Screen title={t("metaOne")}>
        {data.error ? <ErrorState message={data.error} onRetry={() => void data.reload()} /> : data.data ? <Notice tone="info">{t("auto.gone")}</Notice> : <LoadingBlock />}
      </Screen>
    );
  }

  const channels = data.data!.channels;
  const changed = name.trim() !== flow.name || JSON.stringify(steps) !== JSON.stringify(flow.steps) || (flow.trigger === "win_back" && Number(days) !== (flow.settings.days ?? 90));
  const gaps = stepGaps(steps);

  async function save() {
    if (!flow) return;
    setNote(null);
    if (gaps.length) {
      const gap = gaps[0];
      setNote({ tone: "error", text: gap.reason === "smsLong" ? t("auto.gapSmsLong", { n: gap.index + 1 }) : t("auto.gapEmpty", { n: gap.index + 1 }) });
      return;
    }
    setSaving(true);
    try {
      await updateAutomation(flow.id, flowPatch(flow, { name, steps, days: Number(days) || undefined }));
      setNote({ tone: "success", text: t("auto.saved") });
      await data.reload();
    } catch (saveError) {
      setNote({ tone: "error", text: saveError instanceof Error ? saveError.message : t("auto.notSaved") });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!flow) return;
    setDeleting(true);
    try {
      await removeAutomation(flow.id);
      setAsking(false);
      router.back();
    } catch (deleteError) {
      setAsking(false);
      setNote({ tone: "error", text: deleteError instanceof Error ? deleteError.message : t("auto.notSaved") });
    } finally {
      setDeleting(false);
    }
  }

  const uses = (type: FlowStep["type"]) => steps.some((step) => step.type === type);

  return (
    <Screen
      title={flow.name}
      sub={t("when", { trigger: t.dynamic(`trigger.${flow.trigger}`, flow.trigger) })}
      refreshing={data.refreshing}
      onRefresh={() => void data.refresh()}
      footer={changed ? <PillButton title={t("auto.save")} busy={saving} onPress={() => void save()} /> : undefined}
    >
      {flowSwitch.note ? <Notice tone={flowSwitch.note.tone}>{flowSwitch.note.text}</Notice> : null}
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      {uses("send_sms") && !channels.sms ? <Notice tone="info">{t("smsSkipped")}</Notice> : null}
      {uses("send_whatsapp") && !channels.whatsapp ? <Notice tone="info">{t("waSkipped")}</Notice> : null}

      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <T weight="extrabold" style={{ flex: 1, fontSize: 16 }}>{t("fe.automationOn")}</T>
          <Toggle on={flow.active} label={t("toggle.label", { name: flow.name })} onChange={(next) => (changed && next ? setNote({ tone: "error", text: t("auto.saveFirst") }) : flowSwitch.toggle(flow, next))} />
        </View>
        <T style={{ fontSize: 14, lineHeight: 20 }}>
          {[`${flow.sent30d} ${t("sent30")}`, t("inFlowNow", { count: flow.inFlow }), t("auto.total", { count: flow.total }), flow.lastTriggeredAt ? t("lastStarted", { date: friendlyDay(flow.lastTriggeredAt, new Date(), t) }) : t("notStarted")].join(" · ")}
        </T>
      </Card>

      <Label>{t("fe.name")}</Label>
      <Field value={name} onChangeText={setName} maxLength={80} accessibilityLabel={t("fe.name")} />
      {flow.trigger === "win_back" ? (
        <>
          <Label>{t("fe.daysWithout")}</Label>
          <Field value={days} keyboardType="number-pad" onChangeText={(text) => setDays(text.replace(/\D/g, "").slice(0, 4))} accessibilityLabel={t("fe.daysWithout")} />
        </>
      ) : null}

      <SectionTitle>{t("fe.steps")}</SectionTitle>
      {steps.map((step, index) => {
        const field = editableField(step);
        const wait = step.type === "wait" ? waitParts(step.minutes) : null;
        return (
          <Card key={index} style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Badge label={t("log.stepN", { n: index + 1 })} />
              <T weight="extrabold" style={{ flex: 1, fontSize: 15 }}>{t.dynamic(`step.${step.type}`, step.type)}</T>
            </View>
            {step.type === "wait" && wait ? (
              <>
                <Field
                  value={String(wait.amount)}
                  keyboardType="number-pad"
                  accessibilityLabel={t("fe.howLong")}
                  onChangeText={(text) => setSteps((current) => changeStep(current, index, { minutes: waitMinutes(Number(text.replace(/\D/g, "")) || 1, wait.unit) }))}
                />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {UNITS.map((unit) => <Chip key={unit} label={unit === "days" ? t("fe.daysWord") : t(`fe.${unit}`)} on={wait.unit === unit} onPress={() => setSteps((current) => changeStep(current, index, { minutes: waitMinutes(wait.amount, unit) }))} />)}
                </View>
              </>
            ) : null}
            {step.type === "condition" ? <T style={{ color: colors.inkSoft, fontSize: 14.5 }}>{t.dynamic(`check.${step.check}`, step.check)}</T> : null}
            {step.type === "add_tag" ? <T style={{ color: colors.inkSoft, fontSize: 14.5 }}>{`${t("fe.tag")}: ${step.tag}`}</T> : null}
            {step.type === "give_discount" ? <T style={{ color: colors.inkSoft, fontSize: 14.5 }}>{t("auto.discount", { percent: step.percent, days: step.days })}</T> : null}
            {step.type === "send_email" ? (
              <>
                <Label>{t("fe.subject")}</Label>
                <Field value={step.subject} maxLength={200} onChangeText={(subject) => setSteps((current) => changeStep(current, index, { subject }))} placeholder={step.templateId ? t("auto.fromTemplate") : undefined} accessibilityLabel={t("fe.subject")} />
                {step.templateId && !step.bodyHtml.trim() ? (
                  <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("auto.usesTemplate")}</T>
                ) : (
                  <LinkButton title={t("auto.seeEmail")} style={{ alignSelf: "flex-start" }} onPress={() => setPreview(step)} />
                )}
              </>
            ) : null}
            {step.type === "send_whatsapp" && step.template ? <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("auto.waTemplate")}</T> : null}
            {field === "message" && step.type !== "send_email" && "message" in step ? (
              <>
                <Field
                  value={step.message}
                  multiline
                  maxLength={step.type === "notify_seller" ? 500 : 1000}
                  onChangeText={(message) => setSteps((current) => changeStep(current, index, { message }))}
                  accessibilityLabel={step.type === "notify_seller" ? t("fe.noteToYou") : t("auto.message")}
                  style={{ height: 120, paddingTop: 14, textAlignVertical: "top" }}
                />
                {step.type === "send_sms" ? <T style={{ color: step.message.length > 480 ? colors.danger : colors.inkSoft, fontSize: 13 }}>{t("auto.smsCount", { count: step.message.length })}</T> : null}
              </>
            ) : null}
          </Card>
        );
      })}
      <T style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19 }}>{t("auto.variables")}</T>
      <LinkButton title={t("auto.delete")} color={colors.danger} onPress={() => setAsking(true)} />

      <Sheet visible={preview !== null} onClose={() => setPreview(null)} title={preview?.type === "send_email" ? preview.subject || t("fe.noSubject") : t("fe.email")}>
        <ScrollView style={{ maxHeight: 460 }}>
          {preview?.type === "send_email" ? <EmailPreview html={preview.bodyHtml} /> : null}
        </ScrollView>
      </Sheet>

      <Sheet visible={asking} onClose={() => setAsking(false)} title={t("auto.deleteTitle")}>
        <T style={{ fontSize: 15, lineHeight: 22, color: colors.inkSoft }}>{t("fe.confirmDelete")}</T>
        <PillButton title={t("auto.deleteYes")} busy={deleting} onPress={() => void remove()} />
        <LinkButton title={t("auto.keep")} onPress={() => setAsking(false)} />
      </Sheet>
      {flowSwitch.sheet}
    </Screen>
  );
}
