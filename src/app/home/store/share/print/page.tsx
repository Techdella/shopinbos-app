import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { shopLinkFor } from "@/lib/shop-handle.server";
import { getT } from "@/lib/i18n/server";
import { PLUG_LIVE } from "@shared/shop-handle";
import { PrintButton } from "@/app/home/labels/print/PrintButton";
import { PrintCards } from "./PrintCards";
import QRCode from "qrcode";

// Print sheet for Shop link & QR: no app shell, A4. ?size=sticker → 12 parcel stickers (3 × 4, cut along the dashes);
// ?size=flyer → 2 A5 flyers side by side on landscape A4. The QR code is drawn here on the server, so it is on the
// page before the print dialog opens.

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("shopLink");
  return { title: t("print.pageTitle") };
}

export default async function PrintShopCardPage({ searchParams }: { searchParams: Promise<{ size?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("shopLink");
  const size = (await searchParams).size === "flyer" ? "flyer" : "sticker";
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, customDomain: true, logoUrl: true } });
  if (!store) redirect("/onboarding?role=seller");
  const link = await shopLinkFor(store);
  if (!link.handle) redirect("/home/store/share");
  const qrSrc = await QRCode.toDataURL(link.shortUrl, { margin: 1, width: 640, errorCorrectionLevel: "M", color: { dark: "#16141F", light: "#FFFFFF" } }).catch(() => undefined);

  return (
    <div className="min-h-dvh bg-app-canvas font-app text-app-ink print:bg-white">
      <style>{`
        @page { size: ${size === "flyer" ? "A4 landscape" : "A4"}; margin: ${size === "flyer" ? "0" : "10mm 7mm"}; }
        @media print { .no-print { display: none !important; } body { background: #fff; } .shop-share-card { border-style: dashed !important; } }
        .shop-sheet-sticker { display: grid; grid-template-columns: repeat(3, 63mm); grid-auto-rows: 70mm; gap: 2mm; width: fit-content; }
        .shop-sheet-flyer { display: grid; grid-template-columns: repeat(2, 148mm); width: fit-content; }
        .shop-sheet-flyer .shop-share-card { border-radius: 0; }
      `}</style>
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-app-line bg-white px-5 py-3">
        <Link href="/home/store/share" className="text-[14px] font-extrabold text-app-ink no-underline">{t("print.back")}</Link>
        <span className="text-[14px] text-app-ink-soft">{size === "flyer" ? t("print.flyerNote") : t("print.stickersNote")}</span>
        <PrintButton label={t("print.print")} />
      </div>
      <div className="mx-auto w-fit p-6 print:p-0">
        <PrintCards
          size={size}
          count={size === "flyer" ? 2 : 12}
          card={{ name: link.storeName, logoUrl: link.logoUrl, handle: link.handle, shortUrl: link.shortUrl, shortHost: link.shortHost, qrSrc }}
          plug={PLUG_LIVE}
        />
      </div>
    </div>
  );
}
