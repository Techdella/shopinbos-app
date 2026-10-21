import { useState } from "react";
import { View } from "react-native";
import { naira } from "@shared/onboarding";
import { Eyebrow, List, Row, Sub } from "@/components/design";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Initial, NoteCard } from "@/components/PartnerKit";
import { PaySellersCard } from "@/components/PaySellersCard";
import { Screen } from "@/components/Screen";
import { Notice, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fetchJobs, moveJob, type Job } from "@/lib/logistics";
import { dayWord } from "@/lib/partner-pure";
import { useLoad } from "@/lib/useLoad";
import { colors } from "@/theme";

// Pay-on-delivery cash ("Delivery partner app" prototype `podCash`): the cash your riders collected belongs to each
// seller. Pay a seller straight to their bank, or hand it over (PaySellersCard), and mark a delivery's cash as sent
// ("I've sent it to Glow by Amaka", POST jobs/[id] { action: "cash_paid" }): a record the seller confirms.

export default function PodCash() {
  const t = useT("m_partner", "common");
  const done = useLoad(() => fetchJobs("done"));
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const collected = (done.data?.jobs ?? []).filter((job) => job.status === "delivered" && (job.codCollected ?? 0) > 0);

  async function markSent(job: Job) {
    setBusy(job.id);
    setError(null);
    try {
      await moveJob(job.id, { action: "cash_paid" });
      setSent((was) => ({ ...was, [job.id]: true }));
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : t("error.retry"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen title={t("cashScreen.title")} refreshing={done.refreshing} onRefresh={() => void done.refresh()}>
      <Sub>{t("cashScreen.sub")}</Sub>
      <PaySellersCard onPaid={() => void done.reload()} />
      {done.loading && !done.data ? <LoadingBlock /> : null}
      {done.error && !done.data ? <ErrorState message={done.error} onRetry={() => void done.reload()} /> : null}
      {collected.length ? (
        <>
          <Eyebrow>{t("cashScreen.collected")}</Eyebrow>
          {collected.map((job) => (
            <View key={job.id} style={{ gap: 10 }}>
              <List>
                <Row
                  lead={<Initial name={job.shop} bg={colors.peach} fg={colors.accentInk} />}
                  title={job.shop}
                  sub={t("cashScreen.jobLine", { ref: job.ref, day: dayWord(job.deliveredAt, undefined, t) })}
                  right={<T weight="bold">{naira(job.codCollected ?? 0)}</T>}
                />
              </List>
              {sent[job.id] ? (
                <NoteCard tone="mint" title={t("cashScreen.marked")}>{t("cashScreen.waiting", { shop: job.shop })}</NoteCard>
              ) : (
                <PillButton tone="forest" busy={busy === job.id} disabled={Boolean(busy)} title={t("cashScreen.sentIt", { shop: job.shop })} onPress={() => void markSent(job)} />
              )}
            </View>
          ))}
        </>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
    </Screen>
  );
}
