import { useState } from "react";
import { Pressable, Share, View } from "react-native";
import { router } from "expo-router";
import { AppIcon } from "@/components/icons";
import { CallPeggyButton } from "@/components/CallPeggyButton";
import { Badge, ErrorState, LoadingBlock } from "@/components/kit";
import { usePeggyContinue, usePeggySaved } from "@/lib/peggy-call";
import { Screen } from "@/components/Screen";
import { Card, LinkButton, Notice, PillButton, T } from "@/components/ui";
import { fetchSetup, patchSetup, type SetupOverview, type SetupPatch, type SetupStep } from "@/lib/setup";
import { stepWords } from "@/lib/setup-words";
import { useLoad } from "@/lib/useLoad";
import { openPath } from "@/lib/web";
import { ShopLiveSheet, usePublishShop } from "@/components/seller/PublishShop";
import { useT } from "@/lib/i18n";
import { colors, radii } from "@/theme";

// Start here (web /home/start): what a new seller still has to do. Every step opens its screen in the app; sharing
// the link and going live happen right here (publishShop: "Your shop is live" with View shop and Share, or the
// reason it couldn't, under the step's own button). "Edit my shop" is under the look step.

/** The app screen for each step that has one (the rest: share and go live here, or the step's own link). */
export const STEP_SCREENS: Partial<Record<SetupStep["key"], string>> = {
  store: "/settings",
  look: "/templates",
  payments: "/payments",
  delivery: "/delivery/where",
  partners: "/delivery/find",
  payout: "/wallet",
  socials: "/posts",
  domain: "/domain",
  audience: "/marketing",
};

export default function StartHere() {
  const t = useT("m_onboarding", "m_shop", "common");
  const words = (step: SetupStep) => stepWords(step, t);
  const setup = useLoad(fetchSetup);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const data = setup.data;
  // On a call with Peggy: each save refreshes the checklist; after the call it stays here (the list shows what's next).
  usePeggySaved(() => void setup.reload());
  usePeggyContinue(() => {
    void setup.reload();
    return true;
  });

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
    if (!url) return setError(t("noLink"));
    const result = await Share.share({ message: t("start.shareMessage", { name: overview.store.name, url }) }).catch(() => null);
    if (result && result.action !== Share.dismissedAction) await change({ type: "shared" }, "share");
  }

  const publishing = usePublishShop(() => void setup.reload());
  async function goLive() {
    setError(null);
    await publishing.publish();
  }

  // Every step opens a screen in the app (STEP_SCREENS); link steps go through openPath, which also stays in the app.
  function run(step: SetupStep, overview: SetupOverview) {
    const screen = STEP_SCREENS[step.key];
    if (screen) return void router.push(screen as never);
    if (step.key === "share") return void share(overview);
    if (step.key === "live") return void goLive();
    if (step.action.kind === "link") return void openPath(step.action.href);
  }

  function ask(step: SetupStep) {
    if (!step.helper) return;
    router.push({ pathname: step.helper.who === "rex" ? "/rex" : "/peggy", params: { prompt: step.helper.prompt } });
  }

  return (
    <Screen title={t("start.title")} sub={t("start.subShort")} tip={t("start.sub")} refreshing={setup.refreshing} onRefresh={() => void setup.refresh()}>
      {setup.loading && !data ? <LoadingBlock /> : null}
      {setup.error && !data ? <ErrorState message={setup.error} onRetry={() => void setup.reload()} /> : null}
      {error ? <Notice>{error}</Notice> : null}
      {/* Peggy on a free call: what she saves ticks off below as she goes. */}
      <CallPeggyButton />
      {data ? (
        <>
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <T weight="extrabold" style={{ fontSize: 17 }}>{data.checklist.complete ? t("start.allSet") : t("start.progress", { done: data.checklist.done, total: data.checklist.total })}</T>
              <T weight="bold" style={{ color: colors.inkSoft }}>{data.checklist.percent}%</T>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.canvas, overflow: "hidden" }} accessibilityLabel={t("start.percent", { percent: data.checklist.percent })}>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.successFill, width: `${data.checklist.percent}%` }} />
            </View>
            {data.checklist.next ? <T style={{ color: colors.inkSoft }}>{t("start.next", { step: words(data.checklist.next).title })}</T> : null}
          </Card>

          {data.checklist.steps.map((step) => {
            const open = !step.done && !step.skipped;
            return (
              <Card key={step.key} style={{ gap: 10, opacity: step.skipped ? 0.7 : 1 }}>
                <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, marginTop: 1, borderWidth: 2, borderColor: step.done ? colors.success : colors.toggleOff, backgroundColor: step.done ? colors.successFill : colors.surface, alignItems: "center", justifyContent: "center" }}>
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
                    <PillButton title={words(step).label} size="sm" tone={open ? "ink" : "white"} busy={busy === step.key || (step.key === "live" && publishing.busy)} onPress={() => run(step, data)} />
                    {step.key === "look" ? <PillButton testID="start-edit-shop" title={t("editShop.open")} size="sm" tone="white" onPress={() => router.push("/shop-edit" as never)} /> : null}
                    {open && step.helper ? (
                      <Pressable accessibilityRole="button" onPress={() => ask(step)} style={{ minHeight: 38, borderRadius: radii.pill, paddingHorizontal: 14, justifyContent: "center", backgroundColor: colors.mintTint }}>
                        <T weight="bold" numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, color: colors.forest }}>{t("start.ask", { name: step.helper.who === "rex" ? "Rex" : "Peggy" })}</T>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
                {step.key === "live" && publishing.error ? <View style={{ paddingLeft: 40 }}><Notice>{publishing.error}</Notice></View> : null}
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
      <ShopLiveSheet shop={publishing.live} onClose={publishing.closeLive} />
    </Screen>
  );
}
