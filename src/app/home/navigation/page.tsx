import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace, parseBrandSettings } from "@/lib/workspace";
import { saveStoreNavigationSettings } from "@/app/actions/workspace";
import { PageToast } from "@/components/PageToast";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, CardHead, PillLink } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { FIELD_HELP, FIELD_INPUT, FIELD_LABEL, SUBMIT_ACCENT } from "@/components/seller-settings/fields";

export const dynamic = "force-dynamic";

type NavPageProps = { searchParams?: Promise<{ saved?: string }> };

function splitMenu(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export default async function NavigationSettingsPage({ searchParams }: NavPageProps) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace?.store) redirect("/onboarding?role=seller");

  const store = workspace.store;
  const settings = parseBrandSettings(store.brandSettings);
  const navigation = settings.navigation && typeof settings.navigation === "object"
    ? settings.navigation as Record<string, unknown>
    : {};
  const mainMenu = Array.isArray(navigation.mainMenu)
    ? navigation.mainMenu.join(", ")
    : "Home, Shop, About, Contact";
  const footerMenu = Array.isArray(navigation.footerMenu)
    ? navigation.footerMenu.join(", ")
    : "Privacy, Terms, Returns, Contact";

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Navigation"
      sub="The menu at the top of your store and the links in its footer."
      actions={<PillLink href="/home/pages" icon="document">Pages</PillLink>}
    >
      <PageToast />
      <div className="grid gap-5">
        {params?.saved && <Notice tone="success">Navigation saved.</Notice>}

        <form action={saveStoreNavigationSettings} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid min-w-0 content-start gap-5">
            <Card className="p-5">
              <CardHead title="Main menu" sub="Links at the top of every page in your store." />
              <div className="mt-4">
                <label htmlFor="mainMenu" className={FIELD_LABEL}>Menu items</label>
                <input id="mainMenu" name="mainMenu" className={FIELD_INPUT} placeholder="Home, Shop, About, Contact" defaultValue={mainMenu} />
                <p className={FIELD_HELP}>Separate items with commas. Each one links to the page with the same name.</p>
              </div>
            </Card>

            <Card className="p-5">
              <CardHead title="Footer menu" sub="Links at the bottom, usually policies and help." />
              <div className="mt-4">
                <label htmlFor="footerMenu" className={FIELD_LABEL}>Footer links</label>
                <input id="footerMenu" name="footerMenu" className={FIELD_INPUT} placeholder="Privacy, Terms, Returns, Contact" defaultValue={footerMenu} />
                <p className={FIELD_HELP}>Separate items with commas.</p>
              </div>
            </Card>

            <div>
              <button className={SUBMIT_ACCENT} type="submit">Save navigation</button>
            </div>
          </div>

          <aside className="min-w-0">
            <Card className="p-5">
              <CardHead title="What shoppers see now" />
              <div className="mt-4 overflow-hidden rounded-[16px] border border-app-line">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-app-line bg-app-canvas px-4 py-3">
                  <span className="mr-auto truncate text-[14px] font-extrabold">{store.name}</span>
                  {splitMenu(mainMenu).map((item) => <span key={item} className="text-[13px] font-bold">{item}</span>)}
                </div>
                <div className="h-24" />
                <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-app-line px-4 py-3">
                  {splitMenu(footerMenu).map((item) => <span key={item} className="text-[12.5px] text-app-ink-soft">{item}</span>)}
                </div>
              </div>
              <p className={FIELD_HELP}>This shows your saved menus.</p>
            </Card>
          </aside>
        </form>
      </div>
    </SellerPage>
  );
}
