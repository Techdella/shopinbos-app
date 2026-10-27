import { useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { naira } from "@shared/onboarding";
import { Seg, Small, Sub } from "@/components/design";
import { Checklist, type ChecklistItem } from "@/components/familiar/Checklist";
import { GettingStartedCard } from "@/components/familiar/GettingStarted";
import { LevelPill } from "@/components/familiar/LevelPill";
import { StatusRow } from "@/components/familiar/StatusRow";
import { useShopinbosRings } from "@/components/updates/TeamUpdatesRing";
import { StoryViewer } from "@/components/familiar/StoryViewer";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { NotificationBellButton } from "@/components/NotificationBellButton";
import { PayInOverdueCard } from "@/components/PayInOverdueCard";
import { CardButton, PeggyButton, RouteCard, shopRoleOf } from "@/components/PartnerKit";
import { TierCard } from "@/components/kyc/TierCard";
import { PushPromptCard } from "@/components/PushPromptCard";
import { TabScreen } from "@/components/TabScreen";
import { Card, T, Toggle } from "@/components/ui";
import { fetchRewards, fetchStatusFeed, levelProgress, type StatusAuthor, type StatusPost } from "@/lib/familiar";
import { useT } from "@/lib/i18n";
import { fetchEarnings, fetchJobs, fetchLogisticsOverview, fetchMarket, setTakingJobs, type Job, type JobView } from "@/lib/logistics";
import { STATUS_WORD, TAKING_BLOCK_ACTION, takingBlockOf } from "@/lib/logistics-pure";
import type { TakingBlock } from "@shared/taking-jobs";
import { dayWord, shortPlace, timeAgo, verificationStage } from "@/lib/partner-pure";
import { useLoad } from "@/lib/useLoad";
import * as WebBrowser from "expo-web-browser";
import { API_URL } from "@/lib/api";
import { colors, fonts } from "@/theme";
import { FilterBar } from "@/components/FilterBar";

// Jobs ("Familiar app" prototype F-Delivery `jobs`): the level ring (Rewards), "Good morning" over the company, Peggy
// and the bell; the Status row of sellers and suppliers; the "Get set up" checklist for the first days; a dark card
// with the taking-jobs switch, New jobs, On the way and what you earned this week (opens Money); the set-up,
// verification, pay-in, push and connections cards; then New / Active / Problems / Done with one route card per job
// ("Glow by Amaka  Seller · ₦2,500", "Yaba → Lekki", "Pick up by 3pm · Small bag · Pay on delivery"). The segment
// lives in ?view= so other screens can open one. Status, Rewards and earnings are extras: if they fail, they hide.

const SEGMENTS: { view: JobView; key: string }[] = [
  { view: "new", key: "seg.new" },
  { view: "active", key: "seg.active" },
  { view: "issues", key: "seg.problems" },
  { view: "done", key: "seg.done" },
];

function asView(value: unknown): JobView {
  return value === "active" || value === "issues" || value === "done" ? value : "new";
}

const greetKey = (hour: number) => (hour < 12 ? "fam.greet.morning" : hour < 17 ? "fam.greet.afternoon" : "fam.greet.evening");

/**
 * Under the "Taking new jobs" switch while it can't go on: exactly why, and one tap forward (Finish set-up, Add your
 * documents, Fix your documents, Talk to us). While the documents are being checked there's nothing to do but wait.
 */
function TakingBlockLine({ block, strong }: { block: TakingBlock; strong: boolean }) {
  const t = useT("m_partner");
  const action = TAKING_BLOCK_ACTION[block];
  return (
    <View accessibilityLiveRegion={strong ? "polite" : "none"} style={{ backgroundColor: strong ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.08)", borderRadius: 16, padding: 12, gap: 8, marginTop: -4 }}>
      <T weight={strong ? "bold" : "semibold"} style={{ fontSize: 14, lineHeight: 20, color: "#FFFFFF" }}>{t.dynamic(`taking.why.${block}`)}</T>
      {action.path ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(action.path as never)}
          hitSlop={6}
          style={({ pressed }) => ({ alignSelf: "flex-start", minHeight: 40, justifyContent: "center", paddingHorizontal: 14, borderRadius: 999, backgroundColor: "#FFFFFF", opacity: pressed ? 0.85 : 1 })}
        >
          <T weight="extrabold" numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, color: colors.forest }}>{t.dynamic(action.key)}</T>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A big number over a small line, on the dark card. */
function SumStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ gap: 2 }} accessible accessibilityLabel={`${value} ${label}`}>
      <T style={{ fontFamily: fonts.display, fontSize: 30, color: "#FFFFFF" }}>{value}</T>
      <T weight="semibold" style={{ fontSize: 13, color: "#BFE6DD" }}>{label}</T>
    </View>
  );
}

