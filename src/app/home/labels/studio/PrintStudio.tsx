"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Notice, PillButton, Spinner, cx } from "@/components/app-ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { barcodeSvg } from "@shared/barcodes";
import { PRINT_KINDS, PRINT_SPECS, QR_TARGETS, buildPrintItems, labelsPerSheet, pageCss, type PaperMode, type PrintItem, type PrintKind, type PrintProduct, type QrTarget } from "@shared/print-labels";

interface StudioStore {
  name: string;
  url: string;
  whatsapp: string | null;
  reviewsUrl: string;
  logo: string | null;
  icon: string | null;
  accent: string;
  ink: string;
  paper: string;
}

const KIND_ICON: Record<PrintKind, IconName> = { tag: "tag", price: "code", qr: "grid", package: "package", thanks: "heart" };
const DPI_RATIO = 300 / 96;

/** Inline SVG markup we made ourselves (qrcode package, shared/barcodes): safe to inject. */
function Svg({ markup, className }: { markup: string; className?: string }) {
  return <span className={cx("block [&>svg]:h-full [&>svg]:w-full", className)} dangerouslySetInnerHTML={{ __html: markup }} />;
}

export function PrintStudio({
  store,
  products,
  initial,
}: {
  store: StudioStore | null;
  products: PrintProduct[];
  initial: { kind: PrintKind; products: string[]; headline: string; note: string; qr: QrTarget; copies: number };
}) {
  const t = useT("orders");
  const [kind, setKind] = useState<PrintKind>(initial.kind);
  const [selected, setSelected] = useState<string[]>(initial.products.length ? initial.products : products.slice(0, 1).map((p) => p.id));
  const [copies, setCopies] = useState(initial.copies);
  const [paper, setPaper] = useState<PaperMode>("sheet");
  const [target, setTarget] = useState<QrTarget>(initial.qr);
  const [custom, setCustom] = useState("");
  const [headline, setHeadline] = useState(initial.headline);
  const [note, setNote] = useState(initial.note);
  const [showPrice, setShowPrice] = useState(true);
  const [search, setSearch] = useState("");
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<null | "png" | "send" | "save">(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);

  const spec = PRINT_SPECS[kind];
  const chosen = useMemo(() => products.filter((product) => selected.includes(product.id)), [products, selected]);
  const items = useMemo<PrintItem[]>(
    () => (store ? buildPrintItems({ kind, products: chosen, copies, target, custom, store }) : []),
    [kind, chosen, copies, target, custom, store],
  );
  const needsQr = kind === "qr" || kind === "package" || kind === "thanks" || kind === "tag";

  // QR codes are drawn in the browser (qrcode package) for each distinct link.
  useEffect(() => {
    if (!needsQr) return;
    const links = Array.from(new Set(items.map((item) => item.qr))).filter((link) => !qrs[link]);
    if (!links.length) return;
    let cancelled = false;
    void import("qrcode").then(async (QRCode) => {
      const made = await Promise.all(links.map(async (link) => [link, await QRCode.toString(link, { type: "svg", margin: 0, errorCorrectionLevel: "M" })] as const));
      if (!cancelled) setQrs((prev) => ({ ...prev, ...Object.fromEntries(made) }));
    });
    return () => {
      cancelled = true;
    };
  }, [items, needsQr, qrs]);

  const barcodes = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of items) {
      if (item.barcode && !map[item.barcode]) {
        try {
          map[item.barcode] = barcodeSvg(item.barcode, { height: 42 });
        } catch {
          // An unusual SKU that can't be encoded: the label just shows no barcode.
        }
      }
    }
    return map;
  }, [items]);

  const filtered = products.filter((product) => product.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 80);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
  }

  async function makePng() {
    if (!areaRef.current) throw new Error(t("ps.err.png"));
    const { toPng } = await import("html-to-image");
    return toPng(areaRef.current, { pixelRatio: DPI_RATIO, backgroundColor: "#FFFFFF", cacheBust: true });
  }

  /** Saves this setup to Labels and print (it reopens from the link). */
  async function saveSetup() {
    setBusy("save");
    setStatus(null);
    try {
      const params = new URLSearchParams({ kind, qr: target, copies: String(copies) });
      if (selected.length) params.set("products", selected.join(","));
      if (headline.trim()) params.set("headline", headline.trim());
      if (note.trim()) params.set("note", note.trim());
      const title = `${t(`ps.kind.${kind}`)}${chosen.length ? ` · ${chosen.slice(0, 2).map((product) => product.name).join(", ")}` : ""}`;
      const response = await fetch("/api/app/print-designs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "label", printKind: kind, title, href: `/home/labels/studio?${params.toString()}`, productId: selected[0] ?? null }) });
      if (!response.ok) throw new Error(t("ps.saveFailed"));
      setStatus({ ok: true, text: t("ps.savedSetup") });
    } catch (error) {
      setStatus({ ok: false, text: error instanceof Error ? error.message : t("ps.saveFailed") });
    } finally {
      setBusy(null);
    }
  }

  const fileName = `${(store?.name ?? "labels").replace(/[^\w-]+/g, "-").toLowerCase().slice(0, 40)}-${kind}.png`;

  async function download() {
    setBusy("png");
    setStatus(null);
    try {
      const url = await makePng();
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
    } catch (error) {
      setStatus({ ok: false, text: error instanceof Error ? error.message : t("ps.err.png") });
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    setBusy("send");
    setStatus(null);
    try {
      const file = await makePng();
      const response = await fetch("/api/app/print/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: to.split(/[,\s]+/).map((value) => value.trim()).filter(Boolean),
          message: message.trim() || undefined,
          filename: fileName,
          file,
          summary: t("ps.summary", { count: items.length, kind: t(`ps.kind.${kind}`), w: spec.w, h: spec.h }),
        }),
      });
      const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(json?.error?.message ?? t("ps.err.send"));
      setStatus({ ok: true, text: t("ps.sent") });
      setSendOpen(false);
    } catch (error) {
      setStatus({ ok: false, text: error instanceof Error ? error.message : t("ps.err.send") });
    } finally {
      setBusy(null);
    }
  }

  if (!store) return <Notice tone="info">{t("ps.noStore")}</Notice>;

  const chip = (on: boolean) => cx("inline-flex min-h-[38px] items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-bold", on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white hover:border-app-line-strong");
  const field = "h-10 w-full rounded-[12px] border border-app-line bg-white px-3 text-[14px] outline-none focus:border-app-ink";

  return (
    <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      <style>{`
        ${pageCss(kind, paper)}
        @media print {
          body * { visibility: hidden !important; }
          #print-area, #print-area * { visibility: visible !important; }
          #print-area { position: absolute; left: 0; top: 0; width: ${paper === "roll" ? `${spec.w}mm` : "194mm"}; padding: 0 !important; background: #fff !important; }
          #print-area .label { box-shadow: none !important; }
          ${paper === "roll" ? "#print-area .label { break-after: page; margin: 0 !important; }" : ""}
        }
      `}</style>

      <div className="no-print grid min-w-0 content-start gap-4">
        <section className="rounded-[22px] border border-app-line bg-white p-5">
          <h2 className="m-0 text-[15px] font-extrabold">{t("ps.what")}</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {PRINT_KINDS.map((option) => (
              <button key={option} type="button" aria-pressed={kind === option} onClick={() => setKind(option)} className={cx("flex items-center gap-2 rounded-[14px] border p-2.5 text-left", kind === option ? "border-app-ink bg-app-canvas" : "border-app-line hover:border-app-line-strong")}>
                <Icon name={KIND_ICON[option]} size={16} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-extrabold leading-tight">{t(`ps.kind.${option}`)}</span>
                  <span className="block text-[11.5px] text-app-ink-soft">{PRINT_SPECS[option].w} × {PRINT_SPECS[option].h} mm</span>
                </span>
              </button>
            ))}
            <Link href="/home/labels" className="flex items-center gap-2 rounded-[14px] border border-app-line p-2.5 text-app-ink no-underline hover:border-app-line-strong">
              <Icon name="truck" size={16} />
              <span className="min-w-0">
                <span className="block text-[13px] font-extrabold leading-tight">{t("ps.shipping")}</span>
                <span className="block text-[11.5px] text-app-ink-soft">{t("ps.shippingHint")}</span>
              </span>
            </Link>
          </div>
        </section>

        <section className="rounded-[22px] border border-app-line bg-white p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="m-0 text-[15px] font-extrabold">{t("ps.products")}</h2>
            <span className="text-[12px] text-app-ink-soft">{spec.perProduct ? t("ps.chosen", { count: selected.length }) : t("ps.optional")}</span>
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("ps.search")} className={cx(field, "mt-3 rounded-full")} />
          <ul className="m-0 mt-2 max-h-[220px] list-none overflow-y-auto p-0">
            {filtered.map((product) => (
              <li key={product.id}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 hover:bg-app-canvas">
                  <input type="checkbox" checked={selected.includes(product.id)} onChange={() => toggle(product.id)} className="h-4 w-4 accent-[#16141F]" />
                  {product.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.image} alt="" className="h-8 w-8 rounded-[8px] object-cover" />
                  ) : (
                    <span className="h-8 w-8 rounded-[8px] bg-app-canvas" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[13.5px]">{product.name}</span>
                  <span className="shrink-0 text-[12px] text-app-ink-soft">{product.price}</span>
                </label>
              </li>
            ))}
            {products.length === 0 ? <li className="py-2 text-[13px] text-app-ink-soft">{t("ps.noProducts")}</li> : null}
          </ul>
        </section>

        <section className="grid gap-3 rounded-[22px] border border-app-line bg-white p-5">
          <h2 className="m-0 text-[15px] font-extrabold">{t("ps.words")}</h2>
          <label className="grid gap-1 text-[13px] font-bold">
            {t("ps.headline")}
            <input value={headline} maxLength={60} onChange={(e) => setHeadline(e.target.value)} placeholder={kind === "thanks" ? t("ps.headlineThanks") : t("ps.headlinePh")} className={field} />
          </label>
          <label className="grid gap-1 text-[13px] font-bold">
            {t("ps.note")}
            <textarea value={note} maxLength={160} rows={2} onChange={(e) => setNote(e.target.value)} placeholder={kind === "package" ? t("ps.notePackage") : t("ps.notePh")} className="w-full resize-y rounded-[12px] border border-app-line bg-white px-3 py-2 text-[14px] outline-none focus:border-app-ink" />
          </label>
          {needsQr ? (
            <div>
              <p className="m-0 mb-1.5 text-[13px] font-bold">{t("ps.qr")}</p>
              <div className="flex flex-wrap gap-1.5">
                {QR_TARGETS.filter((option) => option !== "whatsapp" || store.whatsapp).map((option) => (
                  <button key={option} type="button" aria-pressed={target === option} onClick={() => setTarget(option)} className={chip(target === option)}>{t(`ps.qr.${option}`)}</button>
                ))}
              </div>
              {target === "custom" ? <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="https://" className={cx(field, "mt-2")} /> : null}
            </div>
          ) : null}
          {kind !== "qr" && kind !== "thanks" ? (
            <label className="flex items-center gap-2 text-[13px] font-bold">
              <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} className="h-4 w-4 accent-[#16141F]" /> {t("ps.showPrice")}
            </label>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-[13px] font-bold">
              {t("ps.copies")}
              <input type="number" min={1} max={100} value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} className={field} />
            </label>
            <div className="grid gap-1 text-[13px] font-bold">
              {t("ps.paper")}
              <div className="flex gap-1.5">
                <button type="button" aria-pressed={paper === "sheet"} onClick={() => setPaper("sheet")} className={chip(paper === "sheet")}>A4</button>
                <button type="button" aria-pressed={paper === "roll"} onClick={() => setPaper("roll")} className={chip(paper === "roll")}>{t("ps.roll")}</button>
              </div>
            </div>
          </div>
          <p className="m-0 text-[12px] leading-[1.45] text-app-ink-soft">
            {paper === "sheet" ? t("ps.sheetHint", { count: labelsPerSheet(kind) }) : t("ps.rollHint", { w: spec.w, h: spec.h })}
          </p>
        </section>
      </div>

      <div className="grid min-w-0 content-start gap-4">
        <section className="no-print flex flex-wrap items-center gap-2 rounded-[22px] border border-app-line bg-white p-4">
          <p className="m-0 mr-auto text-[14px] font-extrabold">{t("ps.ready", { count: items.length })}</p>
          <PillButton size="sm" tone="ink" disabled={!items.length} onClick={() => window.print()}>
            <Icon name="document" size={14} /> {t("ps.print")}
          </PillButton>
          <PillButton size="sm" tone="white" disabled={!items.length || busy !== null} onClick={() => void download()}>
            {busy === "png" ? <Spinner className="h-4 w-4" /> : <Icon name="download" size={14} />} {t("ps.download")}
          </PillButton>
          <PillButton size="sm" tone="white" disabled={!items.length || busy !== null} onClick={() => void saveSetup()}>
            {busy === "save" ? <Spinner className="h-4 w-4" /> : <Icon name="check" size={14} />} {t("ps.saveSetup")}
          </PillButton>
          <PillButton size="sm" tone="white" disabled={!items.length} onClick={() => setSendOpen((open) => !open)}>
            <Icon name="send" size={14} /> {t("ps.send")}
          </PillButton>
          {sendOpen ? (
            <div className="grid w-full gap-2 rounded-[16px] bg-app-canvas p-3">
              <label className="grid gap-1 text-[13px] font-bold">
                {t("ps.sendTo")}
                <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="printshop@example.com" className={field} />
              </label>
              <textarea value={message} maxLength={800} rows={2} onChange={(e) => setMessage(e.target.value)} placeholder={t("ps.sendMessage")} className="w-full rounded-[12px] border border-app-line bg-white px-3 py-2 text-[14px] outline-none focus:border-app-ink" />
              <div className="flex flex-wrap items-center gap-2">
                <PillButton size="sm" tone="ink" disabled={!to.trim() || busy !== null} onClick={() => void send()}>
                  {busy === "send" ? <Spinner className="h-4 w-4" /> : <Icon name="send" size={14} />} {t("ps.sendNow")}
                </PillButton>
                <span className="text-[12px] text-app-ink-soft">{t("ps.sendHint")}</span>
              </div>
            </div>
          ) : null}
          {status ? <p role="status" className={cx("m-0 w-full text-[13px] font-bold", status.ok ? "text-app-success" : "text-app-danger")}>{status.text}</p> : null}
        </section>

        {spec.perProduct && !chosen.length ? (
          <Notice tone="info">{t("ps.pickProduct")}</Notice>
        ) : (
          <div className="overflow-x-auto rounded-[22px] border border-app-line bg-app-canvas p-4 print:overflow-visible print:border-0 print:p-0">
            <div ref={areaRef} id="print-area" className="flex flex-wrap content-start gap-[3mm] bg-white p-[4mm]" style={{ width: paper === "sheet" ? "202mm" : `${spec.w + 8}mm` }}>
              {items.map((item) => (
                <Label key={item.key} kind={kind} item={item} store={store} headline={headline} note={note} showPrice={showPrice} qr={qrs[item.qr]} barcode={item.barcode ? barcodes[item.barcode] : undefined} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Label({ kind, item, store, headline, note, showPrice, qr, barcode }: { kind: PrintKind; item: PrintItem; store: StudioStore; headline: string; note: string; showPrice: boolean; qr?: string; barcode?: string }) {
  const t = useT("orders");
  const { w, h } = PRINT_SPECS[kind];
  const product = item.product;
  const mark = store.icon ?? store.logo;
  const box = "label relative flex shrink-0 overflow-hidden rounded-[2mm] border border-dashed border-[#c9c6cf] bg-white text-[#16141F] print:border-[#e5e5e5]";
  const style = { width: `${w}mm`, height: `${h}mm`, printColorAdjust: "exact" as const, WebkitPrintColorAdjust: "exact" as const };
  const brand = mark ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={mark} alt="" crossOrigin="anonymous" className="h-full w-full object-contain" />
  ) : (
    <span className="grid h-full w-full place-items-center text-[4mm] font-extrabold text-white" style={{ background: store.accent }}>{store.name.charAt(0)}</span>
  );

  if (kind === "price") {
    return (
      <div className={cx(box, "flex-col justify-between p-[2mm]")} style={style}>
        <div className="flex items-start justify-between gap-[1mm]">
          <span className="line-clamp-2 text-[2.8mm] font-bold leading-[1.15]">{product?.name}</span>
          {showPrice ? <span className="shrink-0 text-[3.4mm] font-extrabold" style={{ color: store.accent }}>{product?.price}</span> : null}
        </div>
        {barcode ? <Svg markup={barcode} className="h-[11mm] w-full" /> : null}
      </div>
    );
  }

  if (kind === "qr") {
    return (
      <div className={cx(box, "flex-col items-center justify-between p-[3mm] text-center")} style={style}>
        <p className="m-0 text-[3mm] font-extrabold leading-tight" style={{ color: store.accent }}>{headline || t("ps.scanShop")}</p>
        {qr ? <Svg markup={qr} className="h-[28mm] w-[28mm]" /> : <span className="h-[28mm] w-[28mm] animate-pulse bg-[#eee]" />}
        <p className="m-0 truncate text-[2.4mm] font-bold">{product?.name ?? store.name}</p>
      </div>
    );
  }

  if (kind === "thanks") {
    return (
      <div className={cx(box, "items-stretch")} style={style}>
        <div className="flex w-[34%] flex-col items-center justify-center gap-[2mm] p-[3mm]" style={{ background: store.accent }}>
          <span className="h-[14mm] w-[14mm] overflow-hidden rounded-[3mm] bg-white p-[1mm]">{brand}</span>
          {qr ? <span className="rounded-[1.5mm] bg-white p-[1mm]"><Svg markup={qr} className="h-[16mm] w-[16mm]" /></span> : null}
        </div>
        <div className="flex flex-1 flex-col justify-center p-[4mm]">
          <p className="m-0 text-[5mm] font-extrabold leading-[1.1]">{headline || t("ps.thanksDefault")}</p>
          <p className="m-0 mt-[2mm] text-[2.8mm] leading-[1.4] text-[#55525e]">{note || t("ps.thanksNote", { store: store.name })}</p>
          <p className="m-0 mt-[2mm] text-[2.4mm] font-bold" style={{ color: store.accent }}>{store.url.replace(/^https?:\/\//, "")}</p>
        </div>
      </div>
    );
  }

  if (kind === "package") {
    return (
      <div className={cx(box, "flex-col")} style={style}>
        <div className="flex items-center gap-[2mm] px-[3mm] py-[2mm] text-white" style={{ background: store.ink }}>
          <span className="h-[7mm] w-[7mm] shrink-0 overflow-hidden rounded-[1.5mm] bg-white p-[0.5mm]">{brand}</span>
          <span className="truncate text-[3.2mm] font-extrabold">{store.name}</span>
          <span className="ml-auto truncate text-[2.3mm] opacity-80">{store.url.replace(/^https?:\/\//, "")}</span>
        </div>
        <div className="flex min-h-0 flex-1 gap-[3mm] p-[3mm]">
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="m-0 line-clamp-2 text-[4.2mm] font-extrabold leading-[1.1]">{headline || product?.name}</p>
            {headline && product ? <p className="m-0 truncate text-[2.6mm] text-[#55525e]">{product.name}</p> : null}
            {note ? <p className="m-0 mt-[1.5mm] line-clamp-3 text-[2.5mm] leading-[1.35] text-[#55525e]">{note}</p> : null}
            {showPrice && product ? <p className="m-0 mt-auto text-[4mm] font-extrabold" style={{ color: store.accent }}>{product.price}</p> : null}
            {barcode ? <Svg markup={barcode} className="mt-[1mm] h-[10mm] w-[40mm]" /> : null}
          </div>
          {qr ? (
            <div className="flex shrink-0 flex-col items-center justify-center gap-[1mm]">
              <Svg markup={qr} className="h-[22mm] w-[22mm]" />
              <span className="text-[2.2mm] font-bold">{t("ps.scanMe")}</span>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // Hang tag
  return (
    <div className={cx(box, "flex-col items-center px-[3mm] pb-[3mm] pt-[8mm] text-center")} style={style}>
      <span className="absolute left-1/2 top-[3mm] h-[3mm] w-[3mm] -translate-x-1/2 rounded-full border border-[#c9c6cf] bg-app-canvas" aria-hidden />
      <span className="h-[12mm] w-[12mm] overflow-hidden rounded-[2.5mm]">{brand}</span>
      <p className="m-0 mt-[2mm] text-[2.6mm] font-bold uppercase tracking-[0.12em]" style={{ color: store.accent }}>{headline || store.name}</p>
      <p className="m-0 mt-[1.5mm] line-clamp-3 text-[3.6mm] font-extrabold leading-[1.15]">{product?.name}</p>
      {note ? <p className="m-0 mt-[1.5mm] line-clamp-3 text-[2.4mm] leading-[1.35] text-[#55525e]">{note}</p> : null}
      {showPrice && product ? <p className="m-0 mt-[2mm] text-[4.4mm] font-extrabold">{product.price}</p> : null}
      <div className="mt-auto flex w-full items-end justify-between gap-[2mm]">
        {barcode ? <Svg markup={barcode} className="h-[10mm] flex-1" /> : <span />}
        {qr ? <Svg markup={qr} className="h-[12mm] w-[12mm] shrink-0" /> : null}
      </div>
    </div>
  );
}
