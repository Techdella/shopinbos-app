import { View } from "react-native";
import { docTypesForRole, type VerificationDoc } from "@shared/verification-docs";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { TonePill } from "@/components/partner";
import { Screen } from "@/components/Screen";
import { Card, PillButton, T } from "@/components/ui";
import { verificationStage, type Tone } from "@/lib/partner-pure";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Verification status for suppliers and delivery partners: where the review is and which documents are in.
// Uploading documents (PDFs, scans) happens on the web verification page.

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
  const webPath = role === "supplier" ? "/supplier/verification" : "/logistics/verification";
  const stage = data.data ? verificationStage(data.data.status) : null;

  return (
    <Screen
      title={t("verify.title")}
      sub={t("verify.sub")}
      refreshing={data.refreshing}
      onRefresh={() => void data.refresh()}
      footer={data.data && data.data.status !== "verified" ? <PillButton title={t("verify.upload")} onPress={() => void openWeb(webPath)} /> : null}
    >
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
              const doc = data.data!.docs.find((item) => item.type === config.type);
              const status = doc ? DOC_STATUS[doc.status] ?? DOC_STATUS.uploaded : null;
              return (
                <View key={config.type} style={{ paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line, gap: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <T weight="bold" style={{ flex: 1 }}>{config.label}</T>
                    {status ? <TonePill tone={status.tone} label={t(status.label)} /> : <TonePill tone={config.required ? "accent" : "muted"} label={config.required ? t("verify.needed") : t("verify.optional")} />}
                  </View>
                  <T style={{ color: colors.inkSoft, fontSize: 14 }}>{doc?.status === "rejected" && doc.rejectionReason ? doc.rejectionReason : config.hint}</T>
                </View>
              );
            })}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
