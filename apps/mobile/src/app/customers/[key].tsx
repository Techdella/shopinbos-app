import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Bubble } from "@/components/ChatScreen";
import { AppIcon } from "@/components/icons";
import { ErrorState, Initials, LoadingBlock, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { ChoiceRow, Sheet } from "@/components/Sheet";
import { Card, Field, LinkButton, Notice, PillButton, Segmented, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import {
  DETAIL_LABEL,
  callLink,
  composerState,
  fetchCustomer,
  firstChannel,
  messageBody,
  messageCustomer,
  money,
  seenCustomer,
  sendErrorKey,
  templatePreview,
  whatsappLink,
  type Channel,
  type ComposerState,
  type CustomerProfile,
  type ThreadMessage,
} from "@/lib/customers";
import { capitalise, friendlyDay, friendlyTime } from "@/lib/friendly";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// One customer (the web's customer drawer on /home/customers): how to reach them (Call and WhatsApp open the
// phone's own apps), what they have bought, every order (opens the order), and a message written here that goes
// out by email or on the shop's WhatsApp Business number, into their conversation in Chats. WhatsApp only allows
// free text within 24 hours of the customer's last message; after that it needs an approved template.

type Words = ReturnType<typeof useT<["m_customers", "customers", "orders", "emailBuilder", "m_ui", "common"]>>;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, minWidth: "45%", gap: 2 }}>
      <T style={{ color: colors.inkSoft, fontSize: 14 }}>{label}</T>
      <T weight="extrabold" style={{ fontSize: 18 }}>{value}</T>
    </View>
  );
}

function QuickButton({ label, icon, onPress, tint, color }: { label: string; icon: "phone" | "chat"; onPress: () => void; tint: string; color: string }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flex: 1, minHeight: 50, borderRadius: 999, backgroundColor: tint, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: pressed ? 0.8 : 1 })}>
      <AppIcon name={icon} size={20} color={color} />
      <T weight="extrabold" numberOfLines={1} style={{ flexShrink: 1, color, fontSize: 16 }}>{label}</T>
    </Pressable>
  );
}

/** Why this channel can't be used yet, in plain words, and the one thing that fixes it. */
function Blocked({ state, profile, t }: { state: Extract<ComposerState, { kind: "blocked" }>; profile: CustomerProfile; t: Words }) {
  const recommended = profile.emailChannel.recommended;
  const option = recommended?.option ?? "gmail";
  const domain = recommended?.domain ?? "";
  // Connecting email or WhatsApp and making WhatsApp templates aren't in the phone app: it says what's missing.
  const lines: Record<typeof state.reason, string> = {
    noEmail: t("chat.noEmail"),
    connectEmail: `${t("chat.connectFirst.title")}. ${option === "domain_auto" ? t("chat.connectFirst.domain_auto", { domain }) : option === "domain_dns" ? t("chat.connectFirst.domain_dns", { domain }) : t("chat.connectFirst.gmail")}`,
    emailNotReady: t("chat.emailNotReady"),
    noPhone: t("chat.wa.noPhone"),
    waNotConnected: t("chat.wa.notConnected"),
    waNoAccount: t("chat.wa.noAccount"),
    waNoTemplates: `${t("chat.wa.noTemplates")} ${t("wa.templateHow")}`,
  };
  return (
    <View style={{ backgroundColor: colors.canvas, borderRadius: 16, padding: 14, gap: 10 }}>
      <T style={{ fontSize: 15, lineHeight: 22 }}>{lines[state.reason]}</T>
    </View>
  );
}

function Thread({ messages, t }: { messages: ThreadMessage[]; t: Words }) {
  if (!messages.length) return <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("chat.none")}</T>;
  return (
    <View style={{ backgroundColor: colors.canvas, borderRadius: 16, padding: 10, gap: 8 }}>
      {messages.slice(-4).map((m) => {
        const status = m.direction !== "outbound" ? "" : m.status === "failed" ? t("msg.notSent") : m.status === "read" ? t("msg.read") : m.status === "delivered" ? t("msg.delivered") : m.status === "queued" ? t("msg.sending") : "";
        return (
          <Bubble key={m.id} mine={m.direction === "outbound"} failed={m.status === "failed"} meta={[friendlyTime(m.createdAt, new Date(), t), status].filter(Boolean).join(" · ")}>
            {m.body}
          </Bubble>
        );
      })}
    </View>
  );
}

