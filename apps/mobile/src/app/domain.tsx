import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Heading, List, Pill, Seg, Small, Tile } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { SetupHelpRequest } from "@/components/SetupHelpRequest";
import { Card, Field, Label, Notice, PillButton, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { checkKey, claimDomain, claimErrorKey, fetchDomain, recordsToAdd, removeDomain, verifyDomain, type DnsRecord, type DomainState, type ServeAs, type VerifyCheck } from "@/lib/domain";
import { useT } from "@/lib/i18n";
import { openShop, shareText } from "@/lib/share";
import { useLoad } from "@/lib/useLoad";
import { colors, fonts, radii } from "@/theme";

// Web address ("Familiar app" prototype, My shop › Web address): the free <slug>.mybos.store address with Copy and
// Share; the own domain's status; and connecting a domain the seller already owns: type it, add the DNS records
// shown here (each with Copy), then Check. Buying a new domain isn't in the app at all, not even a link to the
// website: a domain is a digital service, so pointing to a payment elsewhere breaks Google Play Payments and Apple
// 3.1.1 / 3.1.3 (docs/store-payments-audit.md). Connecting one they already own is free and stays.

function CopyButton({ value, label, iconOnly = false }: { value: string; label: string; iconOnly?: boolean }) {
  const t = useT("m_domain");
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copied ? t("copied") : `${t("copy")}: ${label}`}
      hitSlop={6}
      onPress={() => {
        void Clipboard.setStringAsync(value).catch(() => undefined);
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1600);
      }}
      style={({ pressed }) => ({ minHeight: 44, minWidth: 44, paddingHorizontal: iconOnly ? 0 : 12, borderRadius: radii.pill, borderWidth: 1.5, borderColor: copied ? colors.success : colors.line, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, opacity: pressed ? 0.7 : 1 })}
    >
      <AppIcon name={copied ? "check" : "copy"} size={iconOnly ? 18 : 15} color={copied ? colors.success : colors.ink} />
      {iconOnly ? null : <T weight="bold" style={{ fontSize: 14 }}>{copied ? t("copied") : t("copy")}</T>}
    </Pressable>
  );
}

