import { BOUTIQUE_FONT_CLASS } from "@/components/storefront/boutique/fonts";
import { STORE_CLOSED_LINES } from "@/components/errors/copy";
import { ErrorScene } from "@/components/errors/ErrorScene";
import { OpeningSoonScene } from "@/components/errors/Illustrations";
import { StoreMark, shopperPalette } from "@/components/errors/store-brand";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import { resolveShopperTheme } from "./theme";

// What shoppers see on any page of a store that isn't live yet: the shop's name, logo and colours, a sign
// swinging on its nail, and a quiet way in for the owner (sign in, then the same pages show as a preview).

export function StoreClosedPage({
  store,
  basePath,
  path,
}: {
  store: { name: string; logoUrl: string | null; brandSettings: unknown };
  basePath: string;
  /** Where the owner lands after signing in (this page). Null on custom domains, which have no sign-in. */
  path: string | null;
}) {
  const theme = resolveShopperTheme(store.brandSettings);
  const shopHref = getPublicStorefrontPath(basePath, "/") || "/";
  return (
    <div className={BOUTIQUE_FONT_CLASS}>
      <ErrorScene
        palette={shopperPalette(theme)}
        sceneAccent={theme.cta}
        eyebrow="Coming soon"
        title="This store isn't open yet"
        lines={STORE_CLOSED_LINES}
        body={`${store.name} is still setting up shop. Save this link and check back soon.`}
        actions={[]}
        illustration={<OpeningSoonScene />}
        brand={<StoreMark name={store.name} logoUrl={store.logoUrl} brandSettings={store.brandSettings} href={shopHref} theme={theme} />}
        footer={
          path ? (
          <>
            Is this your store?{" "}
            <a href={`/login?next=${encodeURIComponent(path)}`} className="font-semibold underline underline-offset-4" style={{ color: theme.ink }}>
              Sign in to preview it
            </a>
          </>
          ) : null
        }
      />
    </div>
  );
}
