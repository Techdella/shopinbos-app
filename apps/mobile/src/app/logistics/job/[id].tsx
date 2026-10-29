import { useState } from "react";
import { Linking, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { DECLINE_REASONS } from "@shared/delivery-market";
import { naira } from "@shared/onboarding";
import { Choice, Heading, List, Row, Small, Sub, Tile, Timeline } from "@/components/design";
import { type AppIconName } from "@/components/icons";
import { riderOptions } from "@/components/JobCard";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { NoteCard, shopRoleOf } from "@/components/PartnerKit";
import { Screen } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { ButtonRow, Card, Notice, PillButton, T } from "@/components/ui";
import { RoundAction, RoundActions } from "@/components/visual";
import { useT } from "@/lib/i18n";
import { fetchJob, fetchMarket, moveJob, type JobAction } from "@/lib/logistics";
import { STATUS_WORD, isPointJob, jobFooter, jobTimeline, nextMove } from "@/lib/logistics-pure";
import { shortPlace, timeAgo } from "@/lib/partner-pure";
import { useLoad } from "@/lib/useLoad";

// One delivery job ("Familiar app" prototype F-Delivery `job`): from → to, the shop and whether it is a seller or a
// supplier, pick-up and drop-off, the service and size with the pick-up deadline, what you get, the
// pay-on-delivery, failed-attempt or returning card, the rider and a vertical timeline, and the buttons for where
// it is: accept and pick a rider or decline (with why), move it along, confirm delivery (proof screen), report a
// failed attempt (with what happened), try again or return it, and hand it back. Moves go through
// POST /api/mobile/logistics/jobs/[id], with the web console's rules.

/** What happened on a failed attempt (prototype `failWhy`); the English goes to the shop, the label is translated. */
const FAIL_WHY = ["Customer not answering", "Customer not at the address", "Address can’t be found", "Customer refused it"];

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT("m_partner", "common");
  const job = useLoad(() => fetchJob(String(id)), String(id));
  const market = useLoad(fetchMarket);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | "assign" | "reassign" | "decline" | "fail">(null);
  const [pick, setPick] = useState<string | null>(null);
  const data = job.data;

  async function run(key: string, body: JobAction, after?: () => void) {
    setBusy(key);
    setError(null);
    setSheet(null);
    try {
      const result = await moveJob(String(id), body);
      if (result.job && data) job.setData({ ...data, job: result.job });
      void job.reload();
      after?.();
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : t("error.retry"));
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return (
      <Screen title={t("job.title")} refreshing={job.refreshing} onRefresh={() => void job.refresh()}>
        {job.loading ? <LoadingBlock /> : null}
        {job.error ? <ErrorState message={job.error} onRetry={() => void job.reload()} /> : null}
      </Screen>
    );
  }

  const current = data.job;
  const point = isPointJob(current.status, current.to, market.data?.pickupPoints ?? []);
  const footerKind = jobFooter(current.status);
  const move = nextMove(current.status, point);
  const steps = jobTimeline(current.status, point);
  const status = t.dynamic(`pst.${current.status}`, STATUS_WORD[current.status] ?? current.status);
  const fees = market.data?.rateCard;
  const options = riderOptions(data.riders, current.pickupGeo, undefined, t);
  const chosen = pick ?? options[0]?.value ?? null;
  const off = Boolean(busy);
  const open = ["confirmed", "picked_up", "in_transit", "out_for_delivery", "at_pickup_point", "failed"].includes(current.status);

  const button = (key: string, label: string, onPress: () => void, icon: AppIconName = "check") => (
    <PillButton tone="forest" busy={busy === key} disabled={off} onPress={onPress} icon={icon} title={label} />
  );
  const ghost = (label: string, onPress: () => void) => <PillButton title={label} tone="white" disabled={off} onPress={onPress} />;

  const footer =
    footerKind === "offer" ? (
      // A new request: Decline and Accept side by side (stacked, Accept on top, when the words don't fit).
      <ButtonRow labels={[t("decline"), t("job.acceptPick")]} size="lg" icons primaryLast>
        <PillButton title={t("decline")} tone="white" disabled={off} onPress={() => setSheet("decline")} style={{ flex: 1 }} />
        <PillButton tone="forest" busy={busy === "accept"} disabled={off} onPress={() => setSheet("assign")} icon="check" title={t("job.acceptPick")} style={{ flex: 1 }} />
      </ButtonRow>
    ) : footerKind === "moving" && move ? (
      <>
        {button(move.to, t.dynamic(move.key), () => void run(move.to, { action: "status", to: move.to }))}
        {ghost(t("job.reportFailed"), () => setSheet("fail"))}
      </>
    ) : footerKind === "last" ? (
      <>
        {button("deliver", t("job.confirmDelivery"), () => router.push({ pathname: "/logistics/proof/[id]", params: { id: current.id } }))}
        {ghost(t("job.reportFailed"), () => setSheet("fail"))}
      </>
    ) : footerKind === "failed" ? (
      <>
        {button("retry", t("job.tryAgain"), () => void run("retry", { action: "status", to: "out_for_delivery" }), "route")}
        {ghost(t("job.returnToSender"), () => void run("returning", { action: "status", to: "returning" }))}
      </>
    ) : footerKind === "returning" ? (
      button("returned", t("job.handedBack"), () => void run("returned", { action: "status", to: "returned" }))
    ) : null;

  const drop = current.buyer ? `${current.buyer.name} · ${current.buyer.address}` : current.to;

  return (
    <Screen title={current.ref} refreshing={job.refreshing} onRefresh={() => void job.refresh()} footer={footer}>
      <View style={{ gap: 4 }}>
        <Heading>{`${shortPlace(current.from)} → ${shortPlace(current.to)}`}</Heading>
        <Sub>{t("fam.job.shopWho", { shop: current.shop, who: t.dynamic(`fam.who.${shopRoleOf(current, market.data?.connections)}`), status })}</Sub>
      </View>
      {error ? <Notice>{error}</Notice> : null}

      <List>
        <Row lead={<Tile icon="box" tone="mint" />} title={t("job.pickFrom")} sub={current.from} />
        <Row lead={<Tile icon="pin" tone="peach" />} title={point ? t("job.dropAtPoint") : t("job.deliverTo")} sub={drop} />
      </List>

      <List>
        {/* Service and size, then the pick-up deadline (prototype `job.svc · job.size` over `job.by`). */}
        <Row lead={<Tile icon="truck" tone="gray" />} title={`${point ? t("svc.pickup_point") : t("svc.doorstep")} · ${current.item}`} sub={current.pickupWindow ?? t("job.sent", { ago: timeAgo(current.createdAt, undefined, t) })} />
        <Row lead={<Tile icon="wallet" tone="ok" />} title={t("job.youGet", { fee: naira(current.fee) })} sub={t("job.paidOnConfirm")} />
      </List>

      {current.collect > 0 ? <NoteCard title={t("job.podTitle", { cash: naira(current.collect) })}>{t("job.podBody", { shop: current.shop })}</NoteCard> : null}
      {current.status === "failed" ? (
        <NoteCard title={t("job.failedTitle", { reason: current.failedReason ?? t("job.failedNoReason") })}>
          {fees && fees.failedAttemptFee > 0 ? t("job.failedBody", { fee: naira(fees.failedAttemptFee) }) : t("job.failedBodyNoFee")}
        </NoteCard>
      ) : null}
      {current.status === "returning" ? (
        <NoteCard title={t("job.returningTitle", { shop: current.shop })}>{fees && fees.returnFee > 0 ? t("job.returningBody", { fee: naira(fees.returnFee) }) : t("job.returningBodyNoFee")}</NoteCard>
      ) : null}

      {steps ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Small style={{ flex: 1 }}>{current.rider ? t("job.riderIs", { name: current.rider.name }) : t("job.noRider")}</Small>
            {open ? (
              <T weight="bold" style={{ fontSize: 14, textDecorationLine: "underline" }} accessibilityRole="button" onPress={() => setSheet("reassign")}>
                {current.rider ? t("job.change") : t("job.assign")}
              </T>
            ) : null}
          </View>
          <Card style={{ padding: 20 }}>
            <Timeline steps={steps.map((step) => ({ label: t.dynamic(step.key), state: step.state }))} />
          </Card>
        </>
      ) : null}

      {current.proofUrl ? <Image source={{ uri: current.proofUrl }} style={{ width: "100%", height: 200, borderRadius: 24 }} contentFit="cover" accessibilityLabel={t("job.proofPhoto")} /> : null}

      {/* Call and WhatsApp the customer, Message the shop: round buttons in one row, each named under it. */}
      <RoundActions>
        {current.buyer?.phone ? (
          <>
            <RoundAction tone="primary" icon="phone" label={t("job.callCustomer")} onPress={() => void Linking.openURL(`tel:${current.buyer!.phone}`)} />
            <RoundAction tone="whatsapp" icon="chat" label="WhatsApp" onPress={() => void Linking.openURL(`https://wa.me/${current.buyer!.phone!.replace(/\D/g, "")}`)} />
          </>
        ) : null}
        <RoundAction icon="send" label={t("job.messageShop", { shop: current.shop })} onPress={() => router.push({ pathname: "/logistics/chat/[id]", params: { id: current.sellerUserId, name: current.shop } })} />
      </RoundActions>

      <Sheet visible={sheet === "assign" || sheet === "reassign"} onClose={() => setSheet(null)} title={t("assign.title")}>
        <Sub style={{ marginTop: -6 }}>{t("assign.sub")}</Sub>
        {options.length ? null : (
          <Card style={{ padding: 20 }}>
            <Sub>{t("assign.none")}</Sub>
          </Card>
        )}
        <View style={{ gap: 10, maxHeight: 360 }}>
          {options.slice(0, 6).map((option) => (
            <Choice key={option.value} title={option.label} sub={option.hint} on={chosen === option.value} onPress={() => setPick(option.value)} />
          ))}
        </View>
        <PillButton
          tone="forest"
          busy={busy === "accept" || busy === "assign"}
          disabled={off}
          icon="send"
          title={sheet === "assign" ? t("assign.accept") : t("assign.send")}
          onPress={() => (sheet === "assign" ? void run("accept", { action: "accept", riderId: chosen }) : void run("assign", { action: "assign", riderId: chosen }))}
        />
      </Sheet>

      <Sheet visible={sheet === "decline"} onClose={() => setSheet(null)} title={t("declineWhy.title")}>
        <Sub style={{ marginTop: -6 }}>{t("declineWhy.sub")}</Sub>
        <List>
          {DECLINE_REASONS.map((reason, index) => (
            <Row key={reason} title={t.dynamic(`declineWhy.${index}`, reason)} onPress={() => void run("decline", { action: "decline", reason }, () => router.back())} />
          ))}
        </List>
      </Sheet>

      <Sheet visible={sheet === "fail"} onClose={() => setSheet(null)} title={t("failWhy.title")}>
        <Sub style={{ marginTop: -6 }}>{t("failWhy.sub")}</Sub>
        <List>
          {FAIL_WHY.map((reason, index) => (
            <Row key={reason} title={t.dynamic(`failWhy.${index}`, reason)} onPress={() => void run("failed", { action: "status", to: "failed", failedReason: reason })} />
          ))}
        </List>
      </Sheet>
    </Screen>
  );
}
