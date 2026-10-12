import { View } from "react-native";
import { Badge, ErrorState, LinkRow, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, PillButton, T } from "@/components/ui";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// Legal pages (web /home/legal): returns, privacy, terms… with whether each is published. Editing them (a rich
// text editor, with Peggy drafting) opens the web.

interface LegalPageRow {
  key: string;
  title: string;
  custom: boolean;
  updatedAt: string | null;
  status: "published" | "draft" | "empty";
}

const STATUS: Record<LegalPageRow["status"], { label: string; bg: string; fg: string }> = {
  published: { label: "Live", bg: colors.successTint, fg: colors.success },
  draft: { label: "Draft", bg: "#FDF0D5", fg: "#8A5A00" },
  empty: { label: "Not written", bg: colors.canvas, fg: colors.inkSoft },
};

export default function LegalPages() {
  const pages = useLoad(() => api<LegalPageRow[]>("/api/app/legal"));
  const missing = (pages.data ?? []).filter((page) => page.status === "empty" && !page.custom).length;

  return (
    <Screen title="Legal pages" sub="Your returns, privacy and terms pages. Tap one to edit it on the web." refreshing={pages.refreshing} onRefresh={() => void pages.refresh()}>
      {pages.loading && !pages.data ? <LoadingBlock /> : null}
      {pages.error && !pages.data ? <ErrorState message={pages.error} onRetry={() => void pages.reload()} web={{ label: "Open on web", onPress: () => void openWeb("/home/legal") }} /> : null}
      {missing ? <T style={{ color: colors.inkSoft, lineHeight: 20 }}>{missing} standard page{missing === 1 ? " isn't" : "s aren't"} written yet. Peggy can draft them for you on the web.</T> : null}
      {pages.data ? (
        <Card style={{ paddingVertical: 2 }}>
          {pages.data.map((page, index) => (
            <LinkRow
              key={page.key}
              first={index === 0}
              icon="doc"
              label={page.title}
              hint={page.updatedAt ? `Saved ${new Date(page.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : page.custom ? "Your own page" : undefined}
              onPress={() => void openWeb(`/home/legal/${encodeURIComponent(page.key)}`)}
              right={
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Badge label={STATUS[page.status].label} bg={STATUS[page.status].bg} fg={STATUS[page.status].fg} />
                </View>
              }
            />
          ))}
        </Card>
      ) : null}
      <PillButton title="Add a page on the web" tone="white" size="md" onPress={() => void openWeb("/home/legal")} />
    </Screen>
  );
}
