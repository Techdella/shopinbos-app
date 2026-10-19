import { View } from "react-native";
import { router } from "expo-router";
import { Badge, ErrorState, LinkRow, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, PillButton, T } from "@/components/ui";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { formatDate } from "@shared/i18n";
import { useLocale, useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Legal pages (web /home/legal): returns, privacy, terms… with whether each is published. Each opens the app's
// plain-text editor (app/legal/[key].tsx); adding a page of your own opens the web.

interface LegalPageRow {
  key: string;
  title: string;
  custom: boolean;
  updatedAt: string | null;
  status: "published" | "draft" | "empty";
}

// Labels are keys (common "status.*", m_shop "legal.*").
const STATUS: Record<LegalPageRow["status"], { label: "status.live" | "status.draft" | "legal.notWritten"; bg: string; fg: string }> = {
  published: { label: "status.live", bg: colors.successTint, fg: colors.success },
  draft: { label: "status.draft", bg: "#FDF0D5", fg: "#8A5A00" },
  empty: { label: "legal.notWritten", bg: colors.canvas, fg: colors.inkSoft },
};

export default function LegalPages() {
  const t = useT("m_shop", "common");
  const locale = useLocale();
  const pages = useLoad(() => api<LegalPageRow[]>("/api/app/legal"));
  const missing = (pages.data ?? []).filter((page) => page.status === "empty" && !page.custom).length;

  return (
    <Screen title={t("legal.title")} sub={t("legal.sub")} refreshing={pages.refreshing} onRefresh={() => void pages.refresh()}>
      {pages.loading && !pages.data ? <LoadingBlock /> : null}
      {pages.error && !pages.data ? <ErrorState message={pages.error} onRetry={() => void pages.reload()} web={{ label: "Open on web", onPress: () => void openWeb("/home/legal") }} /> : null}
      {missing ? <T style={{ color: colors.inkSoft, lineHeight: 20 }}>{t("legal.missing", { count: missing })}</T> : null}
      {pages.data ? (
        <Card style={{ paddingVertical: 2 }}>
          {pages.data.map((page, index) => (
            <LinkRow
              key={page.key}
              first={index === 0}
              icon="doc"
              label={page.title}
              hint={page.updatedAt ? t("legal.saved", { date: formatDate(page.updatedAt, locale) }) : page.custom ? t("legal.ownPage") : undefined}
              onPress={() => router.push({ pathname: "/legal/[key]", params: { key: page.key } })}
              right={
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Badge label={t(STATUS[page.status].label)} bg={STATUS[page.status].bg} fg={STATUS[page.status].fg} />
                </View>
              }
            />
          ))}
        </Card>
      ) : null}
      <PillButton title={t("legal.add")} tone="white" size="md" onPress={() => void openWeb("/home/legal")} />
    </Screen>
  );
}
