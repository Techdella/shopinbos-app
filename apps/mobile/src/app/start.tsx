import { useState } from "react";
import { Pressable, Share, View } from "react-native";
import { router } from "expo-router";
import { AppIcon } from "@/components/icons";
import { Badge, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { fetchSetup, patchSetup, type SetupOverview, type SetupPatch, type SetupStep } from "@/lib/setup";
import { stepWords } from "@/lib/setup-words";
import { useLoad } from "@/lib/useLoad";
import { openPath, openWeb } from "@/lib/web";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// Start here (web /home/start): what a new seller still has to do. Steps that need a form on the web (payments,
// delivery areas, payout bank, going live) open /home/start there; sharing the link happens right here.

export default function StartHere() {
  const t = useT("m_onboarding", "common");
  const words = (step: SetupStep) => stepWords(step, t);
  const setup = useLoad(fetchSetup);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const data = setup.data;

  async function change(patch: SetupPatch, id: string) {
    setBusy(id);
    setError(null);
    try {
      setup.setData(await patchSetup(patch));
      return true;
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : t("start.saveFailed"));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function share(overview: SetupOverview) {
    const url = overview.store.url;
    if (!url) return void openWeb("/home/start");
    const result = await Share.share({ message: t("start.shareMessage", { name: overview.store.name, url }) }).catch(() => null);
    if (result && result.action !== Share.dismissedAction) await change({ type: "shared" }, "share");
  }

  function run(step: SetupStep, overview: SetupOverview) {
    // Technical steps never show their workings on a phone: the team sets up the domain.
    if (step.key === "domain") return void router.push({ pathname: "/ask-us", params: { what: "web-address" } });
    if (step.key === "look") return void router.push({ pathname: "/web-only", params: { what: "look" } });
    if (step.key === "audience") return void router.push("/marketing");
    if (step.action.kind === "link") return void openPath(step.action.href);
    if (step.key === "share") return void share(overview);
    // Payments, delivery, payout bank and going live have their forms on the web Start here page.
    return void openWeb("/home/start");
  }

  function ask(step: SetupStep) {
    if (!step.helper) return;
    router.push({ pathname: step.helper.who === "rex" ? "/rex" : "/peggy", params: { prompt: step.helper.prompt } });
  }

  return (
    <Screen title={t("start.title")} sub={t("start.sub")} refreshing={setup.refreshing} onRefresh={() => void setup.refresh()}>
      {setup.loading && !data ? <LoadingBlock /> : null}
      {setup.error && !data ? <ErrorState message={setup.error} onRetry={() => void setup.reload()} /> : null}
      {error ? <Notice>{error}</Notice> : null}
      {data ? (
        <>
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <T weight="extrabold" style={{ fontSize: 17 }}>{data.checklist.complete ? t("start.allSet") : t("start.progress", { done: data.checklist.done, total: data.checklist.total })}</T>
              <T weight="bold" style={{ color: colors.inkSoft }}>{data.checklist.percent}%</T>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.canvas, overflow: "hidden" }} accessibilityLabel={t("start.percent", { percent: data.checklist.percent })}>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.success, width: `${data.checklist.percent}%` }} />
            </View>
            {data.checklist.next ? <T style={{ color: colors.inkSoft }}>{t("start.next", { step: words(data.checklist.next).title })}</T> : null}
          </Card>

          {data.checklist.steps.map((step) => {
            const open = !step.done && !step.skipped;
            return (
              <Card key={step.key} style={{ gap: 10, opacity: step.skipped ? 0.7 : 1 }}>
                <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, marginTop: 1, borderWidth: 2, borderColor: step.done ? colors.success : colors.toggleOff, backgroundColor: step.done ? colors.success : colors.surface, alignItems: "center", justifyContent: "center" }}>
                    {step.done ? <AppIcon name="check" size={15} color="#FFFFFF" strokeWidth={3} /> : null}
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                      <T weight="extrabold" style={{ fontSize: 15, textDecorationLine: step.done ? "line-through" : "none", color: step.done ? colors.inkSoft : colors.ink }}>{words(step).title}</T>
                      {step.optional ? <Badge label={t("start.optional")} /> : null}
                      {step.skipped ? <Badge label={t("start.skipped")} /> : null}
                    </View>
                    <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21 }}>{words(step).hint}</T>
                  </View>
                </View>
                {open || (step.done && step.action.kind === "link") ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingLeft: 40 }}>
                    <PillButton title={words(step).label} size="sm" tone={open ? "ink" : "white"} busy={busy === step.key} onPress={() => run(step, data)} />
                    {open && step.helper ? (
                      <Pressable accessibilityRole="button" onPress={() => ask(step)} style={{ minHeight: 38, borderRadius: radii.pill, paddingHorizontal: 14, justifyContent: "center", backgroundColor: colors.mintTint }}>
                        <T weight="bold" style={{ fontSize: 14, color: colors.forest }}>{t("start.ask", { name: step.helper.who === "rex" ? "Rex" : "Peggy" })}</T>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
                {!step.done && step.key !== "store" ? (
                  <View style={{ paddingLeft: 40, alignItems: "flex-start" }}>
                    <LinkButton
                      title={busy === `skip:${step.key}` ? t("saving") : step.skipped ? t("start.bringBack") : t("start.skipForNow")}
                      color={colors.inkSoft}
                      style={{ minHeight: 32 }}
                      onPress={() => void change({ type: step.skipped ? "unskip" : "skip", key: step.key }, `skip:${step.key}`)}
                    />
                  </View>
                ) : null}
              </Card>
            );
          })}

          {data.checklist.showStart ? (
            <LinkButton title={busy === "dismiss" ? t("saving") : t("start.hide")} color={colors.inkSoft} onPress={() => void change({ type: "dismiss" }, "dismiss").then((saved) => saved && router.back())} />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
