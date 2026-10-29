import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ChipRow, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { Chip, Field, Label, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { deletePopup, fetchPopups, savePopup } from "@/lib/grow";
import { asksWhatsapp, headlineForOffer, POPUP_OFFERS, POPUP_WHEN, popupOffer, withOffer, withWhatsapp, withWhen, type PhonePopup } from "@/lib/grow-pure";
import { fetchSetup } from "@/lib/setup";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// One pop-up (canvas board M-PopupEdit; id "new" for a new one): a preview of it over the shop, what it collects
// (an email, or an email and a WhatsApp number: every sign-up needs an email, the server sends the code there), when
// it shows (after 5 seconds, when leaving, halfway down), the offer (no code, or 5 to 20% off with a code for each
// person) and the headline, then Put it live. The rest of the pop-up (its look, games, downloads, countdowns) stays as
// the web editor saved it; the phone sends the whole form back (lib/grow-pure.ts popupBody).

type Draft = Pick<PhonePopup, "name" | "type" | "isPopup" | "active" | "fields" | "design" | "config" | "signup">;

const WHEN_LABEL: Record<(typeof POPUP_WHEN)[number], "edit.when.delay" | "edit.when.exit" | "edit.when.scroll"> = { delay: "edit.when.delay", exit_intent: "edit.when.exit", scroll: "edit.when.scroll" };

export default function PopupEditor() {
  const t = useT("m_grow", "m_ui");
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  const data = useLoad(fetchPopups);
  const setup = useLoad(fetchSetup);
  const saved = !isNew ? data.data?.popups.find((popup) => popup.id === String(id)) : undefined;
  const start: Draft | undefined = isNew ? (data.data ? { ...data.data.blank, name: t("edit.defaultName") } : undefined) : saved;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // The form starts from the saved pop-up (or the blank one) once it arrives.
  if (start && !draft) setDraft(start);

  if (!draft) {
    return (
      <Screen title={t("edit.title")}>
        {data.error ? <ErrorState message={data.error} onRetry={() => void data.reload()} /> : data.data ? <Notice tone="info">{t("edit.gone")}</Notice> : <LoadingBlock />}
      </Screen>
    );
  }

  const whatsapp = asksWhatsapp(draft.fields);
  const offer = popupOffer(draft.config);
  const shopName = setup.data?.store?.name ?? "";
  const live = !isNew && saved?.active;

  async function save() {
    if (!draft) return;
    setBusy("save");
    setProblem(null);
    try {
      await savePopup({ ...draft, id: isNew ? null : String(id), active: true, design: { ...draft.design, headline: draft.design.headline.trim() || t("edit.headlinePlaceholder") } });
      router.replace("/marketing/popups" as never);
    } catch (saveError) {
      setProblem(saveError instanceof Error ? saveError.message : t("pop.notSaved"));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    setConfirmDelete(false);
    try {
      await deletePopup(String(id));
      router.replace("/marketing/popups" as never);
    } catch (deleteError) {
      setProblem(deleteError instanceof Error ? deleteError.message : t("pop.notSaved"));
      setBusy(null);
    }
  }

  return (
    <Screen
      title={t("edit.title")}
      footer={<PillButton testID="popup-save" title={live ? t("edit.save") : t("edit.putLive")} busy={busy === "save"} disabled={busy !== null} onPress={() => void save()} />}
    >
      {problem ? <Notice>{problem}</Notice> : null}

      {/* The pop-up over a dimmed sketch of the shop (board M-PopupEdit's stage). */}
      <View accessibilityLabel={t("edit.preview")} style={{ height: 250, borderRadius: 18, backgroundColor: colors.grayTint, overflow: "hidden", justifyContent: "center", alignItems: "center" }}>
        <View style={{ position: "absolute", left: 14, right: 14, top: 14, height: 26, borderRadius: 10, backgroundColor: "#E6E3EE" }} />
        <View style={{ position: "absolute", left: 14, right: 14, top: 50, height: 90, borderRadius: 10, backgroundColor: "#E6E3EE" }} />
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(22,20,31,0.35)" }} />
        <View testID="popup-preview" style={{ width: "78%", backgroundColor: colors.surface, borderRadius: 16, padding: 16, alignItems: "center", gap: 8 }}>
          {shopName ? <T weight="extrabold" style={{ fontSize: 10, letterSpacing: 0.6, color: colors.inkSoft }} numberOfLines={1}>{shopName.toUpperCase()}</T> : null}
          <T weight="extrabold" style={{ fontSize: 19, lineHeight: 22, textAlign: "center" }} numberOfLines={3}>{draft.design.headline || t("edit.headlinePlaceholder")}</T>
          {draft.signup ? (
            <View style={{ alignSelf: "stretch", height: 34, borderRadius: 10, borderWidth: 1.5, borderColor: colors.line, justifyContent: "center", paddingHorizontal: 10 }}>
              <T style={{ fontSize: 12, color: colors.inkSoft }} numberOfLines={1}>{whatsapp ? t("edit.field.both") : t("edit.field.email")}</T>
            </View>
          ) : null}
          <View style={{ alignSelf: "stretch", height: 34, borderRadius: 17, backgroundColor: colors.inkFill, alignItems: "center", justifyContent: "center" }}>
            <T weight="extrabold" style={{ fontSize: 12, color: "#FFFFFF" }} numberOfLines={1}>{String(draft.design.buttonText ?? "") || t("edit.button")}</T>
          </View>
        </View>
      </View>

      {draft.signup ? (
        <View style={{ gap: 8 }}>
          <Label>{t("edit.collect")}</Label>
          <ChipRow>
            <Chip label={t("edit.collect.email")} on={!whatsapp} onPress={() => setDraft({ ...draft, fields: withWhatsapp(draft.fields, false) })} />
            <Chip label={t("edit.collect.both")} on={whatsapp} onPress={() => setDraft({ ...draft, fields: withWhatsapp(draft.fields, true, t("edit.whatsappLabel")) })} />
          </ChipRow>
          <T style={{ fontSize: 13.5, lineHeight: 19, color: colors.inkSoft }}>{t("edit.emailNeeded")}</T>
        </View>
      ) : (
        <Notice tone="info">{t("edit.webKind")}</Notice>
      )}

      <View style={{ gap: 8 }}>
        <Label>{t("edit.when")}</Label>
        <ChipRow>
          {POPUP_WHEN.map((when) => <Chip key={when} label={t(WHEN_LABEL[when])} on={draft.config.trigger === when} onPress={() => setDraft({ ...draft, config: withWhen(draft.config, when) })} />)}
        </ChipRow>
      </View>

      {draft.signup ? (
        <View style={{ gap: 8 }}>
          <Label>{t("edit.offer")}</Label>
          {offer === null ? (
            <T style={{ fontSize: 14.5, lineHeight: 20, color: colors.inkSoft }}>{t("edit.offerWeb", { offer: saved?.rewardText ?? "" })}</T>
          ) : (
            <ChipRow>
              {POPUP_OFFERS.map((value) => <Chip key={value} label={value ? t("edit.percentOff", { value }) : t("edit.noCode")} on={offer === value} onPress={() => setDraft({ ...draft, config: withOffer(draft.config, value), design: { ...draft.design, headline: headlineForOffer(draft.design.headline, offer, value) } })} />)}
            </ChipRow>
          )}
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <Label>{t("edit.headline")}</Label>
        <Field testID="popup-headline" value={draft.design.headline} onChangeText={(headline) => setDraft({ ...draft, design: { ...draft.design, headline } })} placeholder={t("edit.headlinePlaceholder")} maxLength={120} />
      </View>

      {!isNew ? <LinkButton title={t("edit.delete")} color={colors.danger} onPress={() => setConfirmDelete(true)} /> : null}
      <Sheet visible={confirmDelete} onClose={() => setConfirmDelete(false)} title={t("edit.deleteTitle")}>
        <PillButton title={t("edit.deleteYes")} busy={busy === "delete"} style={{ backgroundColor: colors.dangerFill }} onPress={() => void remove()} />
        <LinkButton title={t("edit.keep")} onPress={() => setConfirmDelete(false)} />
      </Sheet>
    </Screen>
  );
}
