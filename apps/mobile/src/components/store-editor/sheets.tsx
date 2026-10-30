import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { AppIcon } from "@/components/icons";
import { Field, PillButton, T } from "@/components/ui";
import { useT } from "@/lib/i18n";
import {
  BLOCK_GROUPS,
  BUTTON_CHOICES,
  CUSTOM_ACCENTS,
  FONT_CHOICES,
  THEME_PRESETS,
  applyAccent,
  applyThemePreset,
  applyTokens,
  blocksFor,
  buttonChoiceOf,
  findPage,
  fontChoiceOf,
  isChrome,
  moveSectionTo,
  pageRows,
  pickedProductIds,
  productsLayoutOf,
  productsShowOf,
  readPhoto,
  setProductsLayout,
  setProductsShow,
  themePresetOf,
  toggleSection,
  type BlockGroup,
  type EdSection,
  type EditorBlockDef,
  type EditorLoad,
  type ProductsLayout,
  type ProductsShow,
  type Renderer,
} from "@/lib/store-editor";
import { colors, fonts, radii } from "@/theme";
import { Chip, ChipRow, DoneButton, EditorSheet, SheetLabel, Swatch } from "./parts";
import type { StoreEditorState } from "./useStoreEditor";

export interface SheetContext {
  ed: StoreEditorState;
  page: string;
  renderer: Renderer;
  load: EditorLoad;
  label: (section: EdSection) => string;
}

// ─── Add a section (SE-07) ───────────────────────────────────────────────────

export function AddSheet({ ctx, afterId, onAdd, onClose }: { ctx: SheetContext; afterId: string | null; onAdd: (block: EditorBlockDef) => void; onClose: () => void }) {
  const t = useT("storeEditor");
  const [group, setGroup] = useState<BlockGroup>("popular");
  const sections = findPage(ctx.ed.snapshot, ctx.page)?.sections ?? [];
  const after = sections.find((section) => section.id === afterId);
  const blocks = blocksFor(ctx.renderer, group).filter((block) => ctx.load.catalog[block.id]);
  const photo = readPhoto(sections.find((section) => readPhoto(section))) || ctx.load.store.storeProducts.find((product) => product.images[0])?.images[0] || "";
  const productPhotos = ctx.load.store.storeProducts.map((product) => product.images[0]).filter(Boolean).slice(0, 4) as string[];
  return (
    <EditorSheet
      testID="editor-add-sheet"
      title={t("add.title")}
      dim
      height="76%"
      onClose={onClose}
      right={<T weight="semibold" numberOfLines={1} style={{ fontSize: 12.5, color: colors.inkSoft, flexShrink: 1 }}>{after ? t("add.under", { name: ctx.label(after) }) : t("add.top")}</T>}
    >
      <ChipRow>
        {BLOCK_GROUPS.map((entry) => <Chip key={entry} label={t(`group.${entry}`)} on={group === entry} onPress={() => setGroup(entry)} />)}
      </ChipRow>
      {blocks.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 14, columnGap: 10 }}>
          {blocks.map((block) => (
            <Pressable
              key={block.id}
              testID={`add-${block.id}`}
              accessibilityRole="button"
              accessibilityLabel={t.dynamic(block.label, block.id)}
              onPress={() => onAdd(block)}
              style={({ pressed }) => ({ width: "31%", flexGrow: 1, maxWidth: "32%", gap: 6, opacity: pressed ? 0.8 : 1 })}
            >
              <View style={{ height: 84, borderRadius: 14, overflow: "hidden", backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line }}>
                <BlockThumb thumb={block.thumb} photo={photo} productPhotos={productPhotos} />
              </View>
              <T weight="bold" numberOfLines={2} style={{ fontSize: 12, textAlign: "center" }}>{t.dynamic(block.label, block.id)}</T>
            </Pressable>
          ))}
        </View>
      ) : (
        <T style={{ fontSize: 14, color: colors.inkSoft }}>{t("add.none")}</T>
      )}
    </EditorSheet>
  );
}