export default function LogisticsJobs() {
  const t = useT("m_partner");
  const params = useLocalSearchParams<{ view?: string }>();
  const view = asView(params.view);
  const overview = useLoad(fetchLogisticsOverview);
  const jobs = useLoad(() => fetchJobs(view), view);
  const market = useLoad(fetchMarket);
  const earnings = useLoad(fetchEarnings);
  const status = useLoad(fetchStatusFeed);
  const rewards = useLoad(fetchRewards);
  const data = overview.data;
  const [override, setOverride] = useState<boolean | null>(null);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [story, setStory] = useState<{ own: boolean; start: number } | null>(null);
  const [hideChecklist, setHideChecklist] = useState(false);
  // Why the switch can't go on yet (set-up, documents, being checked, fix them, on hold), or null when it can.
  const block = data ? takingBlockOf(data.partner) : null;
  const [why, setWhy] = useState(false);
  const taking = block ? false : (override ?? data?.partner.taking ?? false);
  const verification = data ? verificationStage(data.partner.verificationStatus, t) : null;
  const connections = market.data?.connections ?? [];
  const company = data?.partner.name ?? "";
  const logo = data?.partner.logoUrl ?? null;
  const feed = status.data;
  // Shopinbos's getting-started posts and the team's weekly updates share one ring.
  const rings = useShopinbosRings(feed?.feed);

  // The switch always answers a tap: blocked, it says why (the line under it); otherwise it saves, then reads the
  // company again so the switch shows what the server saved (and stays that way after a refresh).
  async function toggle() {
    if (switching) return;
    if (block) {
      setWhy(true);
      return;
    }
    const next = !taking;
    setSwitching(true);
    setSwitchError(null);
    setOverride(next);
    try {
      await setTakingJobs(next);
      await overview.reload();
      setOverride(null);
    } catch (error) {
      setOverride(null);
      setSwitchError(error instanceof Error ? error.message : t("error.retry"));
      void overview.reload();
    } finally {
      setSwitching(false);
    }
  }

  function refresh() {
    void overview.refresh();
    void jobs.refresh();
    void market.reload();
    void earnings.reload();
    void status.reload();
    void rewards.reload();
  }

  // A story's button: "Chat with them" and "Offer to deliver" open the chat with that business; "See their shop"
  // opens a seller's storefront (anything else, or a shop without a page, opens the chat too).
  function openCta(post: StatusPost, author: StatusAuthor) {
    const slug = post.cta?.target?.slug;
    if (post.cta?.kind === "view_shop" && author.role === "seller" && slug) {
      // The shop's own website (the story's button says "Opens website ↗", components/familiar/StoryViewer.tsx).
      void WebBrowser.openBrowserAsync(`${API_URL}/s/${encodeURIComponent(slug)}`);
      return;
    }
    router.push({ pathname: "/logistics/chat/[id]", params: { id: post.cta?.target?.userId ?? author.userId, name: author.name, role: author.role } });
  }

  // "Get set up" (prototype `ckList`), read from what the company already has.
  const checklist: ChecklistItem[] =
    data && market.data && data.partner.onboarded && !hideChecklist
      ? [
          { key: "docs", label: t("fam.ck.docs"), done: ["verified", "pending"].includes(data.partner.verificationStatus), onPress: () => router.push("/logistics/verification") },
          { key: "rates", label: t("fam.ck.rates"), done: (market.data.rateCard?.rows.length ?? 0) > 0, onPress: () => router.push("/logistics/rates") },
          { key: "points", label: t("fam.ck.points"), done: market.data.pickupPoints.length > 0, onPress: () => router.push("/logistics/points") },
          { key: "riders", label: t("fam.ck.riders"), done: data.riders.total > 0, onPress: () => router.push("/logistics/team") },
        ]
      : [];
  const checklistShown = checklist.some((item) => !item.done);

  const newCount = jobs.data?.counts.new ?? data?.counts.new ?? 0;
  const activeCount = jobs.data?.counts.active ?? data?.counts.active ?? 0;
  const week = earnings.data ? naira(earnings.data.week.amount) : null;

  const statusWord = (job: Job) => t.dynamic(`pst.${job.status}`, STATUS_WORD[job.status] ?? job.status.replace(/_/g, " "));
  const when = (job: Job) => job.pickupWindow || (view === "done" && job.deliveredAt ? dayWord(job.deliveredAt, undefined, t) : timeAgo(job.createdAt, undefined, t));
  const sub = (job: Job) =>
    [when(job), job.item, job.collect > 0 ? t("jobs.pod") : null, view !== "new" ? statusWord(job) : null, view === "active" && job.rider ? job.rider.name.split(" ")[0] : null].filter(Boolean).join(" · ");

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 50 }}>
      <LevelPill level={rewards.data?.level ?? null} progress={levelProgress(rewards.data)} uri={logo} name={company || "Shopinbos"} onPress={() => router.push("/rewards" as never)} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T weight="semibold" style={{ fontSize: 13, color: colors.inkSoft }}>{t.dynamic(greetKey(new Date().getHours()))}</T>
        <T weight="extrabold" numberOfLines={1} style={{ fontSize: 17 }} accessibilityRole="header">{company || " "}</T>
      </View>
      <PeggyButton label={t("fam.askPeggy")} onPress={() => router.push("/ask-peggy" as never)} />
      <NotificationBellButton />
    </View>
  );

  return (
    <TabScreen header={header} refreshing={overview.refreshing || jobs.refreshing} onRefresh={refresh}>
      {overview.error && !data ? <ErrorState message={overview.error} onRetry={() => void overview.reload()} /> : null}

      {feed ? (
        <View style={{ gap: 8 }}>
          <StatusRow
            authors={rings.authors}
            myName={company || "Shopinbos"}
            myPicture={logo}
            hasMine={feed.mine.posts.length > 0}
            onNew={() => router.push("/status/new" as never)}
            onOpenMine={() => setStory({ own: true, start: 0 })}
            onOpen={(index) => setStory({ own: false, start: index })}
            leading={rings.leading}
          />
          {feed.mine.viewsLast > 0 ? <Small>{t("fam.statusSeen", { count: feed.mine.viewsLast })}</Small> : null}
        </View>
      ) : null}

      {checklistShown ? <Checklist title={t("fam.ck.title")} items={checklist} onDismiss={() => setHideChecklist(true)} /> : null}
      <GettingStartedCard />

      {data && !data.partner.onboarded ? (
        <CardButton icon="truck" tint={colors.mintTint} iconBg="#FFFFFF" title={t("today.finish")} sub={t("today.finishHint")} onPress={() => router.push("/logistics/setup")} />
      ) : data && verification && data.partner.verificationStatus !== "verified" && !(checklistShown && data.partner.verificationStatus === "unverified") ? (
        <CardButton icon="shield" tint={colors.warnTint} iconBg="#FFFFFF" iconFg={colors.warnInk} title={verification.label} sub={verification.hint} onPress={() => router.push("/logistics/verification")} />
      ) : null}
      {data?.partner.verificationStatus === "verified" ? <TierCard /> : null}

      {data ? (
        <View style={{ backgroundColor: colors.forest, borderRadius: 26, padding: 20, gap: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 }}>
            <T weight="bold" style={{ flex: 1, fontSize: 14, color: "#BFE6DD" }}>{taking ? t("jobs.taking") : t("jobs.paused")}</T>
            <View style={{ opacity: block || switching ? 0.6 : 1 }}>
              <Toggle on={Boolean(taking)} onChange={() => void toggle()} label={t("jobs.takingLabel")} />
            </View>
          </View>
          {block ? <TakingBlockLine block={block} strong={why} /> : null}
          {switchError ? (
            <T weight="bold" accessibilityRole="alert" style={{ fontSize: 14, color: "#FFFFFF", marginTop: -6 }}>{switchError}</T>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 18 }}>
            <SumStat value={String(newCount)} label={t("fam.sum.new")} />
            <SumStat value={String(activeCount)} label={t("fam.sum.onTheWay")} />
            {week ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("fam.sum.weekLabel", { amount: week })}
                onPress={() => router.navigate("/logistics/earnings")}
                style={({ pressed }) => ({ flex: 1, alignItems: "flex-end", minHeight: 44, justifyContent: "flex-end", opacity: pressed ? 0.8 : 1 })}
              >
                <T numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: fonts.display, fontSize: 24, color: "#FFFFFF" }}>{week}</T>
                <T weight="semibold" style={{ fontSize: 13, color: "#BFE6DD" }}>{t("fam.sum.week")}</T>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      <PushPromptCard who="logistics" when={Boolean(data)} />
      {data?.overdue ? <PayInOverdueCard overdue={data.overdue} onChecked={() => void overview.reload()} /> : null}

      {connections.length > 0 ? (
        <CardButton icon="link" tint={colors.mintTint} iconBg="#FFFFFF" title={t("conn.banner", { count: connections.length })} sub={t("conn.bannerSub")} onPress={() => router.push("/logistics/connections")} />
      ) : null}

      {data && data.counts.quotes > 0 ? (
        <CardButton icon="tag" tint={colors.mintTint} iconBg="#FFFFFF" title={t("today.quotes", { count: data.counts.quotes })} sub={t("quotes.bannerSub")} onPress={() => router.push("/logistics/quotes")} />
      ) : null}

      <FilterBar>
        {SEGMENTS.map((segment) => (
          <Seg key={segment.view} label={t.dynamic(segment.key)} count={jobs.data?.counts[segment.view]} on={view === segment.view} onPress={() => router.setParams({ view: segment.view })} />
        ))}
      </FilterBar>

      {jobs.loading ? <LoadingBlock label={t("jobs.loading")} /> : null}
      {jobs.error && !jobs.data ? <ErrorState message={jobs.error} onRetry={() => void jobs.reload()} /> : null}
      {!jobs.loading && jobs.data && !jobs.data.jobs.length ? (
        <Card style={{ padding: 20, borderRadius: 24, borderWidth: 1, borderColor: colors.line }}>
          <Sub>{t("jobs.nothingHere")}</Sub>
        </Card>
      ) : null}
      {!jobs.loading
        ? jobs.data?.jobs.map((job) => {
            const who = t.dynamic(`fam.who.${shopRoleOf(job, connections)}`);
            const from = shortPlace(job.from);
            const to = shortPlace(job.to);
            const fee = naira(job.fee);
            const line = sub(job);
            return (
              <RouteCard
                key={job.id}
                shop={job.shop}
                who={who}
                fee={fee}
                from={from}
                to={to}
                sub={line}
                label={t("fam.card.label", { shop: job.shop, who, from, to, fee, sub: line })}
                onPress={() => router.push({ pathname: "/logistics/job/[id]", params: { id: job.id } })}
              />
            );
          })
        : null}

      {feed ? (
        <StoryViewer
          authors={story?.own ? [{ userId: "me", name: company || "Shopinbos", role: "logistics_partner", logoUrl: logo, seen: true, posts: feed.mine.posts }] : rings.authors}
          start={story?.start ?? 0}
          visible={Boolean(story)}
          own={story?.own}
          onClose={() => setStory(null)}
          onCta={openCta}
        />
      ) : null}
    </TabScreen>
  );
}
