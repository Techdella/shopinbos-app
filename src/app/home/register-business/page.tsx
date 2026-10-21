import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { getT } from "@/lib/i18n/server";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { RegisterBusiness } from "@/components/business-registration/RegisterBusiness";
import { hideRegistrationPageWhenOff, registrationPageData } from "@/lib/business-registration/page-data.server";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Register your business" };

export default async function SellerRegisterBusinessPage({ searchParams }: { searchParams?: Promise<{ registration?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const tipT = await getT("tips");
  const [store, data, params] = await Promise.all([
    db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true } }),
    registrationPageData({ ...user, role: "seller" }),
    searchParams,
  ]);
  hideRegistrationPageWhenOff(data, "seller");
  return (
    <SellerPage user={user} store={storeSummary(store)} title="Register your business" sub="Get your business name registered with CAC without leaving Shopinbos.">
      <PageTip className="mb-5">{tipT("registerBusiness")}</PageTip>
      <RegisterBusiness {...data} result={params?.registration ?? null} />
    </SellerPage>
  );
}
