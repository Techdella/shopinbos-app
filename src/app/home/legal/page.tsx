import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace, parseBrandSettings } from "@/lib/workspace";
import { saveStoreLegalSettings } from "@/app/actions/workspace";
import { PageToast } from "@/components/PageToast";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Card, CardHead, Pill } from "@/components/app-kit";
import { FIELD_TEXTAREA, SUBMIT_ACCENT } from "@/components/seller-settings/fields";

export const dynamic = "force-dynamic";

const LEGAL_PAGES = [
  {
    key: "privacyPolicy",
    label: "Privacy policy",
    help: "What data you collect, how you use it, and how customers can ask you to delete it.",
    rows: 8,
  },
  {
    key: "terms",
    label: "Terms and conditions",
    help: "The rules for using your store, paying, and sorting out disputes.",
    rows: 8,
  },
  {
    key: "returnPolicy",
    label: "Returns and refunds",
    help: "How long customers have to return items, what you accept back, and how refunds work.",
    rows: 6,
  },
  {
    key: "shippingPolicy",
    label: "Delivery policy",
    help: "Where you deliver, how long it takes, and how delivery fees are worked out.",
    rows: 6,
  },
] as const;

export default async function LegalSettingsPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace?.store) redirect("/onboarding?role=seller");

  const store = workspace.store;
  const settings = parseBrandSettings(store.brandSettings);
  const legal = settings.legal && typeof settings.legal === "object"
    ? settings.legal as Record<string, string>
    : {};

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Legal pages"
      sub="These show as links in your store footer, each on its own page."
    >
      <PageToast />
      <form action={saveStoreLegalSettings} className="grid gap-5">
        <div className="grid gap-5 2xl:grid-cols-2">
          {LEGAL_PAGES.map((page) => {
            const filled = Boolean(legal[page.key]?.trim());
            return (
              <Card key={page.key} className="min-w-0 p-5">
                <CardHead title={<label htmlFor={page.key}>{page.label}</label>} sub={page.help} action={<Pill tone={filled ? "success" : "warning"}>{filled ? "Written" : "Empty"}</Pill>} />
                <textarea
                  id={page.key}
                  name={page.key}
                  className={`${FIELD_TEXTAREA} mt-4`}
                  rows={page.rows}
                  defaultValue={legal[page.key] ?? ""}
                  placeholder={`Write your ${page.label.toLowerCase()} here`}
                />
              </Card>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <AssistantNote who="peggy">Not sure what to write? Ask Peggy for a first draft, then check it fits how you run your business.</AssistantNote>
          <button className={SUBMIT_ACCENT} type="submit">Save legal pages</button>
        </div>
      </form>
    </SellerPage>
  );
}
