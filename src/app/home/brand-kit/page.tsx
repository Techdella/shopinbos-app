import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Card, CardHead, EmptyState, PillLink, Pill } from "@/components/app-kit";

export const dynamic = "force-dynamic";

const COLOR_LABELS: Array<{ key: "heroBg" | "accent" | "ctaBg" | "ink" | "paperBg" | "cardBg" | "muted" | "border"; label: string }> = [
  { key: "accent", label: "Accent" },
  { key: "ctaBg", label: "Buttons" },
  { key: "heroBg", label: "Banner" },
  { key: "ink", label: "Text" },
  { key: "muted", label: "Soft text" },
  { key: "paperBg", label: "Page" },
  { key: "cardBg", label: "Cards" },
  { key: "border", label: "Lines" },
];

const RADIUS_LABEL = { soft: "Soft corners", rounded: "Round corners", sharp: "Square corners" } as const;

export default async function BrandKitPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  const store = workspace?.store ?? null;
  const settings = workspace?.settings ?? {};
  const tokens = settings.themeTokens;
  const template = settings.template ?? settings.editor?.template;

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Brand kit"
      sub="Your logo, colours and type. They show on your store, invoices and emails."
      actions={
        <>
          <PillLink href="/studio/logo" icon="sparkle">Make a logo with Rex</PillLink>
          <PillLink href="/home/editor" tone="accent" icon="edit">Change in store editor</PillLink>
        </>
      }
    >
      {!store ? (
        <EmptyState icon="palette" title="No store yet" action={<PillLink href="/onboarding" tone="ink">Set up your store</PillLink>}>
          Your brand kit fills in once Rex has built your store.
        </EmptyState>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid min-w-0 content-start gap-5">
            <Card className="p-5">
              <CardHead title="Logo" sub="Shown in your store header, on receipts and on shipping labels." />
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <LogoTile bg="#FFFFFF" fg={tokens?.ink ?? "#16141F"} logoUrl={store.logoUrl} name={store.name} label="On light" />
                <LogoTile bg={tokens?.heroBg ?? "#16141F"} fg={tokens?.heroText ?? "#FFFFFF"} logoUrl={store.logoUrl} name={store.name} label="On your banner" />
                <LogoTile bg={tokens?.paperBg ?? "#F6F5FA"} fg={tokens?.ink ?? "#16141F"} logoUrl={null} name={store.name} label="Name only" />
              </div>
              {!store.logoUrl && (
                <p className="mb-0 mt-4 text-[13.5px] text-app-ink-soft">No logo uploaded yet, so your store shows its name. Upload one in Settings or ask Rex to draw one.</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <PillLink href="/home/settings" size="sm" icon="upload">Upload logo</PillLink>
                <PillLink href="/studio/logo" size="sm" icon="sparkle">Rex · new logo</PillLink>
              </div>
            </Card>

            <Card className="p-5">
              <CardHead title="Colours" sub={tokens ? "From your store theme." : undefined} action={<PillLink href="/home/editor" size="sm">Edit colours</PillLink>} />
              {tokens ? (
                <ul className="m-0 mt-4 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-4 2xl:grid-cols-8">
                  {COLOR_LABELS.map(({ key, label }) => (
                    <li key={key} className="min-w-0 overflow-hidden rounded-[16px] border border-app-line">
                      <div className="aspect-[4/3] border-b border-app-line" style={{ background: tokens[key] }} />
                      <div className="px-3 py-2">
                        <div className="truncate text-[13px] font-bold">{label}</div>
                        <div className="truncate text-[12px] uppercase text-app-ink-soft">{tokens[key]}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">Your store uses the default colours. Pick a theme in the store editor to set your own.</p>
              )}
            </Card>

            <Card className="p-5">
              <CardHead title="Type and shape" />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[18px] border border-app-line p-4">
                  <div className="text-[13px] text-app-ink-soft">Headings</div>
                  <div
                    className="mt-1 truncate text-[30px] font-extrabold leading-tight tracking-[-0.6px]"
                    style={tokens?.headingStyle === "serif" ? { fontFamily: "Fraunces, Georgia, serif", fontWeight: 500 } : undefined}
                  >
                    {store.name}
                  </div>
                  <div className="mt-2 text-[13px] font-bold">{tokens?.headingStyle === "serif" ? "Serif" : "Sans serif"}</div>
                </div>
                <div className="rounded-[18px] border border-app-line p-4">
                  <div className="text-[13px] text-app-ink-soft">Body text</div>
                  <p className="mb-0 mt-1 text-[14.5px] leading-[1.55]">{store.description || "Your store description shows here. Add one in Settings."}</p>
                  <div className="mt-2 text-[13px] font-bold">{tokens ? RADIUS_LABEL[tokens.radius] : "Default corners"}</div>
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <CardHead title="Voice" sub="How Peggy writes for you: product copy, messages and emails." />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {settings.chipTone ? <Pill tone="ink">{settings.chipTone}</Pill> : <Pill>Not set</Pill>}
                {template?.templateName && <Pill tone="info">Template · {template.templateName}</Pill>}
                {template?.category && <Pill>{template.category}</Pill>}
              </div>
            </Card>
          </div>

          <aside className="grid min-w-0 content-start gap-5 xl:sticky xl:top-4 xl:self-start">
            <Card className="p-5">
              <CardHead title="Preview" />
              <div className="mx-auto mt-4 w-full max-w-[260px] overflow-hidden rounded-[22px] border-[3px] border-app-line" style={{ background: tokens?.paperBg ?? "#FFFFFF" }}>
                <div className="flex h-12 items-center justify-center gap-2 px-3" style={{ background: tokens?.heroBg ?? "#16141F", color: tokens?.heroText ?? "#FFFFFF" }}>
                  {store.logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={store.logoUrl} alt="" className="h-6 w-6 rounded object-contain" />
                  )}
                  <span className="truncate text-[14px] font-bold">{store.name}</span>
                </div>
                <div className="grid gap-2.5 p-4">
                  <div className="h-24 rounded-[10px]" style={{ background: tokens?.cardBg ?? "#F6F5FA", border: `1px solid ${tokens?.border ?? "#E8E6F0"}` }} />
                  <div className="h-3 w-3/4 rounded" style={{ background: tokens?.ink ?? "#16141F", opacity: 0.8 }} />
                  <div className="h-2.5 w-1/2 rounded" style={{ background: tokens?.muted ?? "#8A8797" }} />
                  <div className="mt-1 grid h-9 place-items-center rounded-full text-[12px] font-bold" style={{ background: tokens?.ctaBg ?? "#16141F", color: tokens?.ctaText ?? "#FFFFFF" }}>
                    Shop now
                  </div>
                </div>
              </div>
              {store.slug && (
                <div className="mt-4 flex justify-center">
                  <PillLink href={`/s/${store.slug}`} size="sm" icon="eye">Open my store</PillLink>
                </div>
              )}
            </Card>
            <AssistantNote who="rex" action={<PillLink href="/home/editor" size="sm" tone="ink">Ask Rex</PillLink>}>
              Want a new look? Tell me a mood like &ldquo;earthy and bold&rdquo; in the store editor and I&apos;ll redo your colours.
            </AssistantNote>
          </aside>
        </div>
      )}
    </SellerPage>
  );
}

function LogoTile({ bg, fg, logoUrl, name, label }: { bg: string; fg: string; logoUrl: string | null; name: string; label: string }) {
  return (
    <figure className="m-0 min-w-0">
      <div className="grid aspect-[16/10] place-items-center overflow-hidden rounded-[18px] border border-app-line p-4" style={{ background: bg, color: fg }}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={`${name} logo`} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="max-w-full truncate text-[22px] font-extrabold tracking-[-0.4px]">{name}</span>
        )}
      </div>
      <figcaption className="mt-1.5 text-center text-[12.5px] text-app-ink-soft">{label}</figcaption>
    </figure>
  );
}