function MessageBox({ profile, reload }: { profile: CustomerProfile; reload: () => Promise<void> }) {
  const t = useT("m_customers", "customers", "orders", "emailBuilder", "m_ui", "common");
  const [channel, setChannel] = useState<Channel>(() => firstChannel(profile));
  const [useTemplate, setUseTemplate] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templateId, setTemplateId] = useState(profile.whatsapp.templates[0]?.id ?? "");
  const [edits, setEdits] = useState<Record<string, string[]>>({});
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; conversationId?: string } | null>(null);

  const state = composerState(profile, channel, useTemplate);
  const templates = profile.whatsapp.templates;
  const template = templates.find((tpl) => tpl.id === templateId) ?? templates[0] ?? null;
  const values = template ? edits[template.id] ?? [] : [];
  const conversationId = channel === "email" ? profile.emailChannel.conversationId : profile.whatsapp.conversationId;
  const payload = messageBody(profile.key, state, { subject, body, template, edits: values });

  async function send() {
    if (!payload) return;
    setBusy(true);
    setResult(null);
    try {
      const sent = await messageCustomer(payload);
      setBody("");
      setSubject("");
      setResult({ ok: true, text: t("chat.sentHere"), conversationId: sent.conversationId });
    } catch (error) {
      const code = error instanceof ApiError ? error.code : undefined;
      const key = sendErrorKey(code);
      const reason = error instanceof Error ? error.message : "";
      setResult({ ok: false, text: key ? t.dynamic(key, reason, { reason }) : reason || t("chat.err.generic") });
    } finally {
      setBusy(false);
      await reload();
    }
  }

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <T weight="extrabold" style={{ flex: 1, fontSize: 17 }} accessibilityRole="header">{t("chat.title")}</T>
        {conversationId ? <LinkButton title={t("chat.openChats")} color={colors.forest} onPress={() => router.push({ pathname: "/inbox/[id]", params: { id: conversationId } })} /> : null}
      </View>
      <Segmented<Channel>
        value={channel}
        onChange={(next) => {
          setChannel(next);
          setResult(null);
        }}
        options={[
          { value: "email", label: t("chat.email") },
          { value: "whatsapp", label: t("chat.whatsapp") },
        ]}
      />

      <Thread messages={channel === "email" ? profile.emailChannel.messages : profile.whatsapp.messages} t={t} />

      {state.kind === "blocked" ? (
        <Blocked state={state} profile={profile} t={t} />
      ) : state.kind === "template" && template ? (
        <View style={{ gap: 10 }}>
          <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{profile.whatsapp.composer.mode === "free" ? t("wa.templateChosen") : t("chat.wa.templateOnly")}</T>
          <Pressable accessibilityRole="button" onPress={() => setPicking(true)} style={({ pressed }) => ({ borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 10, opacity: pressed ? 0.8 : 1 })}>
            <View style={{ flex: 1 }}>
              <T style={{ color: colors.inkSoft, fontSize: 13 }}>{t("chat.wa.pickTemplate")}</T>
              <T weight="bold" style={{ fontSize: 16 }} numberOfLines={1}>{template.name.replace(/_/g, " ")} ({template.language})</T>
            </View>
            {templates.length > 1 ? <T weight="bold" style={{ color: colors.forest }}>{t("wa.change")}</T> : null}
          </Pressable>
          {template.variables.length ? (
            <View style={{ gap: 8 }}>
              <T weight="bold">{t("chat.wa.fill")}</T>
              {template.variables.map((v, i) => (
                <View key={v.n} style={{ gap: 4 }}>
                  <T style={{ color: colors.inkSoft, fontSize: 14 }}>{v.key ? t.dynamic(`detail.${v.key}`, DETAIL_LABEL[v.key] ?? v.key) : `{{${v.n}}}`}</T>
                  <Field
                    value={values[i] ?? v.value}
                    maxLength={1000}
                    onChangeText={(text) => setEdits((all) => ({ ...all, [template.id]: template.variables.map((old, j) => (j === i ? text : all[template.id]?.[j] ?? old.value)) }))}
                    style={{ height: 48 }}
                  />
                </View>
              ))}
            </View>
          ) : null}
          <View style={{ backgroundColor: colors.mintTint, borderRadius: 16, padding: 14, gap: 4 }}>
            <T weight="bold" style={{ color: colors.inkSoft, fontSize: 13 }}>{t("chat.wa.preview")}</T>
            <T style={{ fontSize: 15, lineHeight: 21 }}>{templatePreview(template, values)}</T>
            {template.imageHeader ? <T style={{ color: colors.inkSoft, fontSize: 13 }}>{t("chat.wa.imageHeader")}</T> : null}
          </View>
          <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("chat.wa.sendsTo", { phone: profile.whatsapp.phone ?? "" })}</T>
          {profile.whatsapp.composer.mode === "free" ? <LinkButton title={t("chat.wa.writeFree")} color={colors.forest} style={{ alignSelf: "flex-start" }} onPress={() => setUseTemplate(false)} /> : null}
        </View>
      ) : state.kind === "write" ? (
        <View style={{ gap: 10 }}>
          {state.channel === "whatsapp" && state.closesAt ? <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20 }}>{t("chat.wa.free", { time: friendlyTime(state.closesAt, new Date(), t) })}</T> : null}
          {state.subject ? <Field value={subject} onChangeText={setSubject} maxLength={200} placeholder={t("chat.subjectPlaceholder")} accessibilityLabel={t("chat.subject")} style={{ height: 48 }} /> : null}
          <Field value={body} onChangeText={setBody} maxLength={4000} multiline placeholder={t("chat.placeholder")} accessibilityLabel={t("chat.placeholder")} style={{ height: 120, paddingTop: 14, textAlignVertical: "top" }} />
          {state.channel === "email" ? (
            <T style={{ color: colors.inkSoft, fontSize: 14 }}>{profile.emailChannel.from ? t("chat.emailFrom", { email: profile.emailChannel.address ?? "", from: profile.emailChannel.from }) : t("chat.emailToOnly", { email: profile.emailChannel.address ?? "" })}</T>
          ) : (
            <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("chat.wa.sendsTo", { phone: profile.whatsapp.phone ?? "" })}</T>
          )}
          {state.canUseTemplate ? <LinkButton title={t("chat.wa.useTemplate")} color={colors.forest} style={{ alignSelf: "flex-start" }} onPress={() => setUseTemplate(true)} /> : null}
        </View>
      ) : null}

      {state.kind !== "blocked" ? <PillButton title={t("chat.send")} size="md" busy={busy} disabled={!payload} onPress={() => void send()} /> : null}

      {result ? (
        <View style={{ gap: 6 }}>
          <Notice tone={result.ok ? "success" : "error"}>{result.text}</Notice>
          {result.ok && result.conversationId ? <LinkButton title={t("chat.openChats")} color={colors.forest} onPress={() => router.push({ pathname: "/inbox/[id]", params: { id: result.conversationId! } })} /> : null}
        </View>
      ) : null}

      <Sheet visible={picking} onClose={() => setPicking(false)} title={t("chat.wa.pickTemplate")}>
        {templates.map((tpl) => (
          <ChoiceRow
            key={tpl.id}
            icon={tpl.id === template?.id ? "check" : "doc"}
            title={`${tpl.name.replace(/_/g, " ")} (${tpl.language})`}
            sub={tpl.preview.slice(0, 90)}
            onPress={() => {
              setTemplateId(tpl.id);
              setPicking(false);
            }}
          />
        ))}
      </Sheet>
    </Card>
  );
}

