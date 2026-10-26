import { useState } from "react";
import { View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { docTypesForRole, type VerificationDoc } from "@shared/verification-docs";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { TonePill } from "@/components/partner";
import { Screen } from "@/components/Screen";
import { Card, Notice, PillButton, T } from "@/components/ui";
import { apiBody } from "@/lib/api";
import { verificationStage, type Tone } from "@/lib/partner-pure";
import { useLoad } from "@/lib/useLoad";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Verification for suppliers and delivery partners: where the review is and which documents are in. Each document
// takes a photo from the phone (POST /api/<supplier|logistics>/verification/upload, the web page's own call); "Send
// for review" then sends them to the team (…/verification/submit).

// Labels are m_ui keys.
const DOC_STATUS: Record<string, { label: "verify.doc.approved" | "verify.doc.rejected" | "verify.doc.underReview" | "verify.doc.submitted" | "verify.doc.uploaded" | "verify.doc.draft"; tone: Tone }> = {
  approved: { label: "verify.doc.approved", tone: "success" },
  rejected: { label: "verify.doc.rejected", tone: "danger" },
  under_review: { label: "verify.doc.underReview", tone: "warning" },
  submitted: { label: "verify.doc.submitted", tone: "info" },
  uploaded: { label: "verify.doc.uploaded", tone: "info" },
  draft: { label: "verify.doc.draft", tone: "muted" },
};

export function VerificationScreen({ role, load }: { role: "supplier" | "logistics_partner"; load: () => Promise<{ status: string; docs: VerificationDoc[]; trustScore: number }> }) {
  const t = useT("m_ui");
  const data = useLoad(load);
  const base = role === "supplier" ? "/api/supplier/verification" : "/api/logistics/verification";
  const stage = data.data ? verificationStage(data.data.status) : null;
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const docs = data.data?.docs ?? [];
  const open = Boolean(data.data && data.data.status !== "verified");
  const locked = (doc: VerificationDoc | undefined) => Boolean(doc && ["submitted", "under_review", "approved"].includes(doc.status));
  const canSend = open && docs.some((doc) => doc.status === "uploaded" || doc.status === "draft");

  async function upload(docType: string) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setNote({ tone: "error", text: t("verify.photosOff") });
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    const type = asset.mimeType ?? "image/jpeg";
    const ext = type.split("/")[1] === "jpeg" ? "jpg" : (type.split("/")[1] ?? "jpg");
    const form = new FormData();
    form.append("docType", docType);
    form.append("file", { uri: asset.uri, name: asset.fileName ?? `${docType}.${ext}`, type } as unknown as Blob);
    setBusy(docType);
    setNote(null);
    try {
      const result = await apiBody<{ success?: boolean; error?: string }>(`${base}/upload`, { method: "POST", body: form });
      if (result.success === false) throw new Error(result.error || t("verify.uploadFailed"));
      await data.reload();
    } catch (error) {
      setNote({ tone: "error", text: error instanceof Error && error.message ? error.message : t("verify.uploadFailed") });
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    setBusy("send");
    setNote(null);
    try {
      const result = await apiBody<{ success?: boolean; error?: string }>(`${base}/submit`, { method: "POST", json: {} });
      if (result.success === false) throw new Error(result.error || t("verify.uploadFailed"));
      setNote({ tone: "success", text: t("verify.sentNote") });
      await data.reload();
    } catch (error) {
      setNote({ tone: "error", text: error instanceof Error && error.message ? error.message : t("verify.uploadFailed") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen
      title={t("verify.title")}
      sub={t("verify.sub")}
      refreshing={data.refreshing}
      onRefresh={() => void data.refresh()}
      footer={canSend ? <PillButton title={t("verify.send")} busy={busy === "send"} disabled={Boolean(busy)} onPress={() => void send()} /> : null}
    >
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      {data.loading && !data.data ? <LoadingBlock /> : null}
      {data.error && !data.data ? <ErrorState message={data.error} onRetry={() => void data.reload()} /> : null}
      {data.data && stage ? (
        <>
          <Card style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <AppIcon name="shield" color={colors.forest} />
              <T weight="extrabold" style={{ flex: 1, fontSize: 16 }}>{stage.label}</T>
              <TonePill tone="muted" label={t("verify.trust", { score: data.data.trustScore })} />
            </View>
            <T style={{ color: colors.inkSoft, lineHeight: 20 }}>{stage.hint}</T>
          </Card>
          <Card style={{ paddingVertical: 4 }}>
            {docTypesForRole(role).map((config, index) => {
              const doc = docs.find((item) => item.type === config.type);
              const status = doc ? DOC_STATUS[doc.status] ?? DOC_STATUS.uploaded : null;
              return (
                <View key={config.type} style={{ paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line, gap: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <T weight="bold" style={{ flex: 1 }}>{config.label}</T>
                    {status ? <TonePill tone={status.tone} label={t(status.label)} /> : <TonePill tone={config.required ? "accent" : "muted"} label={config.required ? t("verify.needed") : t("verify.optional")} />}
                  </View>
                  <T style={{ color: colors.inkSoft, fontSize: 14 }}>{doc?.status === "rejected" && doc.rejectionReason ? doc.rejectionReason : config.hint}</T>
                  {open && !locked(doc) ? (
                    <PillButton
                      title={doc ? t("verify.replace") : t("verify.addPhoto")}
                      size="sm"
                      tone="white"
                      busy={busy === config.type}
                      disabled={Boolean(busy)}
                      style={{ alignSelf: "flex-start", marginTop: 4 }}
                      onPress={() => void upload(config.type)}
                    />
                  ) : null}
                </View>
              );
            })}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
