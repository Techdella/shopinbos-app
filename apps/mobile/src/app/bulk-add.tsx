import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FlatList, Pressable, ScrollView, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { naira } from "@shared/onboarding";
import { categoriesOf, eventLines, fieldFromKobo, filterItems, koboFromField, readiness, type BulkEvent, type BulkFilter, type BulkItem, type BulkT } from "@shared/bulk-products";
import type { UploadSnapshot } from "@shared/bulk-upload-queue";
import { List, Row, Seg, Small, Sub, Tile, Title } from "@/components/design";
import { AppIcon } from "@/components/icons";
import { KeyboardShift, useScrollToEndOnKeyboard } from "@/components/KeyboardShift";
import { ShareProductIcon } from "@/components/seller/ProductCode";
import { Sheet } from "@/components/Sheet";
import { BackButton, ButtonRow, Field, Mascot, Notice, PillButton, T, Toggle } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { WebBadge } from "@/components/WebBadge";
import { addPhotos, bulkApi, queueFor, type BulkSession, type PublishResult } from "@/lib/bulk-add";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { openWeb } from "@/lib/web";
import { colors, fonts, radii } from "@/theme";

// "Add many with Peggy" (shared/bulk-products.ts): pick up to 300 product photos at once, they upload in the
// background (3 at a time, retried, carried on when the app opens again) while Peggy reads them 10 at a time; price
// them by chatting ("bag 15k, dress 12,500", "all the shoes 20k", "1-20 na 5000") or in the list (filters, long-press
// to select many and set a price, stock or category); publish 20 at a time with progress. Sellers and suppliers.

const ROW = 84;
const EMPTY: UploadSnapshot = { total: 0, done: 0, failed: 0, uploading: 0, waiting: 0, fraction: 0 };
const money = (kobo: number) => naira(Math.round(kobo / 100));

function useQueue(sessionId: string | null) {
  const cache = useRef<{ key: string; value: UploadSnapshot }>({ key: "", value: EMPTY });
  const subscribe = useCallback((onChange: () => void) => (sessionId ? queueFor(sessionId).subscribe(onChange) : () => undefined), [sessionId]);
  const read = useCallback(() => {
    if (!sessionId) return EMPTY;
    const now = queueFor(sessionId).snapshot();
    const key = JSON.stringify(now);
    if (key !== cache.current.key) cache.current = { key, value: now };
    return cache.current.value;
  }, [sessionId]);
  return useSyncExternalStore(subscribe, read, read);
}

type Edit = { kind: "item"; item: BulkItem } | { kind: "bulk"; field: "price" | "stock" | "category" } | null;

