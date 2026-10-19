import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace, parseBrandSettings } from "@/lib/workspace";
import { saveStoreTaxSettings } from "@/app/actions/workspace";
import { PageToast } from "@/components/PageToast";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Card, CardHead, Pill } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { Field, buttonClass, checkClass, inputClass, selectClass } from "@/components/growth/kit";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("payments");
  return { title: t("tax.title") };
}

type TaxPageProps = { searchParams?: Promise<{ saved?: string }> };

export default async function TaxesPage({ searchParams }: TaxPageProps) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const t = await getT("payments", "common");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace?.store) redirect("/onboarding?role=seller");

  const store = workspace.store;
  const settings = parseBrandSettings(store.brandSettings);
  const tax = settings.taxConfig && typeof settings.taxConfig === "object"
    ? settings.taxConfig as Record<string, string | boolean | number>
    : {};

  const vatEnabled = Boolean(tax.vatEnabled);
  const vatRate = typeof tax.vatRate === "number" ? tax.vatRate : 7.5;
  // Saved as a boolean by saveStoreTaxSettings; older records may hold the word.
  const vatInclusive = tax.vatInclusive === true || tax.vatInclusive === "inclusive";
  const vatNumber = String(tax.vatNumber ?? "");
  const tinNumber = String(tax.tinNumber ?? "");
  const showTaxOnReceipts = Boolean(tax.showTaxOnReceipts ?? true);
  const country = store.country ?? "Nigeria";

  const defaultRate = country === "Ghana" ? 12.5 : country === "Kenya" ? 16 : 7.5;
  const authority = country === "Ghana" ? "GRA" : country === "Kenya" ? "KRA" : "FIRS";
  const checkRow = "flex min-h-[48px] cursor-pointer items-center gap-3 rounded-[14px] bg-app-canvas px-4 text-[14.5px] font-semibold";

  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("tax.title")} sub={t("tax.sub")}>
      <PageToast />
      <form action={saveStoreTaxSettings} className="grid gap-5 xl:grid-cols-2">
        {params?.saved && <div className="xl:col-span-2"><Notice tone="success">{t("tax.saved")}</Notice></div>}

        <Card className="p-5 sm:p-6">
          <CardHead title={t("tax.vatTitle", { rate: defaultRate })} sub={t("tax.vatSub", { country })} action={<Pill tone={vatEnabled ? "success" : "muted"} dot>{vatEnabled ? t("tax.on") : t("tax.off")}</Pill>} />
          <div className="mt-5 grid gap-4">
            <label className={checkRow}>
              <input type="checkbox" name="vatEnabled" defaultChecked={vatEnabled} className={checkClass} />
              {t("tax.charge")}
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t("tax.rate")} htmlFor="vat-rate" hint={t("tax.rateHint", { country, rate: defaultRate })}>
                <input id="vat-rate" name="vatRate" type="number" min={0} max={100} step={0.5} className={inputClass} placeholder={String(defaultRate)} defaultValue={vatRate || defaultRate} />
              </Field>
              <Field label={t("tax.prices")} htmlFor="vat-inclusive" hint={t("tax.pricesHint")}>
                <select id="vat-inclusive" name="vatInclusive" defaultValue={vatInclusive ? "inclusive" : "exclusive"} className={selectClass}>
                  <option value="exclusive">{t("tax.exclusive")}</option>
                  <option value="inclusive">{t("tax.inclusive")}</option>
                </select>
              </Field>
            </div>
            <label className={checkRow}>
              <input type="checkbox" name="showTaxOnReceipts" defaultChecked={showTaxOnReceipts} className={checkClass} />
              {t("tax.showOnReceipts")}
            </label>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <CardHead title={t("tax.reg")} sub={t("tax.regSub")} />
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label={t("tax.vatNumber")} htmlFor="vat-number">
              <input id="vat-number" name="vatNumber" className={inputClass} defaultValue={vatNumber} placeholder="e.g. VAT-0001234567" />
            </Field>
            <Field label={t("tax.tin")} htmlFor="tin-number">
              <input id="tin-number" name="tinNumber" className={inputClass} defaultValue={tinNumber} placeholder="e.g. 1234567-0001" />
            </Field>
          </div>
        </Card>

        <div className="xl:col-span-2">
          <AssistantNote>
            {t("tax.note", { authority, country })}
          </AssistantNote>
        </div>

        <div className="xl:col-span-2">
          <button className={buttonClass("ink")} type="submit">{t("tax.save")}</button>
        </div>
      </form>
    </SellerPage>
  );
}
