import { NextRequest, NextResponse } from "next/server";
import { isLocale } from "@shared/i18n";
import { getT, getTFor } from "@/lib/i18n/server";
import { parseLabelFormat } from "@/lib/labels";
import { loadLabels } from "@/lib/labels.server";
import { verifyLabelToken } from "@/lib/labels-token";
import { escapeHtml, renderLabelsHtml } from "@/lib/labels-html";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The printable label page the phone app opens in its in-app browser (it can't send a Bearer header there).
// Auth: a short-lived signed token from GET /api/app/labels (src/lib/labels-token.ts), good for those orders of
// that seller only. ?format=label|a4, ?lang=<app language>. Answers a self-contained HTML page that opens the print
// dialog (print, save as PDF, or share).

const HEADERS = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" };

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const lang = params.get("lang");
  const t = lang && isLocale(lang) ? getTFor(lang, "orders", "m_label") : await getT("orders", "m_label");
  const access = verifyLabelToken(params.get("token"));
  if (!access) {
    // Expired (they last 15 minutes) or altered: go back to the app and tap Print again.
    const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(t("lab.printTitle"))}</title></head><body style="font-family:-apple-system,Roboto,Arial,sans-serif;padding:40px 20px;text-align:center;color:#16141f"><p style="font-size:17px">${escapeHtml(t("label.expired"))}</p></body></html>`;
    return new NextResponse(page, { status: 401, headers: HEADERS });
  }

  const { store, storePhone, labels } = await loadLabels({ userId: access.userId, orderIds: access.orderIds });
  const html = renderLabelsHtml({
    shopName: store?.name ?? "",
    shopPhone: storePhone,
    logoUrl: store?.logoUrl ?? null,
    format: parseLabelFormat(params.get("format")),
    words: { title: t("lab.printTitle"), print: t("lab.printButton"), nothing: t("lab.nothingToPrint") },
    labels: labels.map(({ order, qr, lines, collect, count }) => ({
      orderNumber: order.orderNumber,
      buyerName: order.buyerName,
      buyerPhone: order.buyerPhone,
      lines,
      collect,
      count,
      date: order.createdAt.toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" }),
      qrSvg: qr,
    })),
  });
  return new NextResponse(html, { status: 200, headers: HEADERS });
}