function RecordCard({ record }: { record: DnsRecord }) {
  const t = useT("m_domain");
  // Names and values in the monospace face on a grey strip, selectable, with a copy icon beside each.
  const line = (label: string, value: string) => (
    <View style={{ gap: 6 }}>
      <Small>{label}</Small>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0, backgroundColor: colors.canvas, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
          <T selectable style={{ fontFamily: fonts.mono, fontSize: 14, lineHeight: 20 }}>{value}</T>
        </View>
        <CopyButton value={value} label={label} iconOnly />
      </View>
    </View>
  );
  return (
    <View style={{ gap: 10, padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Pill label={record.type} tone="teal" />
        {record.required ? null : <Pill label={t("rec.optional")} />}
      </View>
      {line(t("rec.host"), record.label)}
      {line(t("rec.value"), record.value)}
    </View>
  );
}

export default function DomainScreen() {
  const t = useT("m_domain", "common");
  const loaded = useLoad(fetchDomain);
  const [input, setInput] = useState("");
  const [serveAs, setServeAs] = useState<ServeAs>("www");
  const [busy, setBusy] = useState<null | "claim" | "verify" | "remove">(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [check, setCheck] = useState<VerifyCheck | null>(null);
  const [changing, setChanging] = useState(false);
  const [askTeam, setAskTeam] = useState(false);
  const autoChecked = useRef(false);

  const data = loaded.data;
  const own = data?.own ?? null;
  const setOwn = (next: DomainState) => loaded.setData((current) => (current ? { ...current, own: next } : current));

  async function claim() {
    const domain = input.trim();
    if (!domain) return setProblem(t("err.enterDomain"));
    setBusy("claim");
    setProblem(null);
    setCheck(null);
    try {
      setOwn(await claimDomain(domain, serveAs));
      setChanging(false);
      setInput("");
    } catch (error) {
      const key = claimErrorKey(error instanceof ApiError ? error.code : undefined, error instanceof Error ? error.message : "");
      setProblem(key ? t(key) : error instanceof Error ? error.message : t("err.add"));
    } finally {
      setBusy(null);
    }
  }

  async function verify(quiet = false) {
    setBusy("verify");
    if (!quiet) setProblem(null);
    try {
      const result = await verifyDomain();
      if (!quiet || result.check.ok) setCheck(result.check);
      setOwn(result.state);
    } catch (error) {
      if (!quiet) setProblem(error instanceof ApiError && error.code === "rate_limited" ? t("err.checkedLot") : t("err.checkNow"));
    } finally {
      setBusy(null);
    }
  }

  // One quiet check each time the screen opens while a domain is waiting.
  const pendingDomain = own?.pending?.domain;
  useEffect(() => {
    if (!pendingDomain || autoChecked.current) return;
    autoChecked.current = true;
    void verify(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDomain]);

  async function remove(which: "live" | "pending") {
    setBusy("remove");
    setProblem(null);
    try {
      setOwn(await removeDomain(which));
      setCheck(null);
    } catch {
      setProblem(t("err.remove"));
    } finally {
      setBusy(null);
    }
  }

  function confirmRemove(domain: string) {
    Alert.alert(t("own.removeTitle", { domain }), t("own.stops", { domain }), [
      { text: t("own.keepIt"), style: "cancel" },
      { text: t("own.removeIt"), style: "destructive", onPress: () => void remove("live") },
    ]);
  }

  const live = own?.live ?? null;
  const pending = own?.pending ?? null;
  const showForm = Boolean(own) && !pending && (!live || changing);
  const checkLine = checkKey(check);

  return (
    <Screen title={t("title")} refreshing={loaded.refreshing} onRefresh={() => void loaded.refresh()}>
      {loaded.loading && !data ? <LoadingBlock /> : null}
      {loaded.error && !data ? <ErrorState message={loaded.error} onRetry={() => void loaded.reload()} /> : null}

      {data ? (
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Tile icon="globe" tone="lilac" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Small>{t("free")}</Small>
              <Pressable accessibilityRole="link" onPress={() => void openShop(data.free.url)} hitSlop={4}>
                <T weight="extrabold" style={{ fontSize: 17 }} numberOfLines={2}>{data.free.host}</T>
              </Pressable>
            </View>
          </View>
          <Pill label={data.free.live ? t("live") : t("notPublished")} tone={data.free.live ? "ok" : "gray"} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <CopyButton value={data.free.url} label={data.free.host} />
            </View>
            <PillButton size="sm" tone="white" style={{ flex: 1, minHeight: 44 }} accessibilityLabel={t("share")} onPress={() => void shareText(data.free.url)}>
              <AppIcon name="share" size={15} />
              <T weight="bold" style={{ fontSize: 14 }}>{t("share")}</T>
            </PillButton>
          </View>
        </Card>
      ) : null}

      {live ? (
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Tile icon="check" tone="ok" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Small>{t("own.yours")}</Small>
              <Pressable accessibilityRole="link" onPress={() => void openShop(`https://${live.domain}`)} hitSlop={4}>
                <T weight="extrabold" style={{ fontSize: 17 }} numberOfLines={2}>{live.domain}</T>
              </Pressable>
            </View>
          </View>
          <Pill label={t("own.connected")} tone="ok" />
          {own && !own.hostingConfigured && !check?.ok ? <Small>{t("own.finishing")}</Small> : null}
          <View style={{ gap: 8 }}>
            {!pending && !changing ? <PillButton title={t("own.different")} size="md" tone="white" onPress={() => setChanging(true)} /> : null}
            <PillButton title={t("own.removeDomain")} size="md" tone="white" busy={busy === "remove"} onPress={() => confirmRemove(live.domain)} />
          </View>
        </Card>
      ) : null}

      {pending ? (
        <View style={{ gap: 12 }}>
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Tile icon="clock" tone="warn" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Small>{live ? t("pend.moving") : t("pend.connecting")}</Small>
                <T weight="extrabold" style={{ fontSize: 17 }} numberOfLines={2}>{pending.domain}</T>
              </View>
            </View>
            <Pill label={busy === "verify" ? t("pend.checking") : t("pend.waiting")} tone="warn" />
            <T style={{ fontSize: 15, lineHeight: 21, color: colors.inkSoft }}>{t("pend.addRecords")}</T>
          </Card>
          <List>
            {recordsToAdd(pending.records).map((record) => (
              <RecordCard key={`${record.type}-${record.name}`} record={record} />
            ))}
          </List>
          {checkLine ? <Notice tone={checkLine === "check.ok" ? "success" : "info"}>{t(checkLine)}</Notice> : null}
          <PillButton title={t("pend.checkNow")} busy={busy === "verify"} onPress={() => void verify()} />
          <View style={{ gap: 8 }}>
            {askTeam ? null : <PillButton title={t("pend.askUs")} size="md" tone="white" onPress={() => setAskTeam(true)} />}
            <PillButton title={live ? t("pend.keepCurrent") : t("own.different")} size="md" tone="white" busy={busy === "remove"} onPress={() => void remove("pending")} />
          </View>
          {askTeam ? (
            <SetupHelpRequest title={t("pend.teamTitle", { domain: pending.domain })} description={t("pend.teamDesc")} feature="custom_domain" softwareQuestion={t("pend.whereBought")} softwarePlaceholder={t("pend.wherePlaceholder")} />
          ) : null}
        </View>
      ) : null}

      {showForm ? (
        <Card style={{ gap: 12 }}>
          <Heading>{live ? t("own.otherDomain") : t("choice.title")}</Heading>
          <View>
            <Label>{t("own.whatsYours")}</Label>
            <Field
              value={input}
              onChangeText={setInput}
              placeholder="yourbrand.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              onSubmitEditing={() => void claim()}
              accessibilityLabel={t("own.whatsYours")}
            />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Seg label={t("own.withWww")} on={serveAs === "www"} onPress={() => setServeAs("www")} />
            <Seg label={t("own.withoutWww")} on={serveAs === "apex"} onPress={() => setServeAs("apex")} />
          </View>
          <Small>{t("own.customersSee", { host: serveAs === "www" ? "www.yourbrand.com" : "yourbrand.com" })}</Small>
          <PillButton title={t("continue")} busy={busy === "claim"} onPress={() => void claim()} />
          {live ? <PillButton title={t("cancel")} size="sm" tone="white" onPress={() => setChanging(false)} /> : null}
        </Card>
      ) : null}

      {problem ? <Notice>{problem}</Notice> : null}

    </Screen>
  );
}