/** The little pictures in the Add sheet (drawn, with the shop's own photos where there are some). */
function BlockThumb({ thumb, photo, productPhotos }: { thumb: EditorBlockDef["thumb"]; photo: string; productPhotos: string[] }) {
  const bar = (width: number | `${number}%`, height: number, dark = false) => <View style={{ width, height, borderRadius: 4, backgroundColor: dark ? colors.ink : colors.lineStrong }} />;
  switch (thumb) {
    case "banner":
      return photo ? <Image source={{ uri: photo }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : <View style={{ flex: 1, backgroundColor: colors.peach }} />;
    case "products":
      return (
        <View style={{ flex: 1, padding: 8, flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
          {[0, 1, 2, 3].map((index) => (
            <View key={index} style={{ width: "47%", height: "46%", borderRadius: 5, overflow: "hidden", backgroundColor: colors.grayTint }}>
              {productPhotos[index] ? <Image source={{ uri: productPhotos[index] }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : null}
            </View>
          ))}
        </View>
      );
    case "photoText":
      return (
        <View style={{ flex: 1, flexDirection: "row", gap: 6, padding: 8 }}>
          <View style={{ width: "50%", borderRadius: 6, overflow: "hidden", backgroundColor: colors.peach }}>{photo ? <Image source={{ uri: photo }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : null}</View>
          <View style={{ flex: 1, justifyContent: "center", gap: 5 }}>{bar("100%", 7, true)}{bar("100%", 4)}{bar("70%", 4)}</View>
        </View>
      );
    case "reviews":
      return <View style={{ padding: 10, gap: 6 }}><T style={{ color: "#FFB020", fontSize: 13, letterSpacing: 1 }}>★★★★★</T>{bar("100%", 5)}{bar("60%", 5)}</View>;
    case "countdown":
      return (
        <View style={{ flex: 1, padding: 10, backgroundColor: colors.inkFill, justifyContent: "center", gap: 4 }}>
          <View style={{ width: "70%", height: 5, borderRadius: 3, backgroundColor: "#FFB18F" }} />
          <T style={{ fontFamily: fonts.displayBold, fontSize: 18, color: "#FFFFFF" }}>02:14:09</T>
        </View>
      );
    case "video":
      return (
        <View style={{ flex: 1, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }}>
          {photo ? <Image source={{ uri: photo }} style={{ position: "absolute", width: "100%", height: "100%", opacity: 0.7 }} contentFit="cover" /> : null}
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}><AppIcon name="play" size={12} color={colors.ink} /></View>
        </View>
      );
    case "faq":
      return (
        <View style={{ padding: 8, gap: 5 }}>
          {[0, 1, 2].map((index) => (
            <View key={index} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: 4 }}>
              {bar("70%", 5, true)}
              <T weight="bold" style={{ fontSize: 9 }}>+</T>
            </View>
          ))}
        </View>
      );
    case "whatsapp":
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <View style={{ backgroundColor: "#16794A", borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", gap: 5, alignItems: "center" }}>
            <AppIcon name="whatsapp" size={13} color="#FFFFFF" />
            <View style={{ width: 30, height: 5, borderRadius: 3, backgroundColor: "#FFFFFF" }} />
          </View>
        </View>
      );
    case "delivery":
      return (
        <View style={{ flex: 1, padding: 10, justifyContent: "center", gap: 7 }}>
          <View style={{ flexDirection: "row", gap: 5, alignItems: "center" }}><AppIcon name="truck" size={14} color={colors.ink} />{bar("60%", 5)}</View>
          <View style={{ flexDirection: "row", gap: 5, alignItems: "center" }}><AppIcon name="coin" size={14} color={colors.ink} />{bar("50%", 5)}</View>
        </View>
      );
    case "instagram":
      return (
        <View style={{ flex: 1, padding: 6, flexDirection: "row", flexWrap: "wrap", gap: 3 }}>
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <View key={index} style={{ width: "31%", height: "47%", borderRadius: 4, overflow: "hidden", backgroundColor: colors.grayTint }}>
              {productPhotos[index % Math.max(1, productPhotos.length)] ? <Image source={{ uri: productPhotos[index % productPhotos.length] }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : null}
            </View>
          ))}
        </View>
      );
    case "newsletter":
      return (
        <View style={{ padding: 10, gap: 6 }}>
          {bar("80%", 7, true)}
          <View style={{ flexDirection: "row", gap: 4 }}>
            <View style={{ flex: 1, height: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.lineStrong }} />
            <View style={{ width: 22, height: 16, borderRadius: 8, backgroundColor: colors.ink }} />
          </View>
        </View>
      );
    default:
      return <View style={{ padding: 12, gap: 6 }}>{bar("70%", 9, true)}{bar("100%", 5)}{bar("85%", 5)}</View>;
  }
}

// ─── Sections: drag to reorder, hide without deleting (SE-09) ────────────────

const ROW = 62;

export function SectionsSheet({ ctx, onAdd, onClose }: { ctx: SheetContext; onAdd: () => void; onClose: () => void }) {
  const t = useT("storeEditor");
  const page = findPage(ctx.ed.snapshot, ctx.page);
  const sections = page?.sections ?? [];
  const body = sections.filter((section) => !isChrome(section.kind));
  const [drag, setDrag] = useState<{ id: string; dy: number } | null>(null);
  // While dragging: where the row started and how far the list already moved it.
  const dragging = useRef<{ id: string; start: number; at: number } | null>(null);
  const ctxRef = useRef(ctx);
  useLayoutEffect(() => {
    ctxRef.current = ctx;
  });

  // One responder per section, made once: the drag keeps going while the list re-orders under the finger.
  const [responders] = useState(() => new Map<string, ReturnType<typeof PanResponder.create>>());
  const responderFor = (id: string) => {
    const known = responders.get(id);
    if (known) return known;
    const bodyOf = () => (findPage(ctxRef.current.ed.snapshot, ctxRef.current.page)?.sections ?? []).filter((entry) => !isChrome(entry.kind));
    const made = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const start = bodyOf().findIndex((entry) => entry.id === id);
        if (start < 0) return;
        dragging.current = { id, start, at: start };
        setDrag({ id, dy: 0 });
      },
      onPanResponderMove: (_event, gesture) => {
        const state = dragging.current;
        if (!state) return;
        const target = Math.max(0, Math.min(bodyOf().length - 1, state.start + Math.round(gesture.dy / ROW)));
        if (target !== state.at) {
          // The page above moves with the finger: each new place is drawn at once (one undo step for the drag).
          ctxRef.current.ed.commit((current) => moveSectionTo(current, ctxRef.current.page, id, target), `drag:${id}`);
          state.at = target;
        }
        setDrag({ id, dy: gesture.dy - (state.at - state.start) * ROW });
      },
      onPanResponderRelease: () => {
        dragging.current = null;
        setDrag(null);
      },
      onPanResponderTerminate: () => {
        dragging.current = null;
        setDrag(null);
      },
    });
    responders.set(id, made);
    return made;
  };

  const row = (section: EdSection, bodyIndex: number | null) => {
    const hidden = section.visible === false;
    const photo = readPhoto(section);
    const lifted = drag?.id === section.id;
    const name = ctx.label(section);
    const fixed = bodyIndex === null;
    return (
      <View
        key={section.id}
        style={{ height: ROW, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface, ...(lifted ? { transform: [{ translateY: drag!.dy }], zIndex: 5, boxShadow: "0px 10px 24px -8px rgba(22,20,31,0.3)", borderRadius: 12 } : null) }}
      >
        <View
          {...(fixed ? {} : responderFor(section.id).panHandlers)}
          accessibilityRole="adjustable"
          accessibilityLabel={t("sections.drag", { name })}
          accessibilityActions={fixed ? undefined : [{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={fixed ? undefined : (event) => ctx.ed.commit((current) => moveSectionTo(current, ctx.page, section.id, bodyIndex! + (event.nativeEvent.actionName === "increment" ? 1 : -1)))}
          style={{ width: 32, height: ROW, alignItems: "center", justifyContent: "center", opacity: fixed ? 0.25 : 1 }}
        >
          <AppIcon name="grip" size={20} color={colors.inkFaint} />
        </View>
        <View style={{ width: 56, height: 40, borderRadius: 9, overflow: "hidden", backgroundColor: colors.grayTint }}>
          {photo ? <Image source={{ uri: photo }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : null}
        </View>
        <T weight="bold" numberOfLines={1} style={{ flex: 1, fontSize: 14.5, color: hidden ? colors.inkFaint : colors.ink, textDecorationLine: hidden ? "line-through" : "none" }}>{name}</T>
        {section.kind === "header" || section.kind === "footer" ? (
          <View style={{ width: 44 }} />
        ) : (
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: !hidden }}
            accessibilityLabel={hidden ? t("sections.show", { name }) : t("sections.hide", { name })}
            onPress={() => ctx.ed.commit((current) => toggleSection(current, ctx.page, section.id, hidden))}
            hitSlop={6}
            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
          >
            <AppIcon name={hidden ? "eyeOff" : "eye"} size={20} color={colors.inkFaint} />
          </Pressable>
        )}
      </View>
    );
  };

  const head = sections.filter((section) => isChrome(section.kind) && section.kind !== "footer");
  const foot = sections.filter((section) => section.kind === "footer");
  return (
    <EditorSheet testID="editor-sections-sheet" title={t("sections.title", { page: page?.title ?? "" })} onClose={onClose} height="62%" scroll={!drag}>
      <View style={{ backgroundColor: colors.peach, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 }}>
        <T style={{ fontSize: 12.5, color: colors.accentInk }}>{t("sections.hint")}</T>
      </View>
      <View>
        {head.map((section) => row(section, null))}
        {body.map((section, index) => row(section, index))}
        {foot.map((section) => row(section, null))}
      </View>
      <PillButton testID="sections-add" title={t("sections.add")} icon="plus" tone="white" size="sm" onPress={onAdd} />
    </EditorSheet>
  );
}

// ─── Theme: colours, headline font, buttons (SE-10) ──────────────────────────

export function ThemeSheet({ ctx, onClose }: { ctx: SheetContext; onClose: () => void }) {
  const t = useT("storeEditor");
  const tokens = ctx.ed.snapshot.themeTokens;
  const preset = themePresetOf(tokens);
  const font = fontChoiceOf(tokens);
  const buttons = buttonChoiceOf(tokens);
  const [custom, setCustom] = useState(false);
  const accent = typeof tokens.accent === "string" ? tokens.accent.toUpperCase() : "";
  const headlineFont: Record<string, string | undefined> = { bold: fonts.display, elegant: undefined, clean: fonts.semibold };
  return (
    <EditorSheet testID="editor-theme-sheet" title={t("theme.title")} onClose={onClose}>
      <SheetLabel>{t("theme.colours")}</SheetLabel>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {THEME_PRESETS.map((entry) => (
          <Pressable key={entry.id} testID={`theme-${entry.id}`} accessibilityRole="radio" accessibilityState={{ checked: preset?.id === entry.id }} accessibilityLabel={t.dynamic(entry.label, entry.id)} onPress={() => { setCustom(false); ctx.ed.commit((current) => applyThemePreset(current, entry.id), "theme"); }} style={{ alignItems: "center", gap: 6 }}>
            <Swatch colours={entry.swatch} on={preset?.id === entry.id} />
            <T weight="semibold" style={{ fontSize: 11.5 }}>{t.dynamic(entry.label, entry.id)}</T>
          </Pressable>
        ))}
        <Pressable testID="theme-custom" accessibilityRole="button" accessibilityLabel={t("theme.custom")} onPress={() => setCustom(!custom)} style={{ alignItems: "center", gap: 6 }}>
          <View style={{ width: 55, height: 55, borderRadius: 28, borderWidth: !preset || custom ? 2 : 0, borderColor: colors.ink, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.grayTint, alignItems: "center", justifyContent: "center" }}><AppIcon name="plus" size={20} color={colors.ink} /></View>
          </View>
          <T weight="semibold" style={{ fontSize: 11.5 }}>{t("theme.custom")}</T>
        </Pressable>
      </View>
      {custom ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {CUSTOM_ACCENTS.map((hex) => (
            <Pressable key={hex} accessibilityRole="radio" accessibilityState={{ checked: accent === hex }} accessibilityLabel={hex} onPress={() => ctx.ed.commit((current) => applyAccent(current, hex), "theme")}>
              <Swatch colours={[hex]} on={accent === hex} size={34} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <SheetLabel>{t("theme.font")}</SheetLabel>
      <ChipRow>
        {FONT_CHOICES.map((entry) => (
          <Chip key={entry.id} testID={`font-${entry.id}`} label={t.dynamic(entry.label, entry.id)} on={font === entry.id} fontFamily={headlineFont[entry.id] ?? (entry.id === "elegant" ? "serif" : undefined)} onPress={() => ctx.ed.commit((current) => applyTokens(current, entry.tokens), "font")} />
        ))}
      </ChipRow>
      <SheetLabel>{t("theme.buttons")}</SheetLabel>
      <ChipRow>
        {BUTTON_CHOICES.map((entry) => (
          <Chip key={entry.id} testID={`buttons-${entry.id}`} label={t.dynamic(entry.label, entry.id)} on={buttons === entry.id} style={{ borderRadius: entry.radius }} onPress={() => ctx.ed.commit((current) => applyTokens(current, entry.tokens), "buttons")} />
        ))}
      </ChipRow>
      <Pressable accessibilityRole="link" onPress={() => router.push("/shop-edit" as never)} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <AppIcon name="settings" size={18} color={colors.inkSoft} />
        <T weight="semibold" style={{ flex: 1, fontSize: 14, color: colors.inkSoft }}>{t("theme.more")}</T>
        <AppIcon name="chevron" size={16} color={colors.inkSoft} />
      </Pressable>
    </EditorSheet>
  );
}

// ─── Pages: switch or add a page (SE-15) ─────────────────────────────────────

export function PagesSheet({ ctx, onPick, onAddBlank, onRex, onClose }: { ctx: SheetContext; onPick: (key: string) => void; onAddBlank: (title: string) => void; onRex: () => void; onClose: () => void }) {
  const t = useT("storeEditor");
  const rows = useMemo(() => pageRows(ctx.ed.snapshot), [ctx.ed.snapshot]);
  const [naming, setNaming] = useState<string | null>(null);
  return (
    <EditorSheet testID="editor-pages-sheet" title={t("pages.title")} dim height="70%" onClose={onClose}>
      {rows.map((row) => {
        const current = row.key === ctx.page;
        return (
          <Pressable key={row.key} testID={`page-${row.key}`} accessibilityRole="button" accessibilityState={{ selected: current }} onPress={() => onPick(row.key)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line, opacity: pressed ? 0.8 : 1 })}>
            <View style={{ width: 44, height: 56, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 4, gap: 3 }}>
              {row.photo ? <Image source={{ uri: row.photo }} style={{ width: "100%", height: 22, borderRadius: 3 }} contentFit="cover" /> : null}
              <View style={{ height: 3, borderRadius: 2, backgroundColor: colors.line }} />
              <View style={{ height: 3, width: "70%", borderRadius: 2, backgroundColor: colors.line }} />
            </View>
            <View style={{ flex: 1 }}>
              <T weight="bold" numberOfLines={1} style={{ fontSize: 15 }}>{row.title}</T>
              <T style={{ fontSize: 12.5, color: colors.inkSoft }}>{t("pages.sections", { count: row.sections })}</T>
            </View>
            {current ? (
              <View style={{ borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.peach }}><T weight="bold" style={{ fontSize: 12, color: colors.accentInk }}>{t("pages.editing")}</T></View>
            ) : (
              <AppIcon name="chevron" size={18} color={colors.inkFaint} />
            )}
          </Pressable>
        );
      })}
      {naming !== null ? (
        <View style={{ gap: 8 }}>
          <Field testID="page-name" autoFocus value={naming} onChangeText={setNaming} placeholder={t("pages.namePlaceholder")} accessibilityLabel={t("pages.nameTitle")} returnKeyType="done" onSubmitEditing={() => naming.trim() && onAddBlank(naming)} maxLength={60} />
          <PillButton testID="page-add" title={t("pages.add")} size="sm" disabled={!naming.trim()} onPress={() => onAddBlank(naming)} />
        </View>
      ) : (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <PillButton testID="pages-blank" title={t("pages.blank")} icon="plus" tone="white" size="sm" style={{ flex: 1 }} onPress={() => setNaming("")} />
          <Pressable testID="pages-rex" accessibilityRole="button" onPress={onRex} style={({ pressed }) => ({ flex: 1, minHeight: 48, borderRadius: radii.pill, backgroundColor: colors.mintTint, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: pressed ? 0.85 : 1 })}>
            <AppIcon name="sparkle" size={18} color={colors.forest} />
            <T weight="bold" numberOfLines={1} style={{ fontSize: 14, color: colors.forest }}>{t("pages.rex")}</T>
          </Pressable>
        </View>
      )}
    </EditorSheet>
  );
}

// ─── Products section: choose what shows (SE-16) ─────────────────────────────

const LAYOUTS: ProductsLayout[] = ["one", "two", "three", "slider"];

export function ProductsSheet({ ctx, section, onClose }: { ctx: SheetContext; section: EdSection; onClose: () => void }) {
  const t = useT("storeEditor");
  const show = productsShowOf(section, ctx.renderer);
  const layout = productsLayoutOf(section, ctx.renderer);
  const picked = pickedProductIds(section);
  const [picking, setPicking] = useState(show.kind === "picked");
  const set = (next: ProductsShow, ids: string[] = picked) => ctx.ed.commit((current) => setProductsShow(current, ctx.page, section.id, next, ctx.renderer, ids), `products:${section.id}`);
  const boutique = ctx.renderer === "boutique";
  const products = ctx.load.store.storeProducts;
  return (
    <EditorSheet testID="editor-products-sheet" title={t("products.title")} onClose={onClose}>
      <SheetLabel>{t("products.show")}</SheetLabel>
      <ChipRow>
        {boutique ? <Chip label={t("products.best")} on={show.kind === "best-sellers" && !picking} onPress={() => { setPicking(false); set({ kind: "best-sellers" }); }} /> : null}
        <Chip label={t("products.new")} on={show.kind === "new" && !picking} onPress={() => { setPicking(false); set({ kind: "new" }); }} />
        {boutique
          ? ctx.load.collections.map((collection) => (
              <Chip key={collection.id} label={collection.name} on={show.kind === "collection" && show.collectionId === collection.id && !picking} onPress={() => { setPicking(false); set({ kind: "collection", collectionId: collection.id }); }} />
            ))
          : null}
        <Chip label={t("products.picked")} on={picking} onPress={() => { setPicking(true); set({ kind: "picked" }, picked.length ? picked : products.slice(0, 4).map((product) => product.id)); }} />
      </ChipRow>
      {picking ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {products.slice(0, 60).map((product) => {
            const on = picked.includes(product.id);
            return (
              <Pressable
                key={product.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={product.name}
                onPress={() => set({ kind: "picked" }, on ? picked.filter((id) => id !== product.id) : [...picked, product.id])}
                style={{ width: 72, gap: 4 }}
              >
                <View style={{ width: 72, height: 72, borderRadius: 12, overflow: "hidden", backgroundColor: colors.grayTint, borderWidth: on ? 3 : 0, borderColor: colors.accent }}>
                  {product.images[0] ? <Image source={{ uri: product.images[0] }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : null}
                  {on ? <View style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}><AppIcon name="check" size={12} color={colors.onAccent} strokeWidth={3} /></View> : null}
                </View>
                <T numberOfLines={1} style={{ fontSize: 11 }}>{product.name}</T>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <SheetLabel>{t("products.layout")}</SheetLabel>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {LAYOUTS.map((entry) => {
          const on = layout === entry;
          const columns = entry === "one" ? 1 : entry === "two" ? 2 : 3;
          return (
            <Pressable key={entry} testID={`layout-${entry}`} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={t(`products.${entry}`)} onPress={() => ctx.ed.commit((current) => setProductsLayout(current, ctx.page, section.id, entry, ctx.renderer), `layout:${section.id}`)} style={{ flex: 1, height: 58, borderRadius: 14, padding: 8, borderWidth: on ? 2 : 1, borderColor: on ? colors.ink : colors.line, flexDirection: "row", gap: 3, alignItems: "stretch", justifyContent: "center" }}>
              {entry === "slider" ? (
                <T weight="bold" style={{ fontSize: 12, alignSelf: "center" }}>{t("products.slider")}</T>
              ) : (
                Array.from({ length: columns }, (_, index) => <View key={index} style={{ flex: 1, borderRadius: 4, backgroundColor: colors.line }} />)
              )}
            </Pressable>
          );
        })}
      </View>
    </EditorSheet>
  );
}

// ─── Changed on another device ───────────────────────────────────────────────

export function ConflictSheet({ onChoose, busy }: { onChoose: (keep: "mine" | "theirs") => void; busy: boolean }) {
  const t = useT("storeEditor");
  return (
    <EditorSheet testID="editor-conflict-sheet" title={t("conflict.title")} dim right={null} onClose={() => undefined}>
      <T style={{ fontSize: 14.5, lineHeight: 21, color: colors.inkSoft }}>{t("conflict.body")}</T>
      <PillButton testID="conflict-theirs" title={t("conflict.theirs")} size="md" busy={busy} onPress={() => onChoose("theirs")} />
      <PillButton testID="conflict-mine" title={t("conflict.mine")} size="md" tone="white" disabled={busy} onPress={() => onChoose("mine")} />
    </EditorSheet>
  );
}

export { DoneButton };
