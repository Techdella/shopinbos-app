import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { AppIcon } from "@/components/icons";
import { EmptyState, ErrorState, LoadingBlock, SectionTitle } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, T } from "@/components/ui";
import { fetchTemplates, type TemplateRow } from "@/lib/marketing";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { colors } from "@/theme";

// Email templates gallery (web /home/marketing/templates), read-only: the shop's saved templates and the starter
// library. Tapping one opens the template editor on the web.

function TemplateCard({ template, onPress }: { template: TemplateRow; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <Card style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" }}>
          <AppIcon name="mail" size={20} color={colors.accentInk} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T weight="extrabold" style={{ fontSize: 15 }} numberOfLines={1}>{template.name}</T>
          <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={2}>{template.description || template.subject}</T>
          {template.category ? <T weight="semibold" style={{ color: colors.inkSoft, fontSize: 13, textTransform: "capitalize" }}>{template.category.replace(/_/g, " ")}</T> : null}
        </View>
        <AppIcon name="chevron" size={18} color={colors.inkSoft} />
      </Card>
    </Pressable>
  );
}

export default function Templates() {
  const templates = useLoad(fetchTemplates);
  const data = templates.data;

  return (
    <Screen title="Email templates" sub="Start a campaign from one of these. Editing opens in your browser." refreshing={templates.refreshing} onRefresh={() => void templates.refresh()}>
      {templates.loading && !data ? <LoadingBlock /> : null}
      {templates.error && !data ? <ErrorState message={templates.error} onRetry={() => void templates.reload()} /> : null}
      {data ? (
        <>
          {data.saved.length ? <SectionTitle>Your templates</SectionTitle> : null}
          {data.saved.map((template) => (
            <TemplateCard key={template.id} template={template} onPress={() => void openWeb(`/home/marketing/templates/${encodeURIComponent(template.id ?? "")}`)} />
          ))}
          <SectionTitle>Ready-made</SectionTitle>
          {!data.library.length ? <EmptyState icon="mail" title="No templates yet">Ask Rex to write one for you.</EmptyState> : null}
          {data.library.map((template) => (
            <TemplateCard key={template.key} template={template} onPress={() => void openWeb("/home/marketing/templates")} />
          ))}
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/rex", params: { prompt: "Make me an email template for my store." } })} style={{ alignItems: "center", paddingVertical: 12 }}>
            <T weight="bold" style={{ color: colors.accentInk }}>Ask Rex to make one</T>
          </Pressable>
        </>
      ) : null}
    </Screen>
  );
}