export default function BulkAdd() {
  const t = useT("bulkAdd", "common");
  const tt: BulkT = (key, values) => t.dynamic(key, key, values);
  const { session: auth } = useSession();
  const role = auth?.user.user_metadata?.role === "supplier" ? "supplier" : "seller";
  const [session, setSession] = useState<BulkSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"chat" | "list">("chat");
  const [filter, setFilter] = useState<BulkFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<Edit>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [publishing, setPublishing] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ published: PublishResult["published"]; failed: PublishResult["failed"]; overLimit: number; live: boolean } | null>(null);
  const queue = useQueue(session?.id ?? null);
  const looking = useRef(false);
  const chat = useRef<ScrollView>(null);
  useScrollToEndOnKeyboard(chat);

  useEffect(() => {
    let alive = true;
    bulkApi
      .current()
      .then((found) => {
        if (!alive) return;
        setSession(found);
        // Photos still waiting from last time start again.
        if (found) queueFor(found.id);
      })
      .catch((loadError) => alive && setError(loadError instanceof Error ? loadError.message : String(loadError)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const pumpLook = useCallback(async (id: string) => {
    if (looking.current) return;
    looking.current = true;
    try {
      for (let round = 0; round < 40; round++) {
        const answer = await bulkApi.look(id);
        if (answer.session) setSession(answer.session);
        if (!answer.pending || !answer.drafted) break;
      }
    } catch {
      // The next refresh tries again.
    } finally {
      looking.current = false;
    }
  }, []);

  const busy = queue.uploading + queue.waiting > 0;
  useEffect(() => {
    if (!session?.id || (!busy && !session.summary.drafting)) return;
    const id = session.id;
    const timer = setInterval(() => {
      void bulkApi.get(id).then((fresh) => {
        setSession(fresh);
        if (fresh.summary.drafting) void pumpLook(id);
      }).catch(() => undefined);
    }, 3500);
    return () => clearInterval(timer);
  }, [session?.id, session?.summary.drafting, busy, pumpLook]);

  useEffect(() => {
    if (session?.id && queue.total && !busy) void bulkApi.get(session.id).then((fresh) => { setSession(fresh); void pumpLook(fresh.id); }).catch(() => undefined);
  }, [session?.id, queue.total, busy, pumpLook]);

  async function pick(source: "camera" | "library") {
    setError(null);
    setResult(null);
    const permission = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setError(source === "camera" ? t("pick.allowCamera") : t("pick.allowPhotos"));
    const current = session ?? (await bulkApi.open().catch((openError) => { setError(openError instanceof Error ? openError.message : String(openError)); return null; }));
    if (!current) return;
    if (!session) setSession(current);
    const room = current.max - current.items.length - queueFor(current.id).snapshot().waiting;
    if (room <= 0) return setError(t("upload.full"));
    const picked =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: Math.min(200, room), quality: 0.6, orderedSelection: true });
    if (picked.canceled || !picked.assets.length) return;
    addPhotos(current.id, picked.assets.slice(0, room));
  }

  async function act(run: () => Promise<BulkSession | null>) {
    setError(null);
    try {
      const fresh = await run();
      if (fresh) setSession(fresh);
    } catch (actError) {
      setError(actError instanceof Error ? actError.message : String(actError));
    }
  }

  async function send(text = draft) {
    const message = text.trim();
    if (!message || sending || !session) return;
    setDraft("");
    setSending(message);
    setError(null);
    try {
      const answer = await bulkApi.reply(session.id, message);
      if (answer.session) setSession(answer.session);
    } catch (sendError) {
      setDraft(message);
      setError(sendError instanceof Error ? sendError.message : t("chat.failed"));
    } finally {
      setSending(null);
      setTimeout(() => chat.current?.scrollToEnd({ animated: true }), 60);
    }
  }

  async function publish(ids?: string[]) {
    if (!session) return;
    setError(null);
    const total = ids?.length ?? session.ready;
    const done: PublishResult["published"] = [];
    let last: PublishResult | null = null;
    setPublishing({ done: 0, total });
    try {
      for (let round = 0; round < 30; round++) {
        last = await bulkApi.publish(session.id, live, ids);
        done.push(...last.published);
        setPublishing({ done: done.length, total });
        if (last.session) setSession(last.session);
        if (!last.remaining || !last.published.length) break;
      }
      setResult({ published: done, failed: last?.failed ?? [], overLimit: last?.overLimit ?? 0, live });
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : String(publishError));
    } finally {
      setPublishing(null);
    }
  }

  const items = session?.items ?? [];
  const shown = useMemo(() => filterItems(items, filter), [items, filter]);
  const categories = useMemo(() => categoriesOf(items, 6), [items]);
  const byNumber = useMemo(() => new Map(items.map((item) => [item.number, item])), [items]);
  const hasItems = items.length > 0 || queue.total > 0;
  const selecting = selected.size > 0;
  const allDone = result && result.published.length > 0 && !session?.ready && !result.failed.length;
  const productsPath = role === "supplier" ? "/supplier/products" : "/products";

  const back = () => (router.canGoBack() ? router.back() : router.replace(role === "supplier" ? "/supplier/products" : "/products"));

  if (allDone) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, alignItems: "stretch" }} testID="bulk-done">
          <View style={{ alignItems: "center", gap: 12, paddingTop: 24 }}>
            <Tile icon="check" tone="ok" size={88} />
            <Title size={28} style={{ textAlign: "center" }}>{t("done.title", { count: result!.published.length })}</Title>
            <Sub style={{ textAlign: "center" }}>{role === "supplier" ? t("done.subSupplier") : result!.live ? t("done.sub") : t("done.subDraft")}</Sub>
          </View>
          {role === "seller" && result!.live ? (
            <List>
              {result!.published.slice(0, 6).map((entry) => (
                <Row key={entry.productId} title={`${entry.number}. ${entry.name}`} sub={naira(entry.price)} right={<ShareProductIcon product={{ name: entry.name, retailPrice: entry.price, shortCode: entry.shortCode, url: entry.url }} />} />
              ))}
            </List>
          ) : null}
          <PillButton title={t("done.viewAll")} onPress={() => router.replace(productsPath as never)} />
          <PillButton title={t("done.addMore")} tone="white" onPress={() => setResult(null)} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const progress = queue.total > 0 && (busy || queue.failed > 0 || (session?.summary.drafting ?? 0) > 0) ? (
    <View style={{ backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 6, marginHorizontal: 16 }} testID="bulk-progress" accessibilityLiveRegion="polite">
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <T weight="bold" style={{ fontSize: 14 }}>{t("upload.progress", { done: queue.done, total: queue.total })}</T>
        {session && session.summary.total > 0 ? <T style={{ fontSize: 13, color: colors.inkSoft }}>{t("upload.reading", { done: session.summary.total - session.summary.drafting, total: session.summary.total })}</T> : null}
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.canvas, overflow: "hidden" }}>
        <View style={{ height: 8, width: `${Math.round(queue.fraction * 100)}%`, backgroundColor: colors.accent }} />
      </View>
      {queue.failed > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <T style={{ color: colors.danger, fontSize: 13.5, flex: 1 }}>{t("upload.failed", { count: queue.failed })}</T>
          <PillButton size="sm" tone="white" title={t("upload.retry")} onPress={() => session && queueFor(session.id).retryFailed()} />
        </View>
      ) : busy ? <Small>{t("upload.keepOpen")}</Small> : null}
    </View>
  ) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardShift>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10 }}>
          <BackButton onPress={back} />
          <Mascot name="peggy" size={36} />
          <T weight="extrabold" style={{ fontSize: 17, flex: 1 }} numberOfLines={1}>{t("title")}</T>
          {hasItems ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t("pick.more")} onPress={() => void pick("library")} hitSlop={6} style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
              <AppIcon name="plus" size={20} />
            </Pressable>
          ) : null}
        </View>

        {error ? <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}><Notice>{error}</Notice></View> : null}

        {!hasItems ? (
          <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
            <View style={{ alignItems: "center", gap: 12, paddingTop: 8 }}>
              <Tile icon="image" tone="peach" size={88} />
              <Title size={28} style={{ textAlign: "center" }}>{t("pick.title")}</Title>
              <Sub style={{ textAlign: "center" }}>{t("pick.sub")}</Sub>
            </View>
            <PillButton testID="bulk-choose" tone="accent" icon="image" title={t("pick.choose")} busy={loading} onPress={() => void pick("library")} />
            <PillButton tone="white" icon="camera" title={t("pick.camera")} disabled={loading} onPress={() => void pick("camera")} />
            <View style={{ gap: 8 }}>
              <Small>{t("other.title")}</Small>
              <List>
                {role === "seller" ? <Row lead={<Tile icon="doc" tone="blue" />} title={t("other.csv")} sub={t("other.csvSub")} right={<WebBadge />} onPress={() => void openWeb("/products/import")} /> : null}
                <Row lead={<Tile icon="camera" tone="butter" />} title={t("other.one")} onPress={() => router.push((role === "supplier" ? "/supplier/product/new" : "/add-products") as never)} chevron />
              </List>
            </View>
          </ScrollView>
        ) : (
          <>
            {progress}
            <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }} accessibilityRole="tablist">
              <Seg label={t("tab.chat")} on={tab === "chat"} onPress={() => setTab("chat")} />
              <Seg label={t("tab.list", { count: items.length })} on={tab === "list"} onPress={() => setTab("list")} />
            </View>

            {tab === "chat" ? (
              <>
                <ScrollView ref={chat} contentContainerStyle={{ padding: 16, gap: 12 }} onContentSizeChange={() => chat.current?.scrollToEnd({ animated: false })} testID="bulk-thread">
                  {session?.thread.map((event) => <Turn key={event.id} event={event} items={items} byNumber={byNumber} t={tt} />)}
                  {session?.groups.slice(0, 3).map((group) => (
                    <View key={group.key} style={{ alignSelf: "flex-start", maxWidth: "94%", backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 10 }}>
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        {group.numbers.slice(0, 5).map((n) => <Thumb key={n} uri={byNumber.get(n)?.photos[0]} size={44} />)}
                      </View>
                      <T style={{ fontSize: 14.5, lineHeight: 20 }}>{group.kind === "colours" ? t("group.colours", { numbers: group.numbers.join(", "), name: group.name.toLowerCase(), count: group.colours.length }) : t("group.angles", { numbers: group.numbers.join(", "), name: group.name.toLowerCase() })}</T>
                      <ButtonRow labels={[t("group.join"), t("group.no")]} size="sm">
                        <PillButton size="sm" style={{ flex: 1 }} title={t("group.join")} onPress={() => session && void act(() => bulkApi.items(session.id, { op: "join", ids: group.numbers.map((n) => byNumber.get(n)?.id).filter(Boolean), kind: group.kind }))} />
                        <PillButton size="sm" tone="white" style={{ flex: 1 }} title={t("group.no")} onPress={() => session && void act(() => bulkApi.items(session.id, { op: "dismiss", key: group.key }))} />
                      </ButtonRow>
                    </View>
                  ))}
                  {sending ? (
                    <>
                      <Bubble mine text={sending} />
                      <T style={{ color: colors.inkSoft }}>{t("chat.thinking")}</T>
                    </>
                  ) : null}
                </ScrollView>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 6 }}>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    placeholder={t("chat.placeholder")}
                    placeholderTextColor={colors.inkFaint}
                    onSubmitEditing={() => void send()}
                    returnKeyType="send"
                    accessibilityLabel={t("chat.label")}
                    style={{ flex: 1, height: 52, borderRadius: radii.pill, backgroundColor: colors.surface, paddingHorizontal: 18, fontSize: 15, fontFamily: fonts.regular, color: colors.ink }}
                  />
                  <VoiceInput variant="icon" value={draft} onChange={setDraft} context="product names and prices for Peggy" disabled={Boolean(sending)} />
                  <Pressable accessibilityRole="button" accessibilityLabel={t("chat.send")} disabled={!draft.trim() || Boolean(sending)} onPress={() => void send()} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center", opacity: !draft.trim() || sending ? 0.5 : 1 }}>
                    <AppIcon name="send" size={20} color="#FFFFFF" />
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
                  {(["all", "needsPrice", "needsName", "ready"] as const).map((key) => (
                    <Seg key={key} label={t(`filter.${key}`)} count={filterItems(items, key).length} on={filter === key} onPress={() => setFilter(key)} />
                  ))}
                  {categories.map((category) => <Seg key={category.name} label={category.name} count={category.count} on={filter === `cat:${category.name}`} onPress={() => setFilter(`cat:${category.name}`)} />)}
                </ScrollView>
                {selecting ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingBottom: 8, alignItems: "center" }} testID="bulk-select-bar">
                    <T weight="bold" style={{ fontSize: 14 }}>{t("select.count", { count: selected.size })}</T>
                    <PillButton size="sm" tone="white" title={t("bulk.price")} onPress={() => setEdit({ kind: "bulk", field: "price" })} />
                    <PillButton size="sm" tone="white" title={t("bulk.stock")} onPress={() => setEdit({ kind: "bulk", field: "stock" })} />
                    <PillButton size="sm" tone="white" title={t("bulk.category")} onPress={() => setEdit({ kind: "bulk", field: "category" })} />
                    {selected.size > 1 ? <PillButton size="sm" tone="white" title={t("bulk.join")} onPress={() => { if (session) void act(() => bulkApi.items(session.id, { op: "join", ids: [...selected], kind: "angles" })); setSelected(new Set()); }} /> : null}
                    <PillButton size="sm" tone="white" title={t("bulk.remove")} onPress={() => { if (session) void act(() => bulkApi.items(session.id, { op: "remove", ids: [...selected] })); setSelected(new Set()); }} />
                    <PillButton size="sm" tone="white" title={t("select.cancel")} onPress={() => setSelected(new Set())} />
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingBottom: 6 }}>
                    <Pressable onPress={() => setSelected(new Set(shown.filter((item) => !item.productId).map((item) => item.id)))} hitSlop={8}>
                      <T weight="bold" style={{ fontSize: 14, color: colors.accentInk }}>{t("select.all")}</T>
                    </Pressable>
                  </View>
                )}
                <FlatList
                  data={shown}
                  keyExtractor={(item) => item.id}
                  getItemLayout={(_, index) => ({ length: ROW, offset: ROW * index, index })}
                  initialNumToRender={12}
                  windowSize={7}
                  removeClippedSubviews
                  contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12 }}
                  ListEmptyComponent={<Small style={{ textAlign: "center", padding: 24 }}>{t("empty.none")}</Small>}
                  testID="bulk-list"
                  renderItem={({ item }) => (
                    <ItemRow
                      item={item}
                      t={tt}
                      selected={selected.has(item.id)}
                      onPress={() => (selecting ? toggle(item.id) : !item.productId && setEdit({ kind: "item", item }))}
                      onLongPress={() => !item.productId && toggle(item.id)}
                    />
                  )}
                />
              </>
            )}

            <View style={{ paddingHorizontal: 16, paddingBottom: 10, paddingTop: 6, gap: 8, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.canvas }}>
              {result && result.overLimit > 0 ? <Notice tone="info">{t("publish.overLimit", { count: result.overLimit })}</Notice> : null}
              {result && result.failed.length > 0 ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <T style={{ flex: 1, color: colors.danger }}>{t("publish.failed", { count: result.failed.length })}</T>
                  <PillButton size="sm" tone="white" title={t("upload.retry")} onPress={() => void publish(result.failed.map((entry) => entry.itemId))} />
                </View>
              ) : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Toggle on={live} onChange={setLive} label={role === "supplier" ? t("publish.liveSupplier") : t("publish.live")} />
                <T style={{ flex: 1, fontSize: 14 }}>{live ? (role === "supplier" ? t("publish.liveSupplier") : t("publish.live")) : t("publish.draft")}</T>
              </View>
              <PillButton testID="bulk-publish" tone="accent" disabled={!session?.ready || Boolean(publishing)} title={publishing ? t("publish.progress", { done: publishing.done, total: publishing.total }) : t("publish.button", { count: session?.ready ?? 0 })} onPress={() => void publish()} />
            </View>
          </>
        )}

        <EditSheet
          edit={edit}
          t={tt}
          tt={tt}
          count={selected.size}
          onClose={() => setEdit(null)}
          onSave={(patch) => {
            if (!session || !edit) return;
            if (edit.kind === "item") void act(() => bulkApi.items(session.id, { op: "edit", id: edit.item.id, patch }));
            else {
              void act(() => bulkApi.items(session.id, { op: "bulk", ids: [...selected], patch }));
              setSelected(new Set());
            }
            setEdit(null);
          }}
          onRemove={(item) => {
            if (session) void act(() => bulkApi.items(session.id, { op: "remove", ids: [item.id] }));
            setEdit(null);
          }}
          onSplit={(item) => {
            if (session) void act(() => bulkApi.items(session.id, { op: "split", id: item.id }));
            setEdit(null);
          }}
        />
      </KeyboardShift>
    </SafeAreaView>
  );

  function toggle(id: string) {
    setSelected((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
}

function Thumb({ uri, size }: { uri?: string; size: number }) {
  return uri ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 10, backgroundColor: colors.canvas }} contentFit="cover" /> : <View style={{ width: size, height: size, borderRadius: 10, backgroundColor: colors.canvas }} />;
}

