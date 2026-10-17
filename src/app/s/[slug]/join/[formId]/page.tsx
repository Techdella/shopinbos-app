import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { readStoreLook, toHex6 } from "@/app/home/store/look";
import { readDesign, readFields, readPopupConfig } from "@/lib/marketing/forms";
import { publicRewardSummary } from "@/lib/marketing/popup-rewards.server";
import { JoinForm } from "./JoinForm";

// Hosted sign-up page for a form: a link sellers can put in their Instagram bio or WhatsApp status.

export const dynamic = "force-dynamic";

async function load(slug: string, formId: string) {
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, name: true, slug: true, logoUrl: true, status: true, brandSettings: true, currency: true } });
  if (!store || store.status !== "active") return null;
  const form = await db.storeForm.findFirst({ where: { id: formId, storeId: store.id, active: true } });
  return form ? { store, form } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; formId: string }> }): Promise<Metadata> {
  const { slug, formId } = await params;
  const found = await load(slug, formId);
  if (!found) return { title: "Sign up" };
  const design = readDesign(found.form.design, found.form.name);
  return { title: `${design.headline} · ${found.store.name}`, description: design.body };
}

export default async function JoinPage({ params }: { params: Promise<{ slug: string; formId: string }> }) {
  const { slug, formId } = await params;
  const found = await load(slug, formId);
  if (!found) notFound();
  const { store, form } = found;
  const tokens = readStoreLook(store).tokens;
  const colors = {
    ink: toHex6(tokens?.ink, "#16141F"),
    paper: toHex6(tokens?.paperBg, "#FFFFFF"),
    accent: toHex6(tokens?.ctaBg, "#16141F"),
    accentText: toHex6(tokens?.ctaText, "#FFFFFF"),
  };
  const design = readDesign(form.design, form.name);
  const reward = await publicRewardSummary(store.id, readPopupConfig(form.popupConfig).reward);
  return (
    <main className="grid min-h-[100dvh] place-items-center px-4 py-10" style={{ background: colors.paper, color: colors.ink }}>
      <div className="w-full max-w-[440px]">
        <a href={`/s/${store.slug}`} className="mb-6 flex items-center gap-3 no-underline" style={{ color: colors.ink }}>
          {store.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logoUrl} alt="" className="h-10 w-10 rounded-xl object-contain" />
          ) : null}
          <span className="text-[17px] font-bold">{store.name}</span>
        </a>
        <JoinForm storeSlug={store.slug} formId={form.id} fields={readFields(form.fields)} design={design} colors={colors} currency={store.currency} reward={reward} />
      </div>
    </main>
  );
}
