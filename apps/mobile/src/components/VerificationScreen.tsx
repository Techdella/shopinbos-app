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
import { colors } from "@/theme";

// Verification status for suppliers and delivery partners: where the review is and which documents are in.
// Uploading documents (PDFs, scans) happens on the web verification page.

const DOC_STATUS: Record<string, { label: string; tone: Tone }> = {
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Needs a new copy", tone: "danger" },
  under_review: { label: "Being checked", tone: "warning" },
  submitted: { label: "Sent", tone: "info" },
  uploaded: { label: "Uploaded", tone: "info" },
  draft: { label: "Not sent", tone: "muted" },
};

export function VerificationScreen({ role, load }: { role: "supplier" | "logistics_partner"; load: () => Promise<{ status: string; docs: VerificationDoc[]; trustScore: number }> }) {
  const data = useLoad(load);
  const webPath = role === "supplier" ? "/supplier/verification" : "/logistics/verification";
  const stage = data.data ? verificationStage(data.data.status) : null;

  return (
    <Screen
      title="Verification"
      sub="Shops trust verified partners first. We check your documents by hand."
      refreshing={data.refreshing}
      onRefresh={() => void data.refresh()}
      footer={data.data && data.data.status !== "verified" ? <PillButton title="Upload documents" onPress={() => void openWeb(webPath)} /> : null}
    >
      {data.loading && !data.data ? <LoadingBlock /> : null}
      {data.error && !data.data ? <ErrorState message={data.error} onRetry={() => void data.reload()} web={{ label: "Open on web", onPress: () => void openWeb(webPath) }} /> : null}
      {data.data && stage ? (
        <>
          <Card style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <AppIcon name="shield" color={colors.forest} />
              <T weight="extrabold" style={{ flex: 1, fontSize: 16 }}>{stage.label}</T>
              <TonePill tone="muted" label={`Trust ${data.data.trustScore}`} />
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
                    {status ? <TonePill tone={status.tone} label={status.label} /> : <TonePill tone={config.required ? "accent" : "muted"} label={config.required ? "Needed" : "Optional"} />}
                  </View>
                  <T style={{ color: colors.inkSoft, fontSize: 12.5 }}>{doc?.status === "rejected" && doc.rejectionReason ? doc.rejectionReason : config.hint}</T>
                </View>
              );
            })}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
