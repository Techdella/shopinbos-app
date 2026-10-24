import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Badge, ErrorState, LinkRow, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Field, Label, Notice, PillButton, T } from "@/components/ui";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/useLoad";
import { formatDate } from "@shared/i18n";
import { useLocale, useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Legal pages (web /home/legal): returns, privacy, terms… with whether each is published. Each opens the app's
// plain-text editor (app/legal/[key].tsx); "Add a page" names a page of your own (POST /api/app/legal) and opens it.

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
      {pages.error && !pages.data ? <ErrorState message={pages.error} onRetry={() => void pages.reload()} /> : null}
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
      {pages.data ? <AddPage /> : null}
    </Screen>
  );
}

/** "Add a page": its name, then the editor opens on it. */
function AddPage() {
  const t = useT("m_shop", "common");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function create() {
    if (title.trim().length < 2) return setProblem(t("legal.nameFirst"));
    setBusy(true);
    setProblem(null);
    try {
      const page = await api<{ key: string }>("/api/app/legal", { method: "POST", json: { title: title.trim() } });
      setOpen(false);
      setTitle("");
      router.push({ pathname: "/legal/[key]", params: { key: page.key } });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : t("legal.addFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <PillButton title={t("legal.addPage")} tone="white" size="md" onPress={() => setOpen(true)} />;
  return (
    <Card style={{ gap: 12, borderWidth: 1, borderColor: colors.line }}>
      <View>
        <Label>{t("legal.pageName")}</Label>
        <Field value={title} onChangeText={setTitle} maxLength={80} autoFocus placeholder={t("legal.pageNamePlaceholder")} accessibilityLabel={t("legal.pageName")} onSubmitEditing={() => void create()} />
      </View>
      {problem ? <Notice>{problem}</Notice> : null}
      <PillButton title={t("legal.addPage")} size="md" busy={busy} onPress={() => void create()} />
    </Card>
  );
}
