import { redirect } from "next/navigation";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge } from "@/components/ui";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace, parseBrandSettings } from "@/lib/workspace";
import { saveStoreTaxSettings } from "@/app/actions/workspace";
import { PageToast } from "@/components/PageToast";

export const dynamic = "force-dynamic";

type TaxPageProps = { searchParams?: Promise<{ saved?: string }> };

export default async function TaxesPage({ searchParams }: TaxPageProps) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace?.store) redirect("/onboarding?role=seller");

  const store = workspace.store;
  const settings = parseBrandSettings(store.brandSettings);
  const tax = settings.taxConfig && typeof settings.taxConfig === "object"
    ? settings.taxConfig as Record<string, string | boolean | number>
    : {};

  const vatEnabled = tax.vatEnabled !== false && Boolean(tax.vatEnabled);
  const vatRate = typeof tax.vatRate === "number" ? tax.vatRate : 7.5;
  const vatInclusive = String(tax.vatInclusive ?? "exclusive");
  const vatNumber = String(tax.vatNumber ?? "");
  const tinNumber = String(tax.tinNumber ?? "");
  const showTaxOnReceipts = Boolean(tax.showTaxOnReceipts ?? true);
  const country = store.country ?? "Nigeria";

  const vatLabel = country === "Ghana" ? "VAT (12.5%)" : country === "Kenya" ? "VAT (16%)" : "VAT (7.5%)";
  const defaultRate = country === "Ghana" ? 12.5 : country === "Kenya" ? 16 : 7.5;

  return (
    <AppFrame
      role="seller"
      storeName={store.name}
      storeSlug={store.slug}
      storeInitial={store.name?.[0]?.toUpperCase()}
      storeLogoUrl={store.logoUrl}
      userName={user.name ?? "You"}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        {params?.saved && (
          <div style={{ padding: "10px 16px", borderRadius: 10, background: "var(--teal-50)", border: "1px solid var(--teal-200)", color: "var(--teal-800)", fontSize: 13, fontWeight: 600 }}>
            Tax settings saved.
          </div>
        )}
        <PageToast />
        <PageHead
          title="Taxes"
          sub="Configure how taxes are collected and displayed at checkout."
        />

        <form action={saveStoreTaxSettings} style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--ink-900)" }}>{vatLabel}</h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-500)" }}>
                  Value Added Tax applied at checkout in {country}.
                </p>
              </div>
              <Badge variant={vatEnabled ? "mint" : "ghost"}>{vatEnabled ? "Enabled" : "Off"}</Badge>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                name="vatEnabled"
                defaultChecked={vatEnabled}
                style={{ width: 18, height: 18, accentColor: "var(--teal-600)" }}
              />
              <span style={{ fontWeight: 600, fontSize: 13.5, color: "var(--ink-900)" }}>Charge VAT on sales</span>
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div className="field">
                <label className="label">VAT rate (%)</label>
                <input
                  name="vatRate"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  className="inp"
                  title="VAT rate percentage"
                  placeholder={String(defaultRate)}
                  defaultValue={vatRate || defaultRate}
                />
                <div className="help">The standard rate for {country} is {defaultRate}%.</div>
              </div>
              <div className="field">
                <label className="label">How prices are set</label>
                <select name="vatInclusive" defaultValue={vatInclusive === "inclusive" ? "inclusive" : "exclusive"} className="inp" title="How prices are set relative to tax">
                  <option value="exclusive">Tax-exclusive — tax added at checkout</option>
                  <option value="inclusive">Tax-inclusive — prices already include tax</option>
                </select>
                <div className="help">Tax-inclusive means your listed price includes VAT. Tax-exclusive adds VAT on top at checkout.</div>
              </div>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                name="showTaxOnReceipts"
                defaultChecked={showTaxOnReceipts}
                style={{ width: 18, height: 18, accentColor: "var(--teal-600)" }}
              />
              <span style={{ fontSize: 13.5, color: "var(--ink-900)" }}>
                Show tax breakdown on order receipts
              </span>
            </label>
          </div>

          <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--ink-900)" }}>Tax registration</h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-500)" }}>
                Your tax registration numbers appear on invoices and receipts when filled in.
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div className="field">
                <label className="label">VAT registration number</label>
                <input
                  name="vatNumber"
                  className="inp"
                  defaultValue={vatNumber}
                  placeholder="e.g. VAT-0001234567"
                />
              </div>
              <div className="field">
                <label className="label">TIN (Tax Identification Number)</label>
                <input
                  name="tinNumber"
                  className="inp"
                  defaultValue={tinNumber}
                  placeholder="e.g. 1234567-0001"
                />
              </div>
            </div>
          </div>

          <div style={{ padding: "12px 16px", borderRadius: 10, background: "var(--ink-50)", border: "1px solid var(--ink-100)", fontSize: 13, color: "var(--ink-600)", lineHeight: 1.6 }}>
            <strong>Note:</strong> Shopinbos does not file or remit taxes on your behalf. You are responsible for declaring and paying applicable taxes to your local revenue authority (e.g. FIRS in Nigeria, GRA in Ghana, KRA in Kenya).
          </div>

          <div>
            <button className="dbtn dBtn-mint" type="submit">Save tax settings</button>
          </div>
        </form>
      </div>
    </AppFrame>
  );
}