export default function CustomerScreen() {
  const t = useT("m_customers", "customers", "orders", "emailBuilder", "m_ui", "common");
  const { key } = useLocalSearchParams<{ key: string }>();
  const customer = useLoad(() => fetchCustomer(String(key)), String(key));
  const profile = customer.data;
  const row = seenCustomer(String(key));
  const name = profile?.name || row?.name || t("drawer.label");
  const phone = profile?.phone ?? row?.phone ?? null;
  const call = callLink(phone);
  const whatsapp = whatsappLink(phone);
  const [now] = useState(() => new Date());

  return (
    <Screen title={name} sub={profile ? [profile.phone, profile.email].filter(Boolean).join(" · ") || undefined : undefined} refreshing={customer.refreshing} onRefresh={() => void customer.refresh()}>
      {call || whatsapp ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          {call ? <QuickButton label={t("call")} icon="phone" tint={colors.surface} color={colors.ink} onPress={() => void Linking.openURL(call)} /> : null}
          {whatsapp ? <QuickButton label={t("whatsapp")} icon="chat" tint={colors.mintTint} color={colors.forest} onPress={() => void Linking.openURL(whatsapp)} /> : null}
        </View>
      ) : null}

      {customer.loading && !profile ? <LoadingBlock /> : null}
      {customer.error && !profile ? <ErrorState message={customer.error} onRetry={() => void customer.reload()} /> : null}

      {profile ? (
        <>
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Initials name={profile.name} size={48} />
              <View style={{ flex: 1, gap: 2 }}>
                <T weight="extrabold" style={{ fontSize: 17 }} numberOfLines={1}>{profile.name}</T>
                {profile.place ? <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={1}>{profile.place}</T> : null}
              </View>
            </View>
            {profile.phone ? (
              <View style={{ gap: 2 }}>
                <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("contact.phone")}</T>
                <T weight="semibold" style={{ fontSize: 16 }} selectable>{profile.phone}</T>
              </View>
            ) : null}
            {profile.email ? (
              <View style={{ gap: 2 }}>
                <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("contact.email")}</T>
                <T weight="semibold" style={{ fontSize: 16 }} selectable>{profile.email}</T>
              </View>
            ) : null}
            {!profile.phone && !profile.email ? <T style={{ color: colors.inkSoft, fontSize: 15 }}>{t("contact.none")}</T> : null}
          </Card>

          <Card style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 14, columnGap: 10 }}>
            <Stat label={t("drawer.orders")} value={String(profile.stats.orders)} />
            <Stat label={t("drawer.spent")} value={money(profile.stats.spent, profile.currency)} />
            <Stat label={t("drawer.average")} value={profile.stats.paidOrders ? money(profile.stats.average, profile.currency) : "–"} />
            <Stat label={t("drawer.first")} value={capitalise(friendlyDay(profile.stats.firstAt, now, t))} />
          </Card>

          <MessageBox profile={profile} reload={customer.reload} />

          <SectionTitle>{t("drawer.ordersList")}</SectionTitle>
          <Card style={{ paddingVertical: 4 }}>
            {profile.orders.map((order, index) => (
              <Pressable
                key={order.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: "/order/[id]", params: { id: order.id } })}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.line, opacity: pressed ? 0.7 : 1 })}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <T weight="bold" style={{ fontSize: 16 }}>#{order.orderNumber}</T>
                  <T style={{ color: colors.inkSoft, fontSize: 14 }}>{capitalise(friendlyDay(order.createdAt, now, t))} · {t.dynamic(`status.${order.status}`, order.status)}</T>
                </View>
                <T weight="extrabold" style={{ fontSize: 16 }}>{money(order.total, order.currency)}</T>
                <AppIcon name="chevron" size={18} color={colors.inkSoft} />
              </Pressable>
            ))}
          </Card>
          {profile.stats.orders > profile.orders.length ? <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("drawer.ordersMore", { shown: profile.orders.length, total: profile.stats.orders })}</T> : null}
        </>
      ) : null}
    </Screen>
  );
}