function Bubble({ text, mine }: { text: string; mine?: boolean }) {
  return mine ? (
    <View style={{ alignSelf: "flex-end", marginLeft: 40, backgroundColor: colors.ink, borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 16, paddingVertical: 12 }}>
      <T style={{ color: "#FFFFFF", fontSize: 15, lineHeight: 21 }}>{text}</T>
    </View>
  ) : (
    <View style={{ alignSelf: "flex-start", marginRight: 24, backgroundColor: colors.surface, borderRadius: 20, borderTopLeftRadius: 6, paddingHorizontal: 16, paddingVertical: 12 }}>
      <T style={{ fontSize: 15, lineHeight: 21 }}>{text}</T>
    </View>
  );
}

function Turn({ event, items, byNumber, t }: { event: BulkEvent; items: BulkItem[]; byNumber: Map<number, BulkItem>; t: BulkT }) {
  if (event.from === "me") return <Bubble mine text={event.kind === "text" ? event.text : ""} />;
  const lines = eventLines(event, items, t, money);
  const cards = event.kind === "intro" ? event.numbers.slice(0, 8).map((n) => byNumber.get(n)).filter((item): item is BulkItem => Boolean(item)) : [];
  return (
    <View style={{ gap: 8 }}>
      {lines.slice(0, 1).map((line, index) => <Bubble key={index} text={line} />)}
      {cards.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginRight: 24 }} testID="bulk-cards">
          {cards.map((item) => (
            <View key={item.id} style={{ width: "48%", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 6 }}>
              <Thumb uri={item.photos[0]} size={44} />
              <View style={{ flex: 1 }}>
                <T weight="bold" style={{ fontSize: 13 }} numberOfLines={2}>{item.number}. {item.name || t("item.unnamed", { n: item.number })}</T>
                {item.hintLowKobo ? <T style={{ fontSize: 12, color: colors.inkSoft }} numberOfLines={1}>~{money(item.hintLowKobo)}</T> : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}
      {lines.slice(1).map((line, index) => <Bubble key={index + 1} text={line} />)}
    </View>
  );
}

function ItemRow({ item, t, selected, onPress, onLongPress }: { item: BulkItem; t: BulkT; selected: boolean; onPress: () => void; onLongPress: () => void }) {
  const state = readiness(item);
  const sub =
    state === "published" ? t("item.published") : state === "drafting" ? t("item.reading") : item.publishError ? t("item.failed") : item.priceKobo ? [money(item.priceKobo), item.stock !== null ? `${item.stock}` : "", item.category].filter(Boolean).join(" · ") : item.hintLowKobo ? t("item.hint", { low: money(item.hintLowKobo), high: money(item.hintHighKobo ?? item.hintLowKobo) }) : t("filter.needsPrice");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({ height: ROW - 8, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 10, borderRadius: 18, borderWidth: selected ? 2 : 1, borderColor: selected ? colors.accent : colors.line, backgroundColor: selected ? colors.peach : colors.surface, opacity: pressed ? 0.85 : 1 })}
    >
      <View>
        <Thumb uri={item.photos[0]} size={56} />
        {item.photos.length > 1 ? (
          <View style={{ position: "absolute", right: -4, bottom: -4, backgroundColor: colors.ink, borderRadius: 10, paddingHorizontal: 6 }}>
            <T weight="bold" style={{ color: "#FFFFFF", fontSize: 11 }}>{item.photos.length}</T>
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <T weight="extrabold" style={{ fontSize: 15 }} numberOfLines={1}>{item.number}. {item.name || t("item.unnamed", { n: item.number })}</T>
        <T style={{ fontSize: 13.5, color: state === "needsPrice" || item.publishError ? colors.accentInk : colors.inkSoft }} numberOfLines={1}>{sub}</T>
      </View>
      {state === "ready" ? <AppIcon name="check" size={18} color={colors.success} /> : null}
    </Pressable>
  );
}

function EditSheet({ edit, t, tt, count, onClose, onSave, onRemove, onSplit }: { edit: Edit; t: BulkT; tt: BulkT; count: number; onClose: () => void; onSave: (patch: Record<string, unknown>) => void; onRemove: (item: BulkItem) => void; onSplit: (item: BulkItem) => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [category, setCategory] = useState("");
  useEffect(() => {
    if (edit?.kind === "item") {
      setName(edit.item.name);
      setPrice(fieldFromKobo(edit.item.priceKobo));
      setStock(edit.item.stock === null ? "" : String(edit.item.stock));
      setCategory(edit.item.category);
    } else {
      setName("");
      setPrice("");
      setStock("");
      setCategory("");
    }
  }, [edit]);
  if (!edit) return null;
  const item = edit.kind === "item" ? edit.item : null;
  const field = edit.kind === "bulk" ? edit.field : null;
  const title = item ? `${item.number}. ${item.name || tt("item.unnamed", { n: item.number })}` : field === "price" ? t("bulk.priceFor", { count }) : field === "stock" ? t("bulk.stockFor", { count }) : t("bulk.categoryFor", { count });
  const save = () => {
    const patch: Record<string, unknown> = {};
    if (item || field === "price") {
      const kobo = koboFromField(price);
      if (kobo || (item && !price.trim())) patch.priceKobo = kobo;
    }
    if (item || field === "stock") patch.stock = stock.trim() ? Number(stock.replace(/\D/g, "")) || 0 : null;
    if (item || field === "category") patch.category = category.trim();
    if (item) patch.name = name.trim();
    if (field && Object.values(patch).every((value) => value === null || value === "")) return onClose();
    onSave(patch);
  };
  return (
    <Sheet visible onClose={onClose} title={title} testID="bulk-edit-sheet">
      {item ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {item.photos.slice(0, 4).map((uri) => <Thumb key={uri} uri={uri} size={64} />)}
        </View>
      ) : null}
      {item ? <Field accessibilityLabel={t("item.name")} placeholder={t("item.name")} value={name} onChangeText={setName} /> : null}
      {item || field === "price" ? <Field accessibilityLabel={t("item.price")} placeholder={item?.hintLowKobo ? t("item.hint", { low: money(item.hintLowKobo), high: money(item.hintHighKobo ?? item.hintLowKobo) }) : t("item.price")} keyboardType="numeric" value={price} onChangeText={setPrice} autoFocus={!item} /> : null}
      {item || field === "stock" ? <Field accessibilityLabel={t("item.stock")} placeholder={t("item.stock")} keyboardType="number-pad" value={stock} onChangeText={setStock} /> : null}
      {item || field === "category" ? <Field accessibilityLabel={t("item.category")} placeholder={t("item.category")} value={category} onChangeText={setCategory} /> : null}
      {item ? (
        <ButtonRow labels={[t("item.remove"), ...(item.photos.length > 1 ? [t("item.split")] : [])]} size="sm">
          <PillButton size="sm" tone="white" style={{ flex: 1 }} title={t("item.remove")} onPress={() => onRemove(item)} />
          {item.photos.length > 1 ? <PillButton size="sm" tone="white" style={{ flex: 1 }} title={t("item.split")} onPress={() => onSplit(item)} /> : null}
        </ButtonRow>
      ) : null}
      <PillButton title={field ? t("bulk.apply") : t("item.done")} onPress={save} />
    </Sheet>
  );
}
