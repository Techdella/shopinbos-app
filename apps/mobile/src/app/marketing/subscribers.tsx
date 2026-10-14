import { useState } from "react";
import { View } from "react-native";
import { Badge, ChipRow, EmptyState, ErrorState, LoadingBlock } from "@/components/kit";
import { Screen } from "@/components/Screen";
import { Card, Chip, Field, Label, LinkButton, Notice, PillButton, T, Toggle } from "@/components/ui";
import { addSubscriber, fetchSubscribers, type NewSubscriber, type SubscriberRow, type SubscriberStatus } from "@/lib/marketing";
import { useLoad } from "@/lib/useLoad";
import { openWeb } from "@/lib/web";
import { formatDate } from "@shared/i18n";
import { useLocale, useT } from "@/lib/i18n";
import { colors } from "@/theme";

// Subscribers (web /home/marketing/subscribers): the people who agreed to get the shop's emails and texts, with
// the counts, a filter by status, search, and "Add a person" (with how they agreed, the same as the web). Importing
// a list, tags, bulk changes and segments stay on the web.

type Filter = Exclude<SubscriberStatus, "spam"> | "all";
type Counts = Record<SubscriberStatus | "all", number> & { newThisMonth: number };

// Labels are m_marketing keys.
const FILTERS: { value: Filter; label: "subs.all" | "subs.active" | "subs.unsubscribed" | "subs.bounced" }[] = [
  { value: "all", label: "subs.all" },
  { value: "active", label: "subs.active" },
  { value: "unsubscribed", label: "subs.unsubscribed" },
  { value: "bounced", label: "subs.bounced" },
];

const STATUS_BADGE: Record<SubscriberStatus, { label: "subs.active" | "subs.unsubscribed" | "subs.bounced" | "subs.spam"; bg: string; fg: string }> = {
  active: { label: "subs.active", bg: colors.successTint, fg: colors.success },
  unsubscribed: { label: "subs.unsubscribed", bg: colors.canvas, fg: colors.inkSoft },
  bounced: { label: "subs.bounced", bg: colors.dangerTint, fg: colors.danger },
  spam: { label: "subs.spam", bg: colors.dangerTint, fg: colors.danger },
};

const EMPTY_FORM: NewSubscriber = { email: "", name: "", phone: "", birthday: "", tags: "", emailOk: false, textOk: false, note: "", welcome: true };

function PersonCard({ row }: { row: SubscriberRow }) {
  const t = useT("m_marketing");
  const locale = useLocale();
  const badge = STATUS_BADGE[row.status] ?? STATUS_BADGE.active;
  return (
    <Card style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <T weight="extrabold" style={{ flex: 1, fontSize: 15 }} numberOfLines={1}>{row.name || row.email}</T>
        <Badge label={t(badge.label)} bg={badge.bg} fg={badge.fg} />
      </View>
      <T style={{ color: colors.inkSoft, fontSize: 14 }} numberOfLines={1} selectable>{[row.name ? row.email : null, row.phone].filter(Boolean).join(" · ") || formatDate(row.createdAt, locale)}</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {row.consent?.email ? <Badge label={t("subs.emailOk")} bg={colors.mintTint} fg={colors.forest} /> : null}
        {row.consent?.text ? <Badge label={t("subs.textOk")} bg={colors.mintTint} fg={colors.forest} /> : null}
        {row.tags.slice(0, 6).map((tag) => <Badge key={tag} label={tag} />)}
      </View>
    </Card>
  );
}

/** One filter and search: page 1 from the server, then "Show more". Keyed by the parent so a new search starts fresh. */
function People({ status, q, onCounts }: { status: Filter; q: string; onCounts: (counts: Counts) => void }) {
  const t = useT("m_marketing", "m_ui");
  const list = useLoad(async () => {
    const page = await fetchSubscribers({ q, status: status === "all" ? null : status });
    onCounts({ ...page.counts, newThisMonth: page.newThisMonth });
    return page;
  });
  const [more, setMore] = useState<{ rows: SubscriberRow[]; page: number }>({ rows: [], page: 1 });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  async function showMore() {
    setLoadingMore(true);
    setMoreError(null);
    try {
      const next = await fetchSubscribers({ q, status: status === "all" ? null : status, page: more.page + 1 });
      setMore({ rows: [...more.rows, ...next.rows], page: next.page });
    } catch (error) {
      setMoreError(error instanceof Error ? error.message : t("subs.noMatch"));
    } finally {
      setLoadingMore(false);
    }
  }

  if (list.loading && !list.data) return <LoadingBlock />;
  if (list.error && !list.data) return <ErrorState message={list.error} onRetry={() => void list.reload()} />;
  if (!list.data) return null;
  const rows = [...list.data.rows, ...more.rows];
  if (!rows.length) {
    return q || status !== "all" ? <EmptyState icon="search" title={t("subs.noMatch")} /> : <EmptyState icon="users" title={t("subs.emptyTitle")}>{t("subs.emptyBody")}</EmptyState>;
  }
  return (
    <>
      <T style={{ color: colors.inkSoft, fontSize: 14 }}>{t("subs.showing", { count: list.data.total })}</T>
      {rows.map((row) => <PersonCard key={row.id} row={row} />)}
      {moreError ? <Notice>{moreError}</Notice> : null}
      {more.page < list.data.pages ? <PillButton title={t("subs.more")} tone="white" size="md" busy={loadingMore} onPress={() => void showMore()} /> : null}
    </>
  );
}

