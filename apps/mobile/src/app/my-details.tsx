import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { IdentityImageKind } from "@shared/identity-images";
import { BUSINESS_LIMITS, businessChanges, businessForm, businessKind, type BusinessDetails, type BusinessField } from "@shared/my-details";
import { OTP_LENGTH, formatE164, toE164 } from "@shared/phone";
import { ErrorState, LoadingBlock, Picture, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, CodeInput, Field, Label, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { uploadIdentityImage } from "@/lib/identity";
import { confirmPhoneChange, fetchMyDetails, requestEmailChange, saveMyDetails, sendPhoneChangeCode, type MyDetails } from "@/lib/my-details";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// My details (every role: seller, supplier, delivery partner): the person's photo, name, email and phone, then the
// business's logo, name, phone, address, city and state. The same screen as the web's /home/details,
// /supplier/details and /logistics/details (GET / PATCH /api/app/me/details). Email changes through Supabase's
// confirmation link (/api/app/me/email) and the sign-in phone through a 6-digit code (/api/app/me/phone); the
// business phone is separate and saves with the rest.

type Note = { tone: "success" | "error" | "info"; text: string } | null;

const message = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

export default function MyDetailsScreen() {
  const t = useT("details");
  const loaded = useLoad(fetchMyDetails);
  if (!loaded.data) {
    return (
      <Screen title={t("title")} sub={t("sub")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
        {loaded.loading ? <LoadingBlock /> : null}
        {loaded.error ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}
      </Screen>
    );
  }
  return <DetailsForm initial={loaded.data} />;
}

function DetailsForm({ initial }: { initial: MyDetails }) {
  const t = useT("details", "common");
  const [saved, setSaved] = useState(initial);
  const [name, setName] = useState(initial.me.name);
  const [biz, setBiz] = useState<BusinessDetails>(businessForm(initial.business));
  const [avatarUrl, setAvatarUrl] = useState(initial.me.avatarUrl);
  const [logoUrl, setLogoUrl] = useState(initial.business?.logoUrl ?? null);
  const [uploading, setUploading] = useState<IdentityImageKind | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const kind = businessKind(saved.role);

  const changes = saved.canEditBusiness ? businessChanges(saved.business, biz) : {};
  const dirty = name.trim() !== saved.me.name || Object.keys(changes).length > 0;

  async function save() {
    if (name.trim().length < 2) return setNote({ tone: "error", text: t("needName") });
    if (changes.name !== undefined && changes.name.length < 2) return setNote({ tone: "error", text: t("needBusinessName") });
    setSaving(true);
    setNote(null);
    try {
      const next = await saveMyDetails({ ...(name.trim() !== saved.me.name ? { name: name.trim() } : {}), ...(Object.keys(changes).length ? { business: changes } : {}) });
      setSaved(next);
      setName(next.me.name);
      setBiz(businessForm(next.business));
      setNote({ tone: "success", text: t("saved") });
    } catch (error) {
      setNote({ tone: "error", text: message(error, t("saveFailed")) });
    } finally {
      setSaving(false);
    }
  }

  /** A square picture from the library, as the person's photo or the business logo (POST /api/app/me/images). */
  async function pickImage(which: IdentityImageKind) {
    setNote(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setNote({ tone: "info", text: t("allowPhotos") });
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (result.canceled || !result.assets.length) return;
    setUploading(which);
    try {
      const next = await uploadIdentityImage(which, result.assets[0]);
      setAvatarUrl(next.avatarUrl);
      setLogoUrl(next.logoUrl);
      setNote({ tone: "success", text: which === "logo" ? t("logoSaved") : t("photoSaved") });
    } catch (error) {
      setNote({ tone: "error", text: message(error, t("pictureFailed")) });
    } finally {
      setUploading(null);
    }
  }

  // Each box writes only its own field (the latest form, so quick typing in two boxes never loses a letter).
  const bizField = (field: BusinessField) => ({
    value: biz[field],
    maxLength: BUSINESS_LIMITS[field],
    editable: saved.canEditBusiness,
    onChangeText: (text: string) => setBiz((current) => ({ ...current, [field]: text })),
  });

  return (
    <Screen title={t("title")} sub={t("sub")} footer={dirty ? <PillButton title={t("save")} busy={saving} onPress={() => void save()} /> : undefined}>
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}

      <SectionTitle>{t("you")}</SectionTitle>
      <Card style={{ gap: 14 }}>
        <PictureRow uri={avatarUrl} name={name || saved.me.name} title={t("photo")} action={avatarUrl ? t("photoChange") : t("photoAdd")} busy={uploading === "avatar"} disabled={uploading !== null} onPress={() => void pickImage("avatar")} />
        <View>
          <Label>{t("name")}</Label>
          <Field value={name} onChangeText={setName} maxLength={120} autoComplete="name" accessibilityLabel={t("name")} />
        </View>
      </Card>

      <EmailCard details={saved} onPending={(pendingEmail) => setSaved((current) => ({ ...current, me: { ...current.me, pendingEmail } }))} />
      <PhoneCard details={saved} onChanged={(phone) => setSaved((current) => ({ ...current, me: { ...current.me, phone } }))} />

      {kind ? (
        <>
          <SectionTitle>{t(`biz.${kind}.title`)}</SectionTitle>
          {!saved.business ? <Notice tone="info">{t("noBusiness")}</Notice> : null}
          {saved.business && !saved.canEditBusiness ? <Notice tone="info">{t("staffNote")}</Notice> : null}
          {saved.business ? (
            <Card style={{ gap: 14 }}>
              {saved.canEditBusiness ? (
                <PictureRow square uri={logoUrl} name={biz.name || saved.business.name} title={t("logo")} action={logoUrl ? t("logoChange") : t("logoAdd")} busy={uploading === "logo"} disabled={uploading !== null} onPress={() => void pickImage("logo")} />
              ) : null}
              <View>
                <Label>{t(`biz.${kind}.name`)}</Label>
                <Field autoCapitalize="words" accessibilityLabel={t(`biz.${kind}.name`)} {...bizField("name")} />
              </View>
              <View>
                <Label>{t(`biz.${kind}.phone`)}</Label>
                <Field keyboardType="phone-pad" placeholder="0803 123 4567" accessibilityLabel={t(`biz.${kind}.phone`)} {...bizField("phone")} />
                <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 6 }}>{t("biz.phoneHint")}</T>
              </View>
              <View>
                <Label>{t(`biz.${kind}.address`)}</Label>
                <Field autoComplete="street-address" placeholder={t("biz.addressPlaceholder")} accessibilityLabel={t(`biz.${kind}.address`)} {...bizField("address")} />
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Label>{t("city")}</Label>
                  <Field placeholder="Ikeja" accessibilityLabel={t("city")} {...bizField("city")} />
                </View>
                <View style={{ flex: 1 }}>
                  <Label>{t("state")}</Label>
                  <Field placeholder="Lagos" accessibilityLabel={t("state")} {...bizField("state")} />
                </View>
              </View>
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function PictureRow({ uri, name, title, action, busy, disabled, onPress, square }: { uri: string | null; name: string; title: string; action: string; busy: boolean; disabled: boolean; onPress: () => void; square?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onPress} disabled={disabled}>
        <Picture uri={uri} name={name} size={64} shape={square ? "square" : "round"} />
      </Pressable>
      <View style={{ flex: 1, gap: 8 }}>
        <T weight="extrabold" style={{ fontSize: 16 }}>{title}</T>
        <PillButton title={action} tone="white" size="sm" busy={busy} disabled={disabled} onPress={onPress} />
      </View>
    </View>
  );
}

/** The current value in a grey box (email and phone change with a check, not by typing over them). */
function Current({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View>
      <Label>{label}</Label>
      <View style={{ minHeight: 52, borderRadius: radii.field, backgroundColor: colors.canvas, paddingHorizontal: 16, justifyContent: "center" }}>
        <T style={{ fontSize: 16 }} numberOfLines={1}>{value}</T>
      </View>
      <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 6 }}>{hint}</T>
    </View>
  );
}

function Buttons({ children }: { children: ReactNode }) {
  return <View style={{ gap: 10 }}>{children}</View>;
}

function EmailCard({ details, onPending }: { details: MyDetails; onPending: (email: string) => void }) {
  const t = useT("details", "common");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const current = details.me.email;

  async function send() {
    setBusy(true);
    setNote(null);
    try {
      const sent = await requestEmailChange(email.trim());
      onPending(sent.pendingEmail);
      setNote({ tone: "success", text: t(sent.currentToo ? "emailSent" : "emailSentOnly", { email: sent.pendingEmail }) });
      setOpen(false);
      setEmail("");
    } catch (error) {
      setNote({ tone: "error", text: message(error, t("emailFailed")) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 14 }}>
      <Current label={t("email")} value={current ?? t("emailNone")} hint={t("emailHint")} />
      {details.me.pendingEmail && !note ? <Notice tone="info">{t("emailPending", { email: details.me.pendingEmail })}</Notice> : null}
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      {open ? (
        <Buttons>
          <View>
            <Label>{t("emailNew")}</Label>
            <Field value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" maxLength={200} placeholder="you@example.com" accessibilityLabel={t("emailNew")} />
          </View>
          <PillButton title={t("emailSend")} size="md" busy={busy} disabled={!email.trim()} onPress={() => void send()} />
          <LinkButton title={t("cancel")} color={colors.inkSoft} onPress={() => setOpen(false)} />
        </Buttons>
      ) : (
        <PillButton title={current ? t("emailChange") : t("emailAdd")} tone="white" size="md" onPress={() => { setOpen(true); setNote(null); }} />
      )}
    </Card>
  );
}

function PhoneCard({ details, onChanged }: { details: MyDetails; onChanged: (phone: string) => void }) {
  const t = useT("details", "common");
  const [step, setStep] = useState<"idle" | "number" | "code">("idle");
  const [typed, setTyped] = useState("");
  const [sent, setSent] = useState<{ phone: string; challenge: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const current = details.me.phone;

  async function sendCode(via?: "sms") {
    // Nigerian numbers as people type them ("0803…"), or any number with its + code.
    const phone = sent && via ? sent.phone : toE164(typed);
    if (!phone) return setNote({ tone: "error", text: t("phoneInvalid") });
    setBusy(true);
    setNote(null);
    try {
      const result = await sendPhoneChangeCode(phone, via);
      setSent({ phone: result.phone, challenge: result.challenge });
      setCode("");
      setStep("code");
      setNote({ tone: "info", text: t(result.channel === "whatsapp" ? "phoneCodeWhatsApp" : "phoneCodeSms", { phone: formatE164(result.phone) }) });
    } catch (error) {
      setNote({ tone: "error", text: message(error, t("phoneFailed")) });
    } finally {
      setBusy(false);
    }
  }

  async function confirm(value = code) {
    if (!sent || value.length !== OTP_LENGTH || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const result = await confirmPhoneChange(sent.phone, sent.challenge, value);
      onChanged(result.phone);
      setStep("idle");
      setSent(null);
      setTyped("");
      setNote({ tone: "success", text: t("phoneSaved", { phone: formatE164(result.phone) }) });
    } catch (error) {
      setNote({ tone: "error", text: message(error, t("phoneFailed")) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 14 }}>
      <Current label={t("phone")} value={current ? formatE164(current) : t("phoneNone")} hint={t("phoneHint")} />
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      {step === "idle" ? <PillButton title={current ? t("phoneChange") : t("phoneAdd")} tone="white" size="md" onPress={() => { setStep("number"); setNote(null); }} /> : null}
      {step === "number" ? (
        <Buttons>
          <View>
            <Label>{t("phoneNew")}</Label>
            <Field value={typed} onChangeText={setTyped} keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" maxLength={20} placeholder="0803 123 4567" accessibilityLabel={t("phoneNew")} />
          </View>
          <PillButton title={t("phoneSend")} size="md" busy={busy} disabled={!typed.trim()} onPress={() => void sendCode()} />
          <LinkButton title={t("cancel")} color={colors.inkSoft} onPress={() => setStep("idle")} />
        </Buttons>
      ) : null}
      {step === "code" && sent ? (
        <Buttons>
          <Label>{t("phoneCode")}</Label>
          <CodeInput value={code} onChange={setCode} onComplete={(value) => void confirm(value)} />
          <PillButton title={t("phoneConfirm")} size="md" busy={busy} disabled={code.length !== OTP_LENGTH} onPress={() => void confirm()} />
          <LinkButton title={t("phoneSendSms")} color={colors.inkSoft} onPress={() => void sendCode("sms")} />
          <LinkButton title={t("cancel")} color={colors.inkSoft} onPress={() => { setStep("idle"); setSent(null); setNote(null); }} />
        </Buttons>
      ) : null}
    </Card>
  );
}