function AddPerson({ onDone, onClose }: { onDone: (email: string) => void; onClose: () => void }) {
  const t = useT("m_marketing", "common");
  const [form, setForm] = useState<NewSubscriber>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<NewSubscriber>) => setForm((current) => ({ ...current, ...patch }));

  async function save() {
    if (!form.email.trim()) return setError(t("add.needEmail"));
    if (!form.emailOk) return setError(t("add.needConsent"));
    setBusy(true);
    setError(null);
    try {
      await addSubscriber(form);
      onDone(form.email.trim());
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : t("add.failed"));
    } finally {
      setBusy(false);
    }
  }

  const tick = (label: string, on: boolean, onChange: (on: boolean) => void) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 }}>
      <T style={{ flex: 1, fontSize: 15, lineHeight: 21 }}>{label}</T>
      <Toggle on={on} onChange={onChange} label={label} />
    </View>
  );

  return (
    <Card style={{ gap: 8 }}>
      <T weight="extrabold" style={{ fontSize: 17 }}>{t("subs.add")}</T>
      <Label>{t("add.email")}</Label>
      <Field value={form.email} onChangeText={(email) => set({ email })} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={200} placeholder="ada@gmail.com" />
      <Label>{t("add.name")}</Label>
      <Field value={form.name} onChangeText={(name) => set({ name })} maxLength={120} />
      <Label>{t("add.phone")}</Label>
      <Field value={form.phone} onChangeText={(phone) => set({ phone })} keyboardType="phone-pad" maxLength={40} placeholder="0803…" />
      <Label>{t("add.birthday")}</Label>
      <Field value={form.birthday} onChangeText={(birthday) => set({ birthday })} maxLength={20} placeholder="14/02" />
      <T style={{ color: colors.inkSoft, fontSize: 13.5 }}>{t("add.birthdayHint")}</T>
      <Label>{t("add.tags")}</Label>
      <Field value={form.tags} onChangeText={(tags) => set({ tags })} autoCapitalize="none" maxLength={400} placeholder="vip, lagos" />
      <T style={{ color: colors.inkSoft, fontSize: 13.5 }}>{t("add.tagsHint")}</T>
      {tick(t("add.emailOk"), form.emailOk, (emailOk) => set({ emailOk }))}
      {tick(t("add.textOk"), form.textOk, (textOk) => set({ textOk }))}
      <Label>{t("add.howAgreed")}</Label>
      <Field value={form.note} onChangeText={(note) => set({ note })} maxLength={300} placeholder={t("add.howPlaceholder")} />
      {tick(t("add.welcome"), form.welcome, (welcome) => set({ welcome }))}
      {error ? <Notice>{error}</Notice> : null}
      <PillButton title={t("add.save")} size="md" busy={busy} disabled={!form.emailOk || !form.email.trim()} onPress={() => void save()} />
      <LinkButton title={t("cancel")} color={colors.inkSoft} onPress={onClose} />
    </Card>
  );
}

export default function Subscribers() {
  const t = useT("m_marketing", "m_ui");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  // Bumped after adding someone, so the list loads again from the top.
  const [version, setVersion] = useState(0);

  return (
    <Screen title={t("link.subscribers")} sub={t("subs.sub")}>
      {note ? <Notice tone="success">{note}</Notice> : null}
      {counts ? (
        <Card style={{ flexDirection: "row", gap: 6 }}>
          {[
            [counts.active, t("subs.active")],
            [counts.newThisMonth, t("subs.new30")],
            [counts.unsubscribed, t("subs.unsubscribed")],
            [counts.bounced + counts.spam, t("subs.bounced")],
          ].map(([value, label]) => (
            <View key={String(label)} style={{ flex: 1, alignItems: "center" }}>
              <T weight="extrabold" style={{ fontSize: 20 }}>{String(value)}</T>
              <T style={{ color: colors.inkSoft, fontSize: 12.5, textAlign: "center" }}>{label}</T>
            </View>
          ))}
        </Card>
      ) : null}

      {adding ? (
        <AddPerson
          onClose={() => setAdding(false)}
          onDone={(email) => {
            setAdding(false);
            setNote(t("add.added", { email }));
            setVersion((value) => value + 1);
          }}
        />
      ) : (
        <PillButton title={t("subs.add")} size="md" onPress={() => { setNote(null); setAdding(true); }} />
      )}

      <Field
        value={search}
        onChangeText={(value) => {
          setSearch(value);
          if (!value.trim()) setQ("");
        }}
        onSubmitEditing={() => setQ(search.trim())}
        onBlur={() => setQ(search.trim())}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={100}
        placeholder={t("subs.search")}
        accessibilityLabel={t("subs.search")}
      />
      <ChipRow>
        {FILTERS.map((option) => (
          <Chip
            key={option.value}
            label={counts ? `${t(option.label)} ${option.value === "all" ? counts.all : counts[option.value]}` : t(option.label)}
            on={filter === option.value}
            onPress={() => setFilter(option.value)}
          />
        ))}
      </ChipRow>

      <People key={`${filter}|${q}|${version}`} status={filter} q={q} onCounts={setCounts} />

      <LinkButton title={t("subs.web")} color={colors.inkSoft} onPress={() => void openWeb("/home/marketing/subscribers")} />
    </Screen>
  );
}
