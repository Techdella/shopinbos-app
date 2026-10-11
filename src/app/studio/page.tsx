import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Pill, PillLink } from "@/components/app-kit";
import { Mascot } from "@/components/app-ui";
import { Icon, type IconName } from "@/components/ui/Icon";

export const dynamic = "force-dynamic";

const tools: Array<{ icon: IconName; title: string; description: string; features: string[]; cta: string; href: string }> = [
  {
    icon: "palette",
    title: "Logo",
    description: "Describe your brand and Rex draws logo ideas for your store.",
    features: ["AI logos", "Matches your colours", "Three styles"],
    cta: "Make a logo",
    href: "/studio/logo",
  },
  {
    icon: "document",
    title: "Pages",
    description: "Build and change store pages by dragging sections. Start from a template or a blank page.",
    features: ["Drag and drop", "Templates", "Works on phones"],
    cta: "Build pages",
    href: "/builder/editor",
  },
  {
    icon: "image",
    title: "Images",
    description: "Product photos, banners and brand pictures. Describe what you need and Rex makes it.",
    features: ["Product photos", "Banners", "On-brand style"],
    cta: "Make images",
    href: "/studio/images",
  },
  {
    icon: "edit",
    title: "Store editor",
    description: "The full visual editor with a live preview. Change colours, layout and words, then publish.",
    features: ["Live preview", "Your theme", "Publish in one tap"],
    cta: "Open editor",
    href: "/builder/editor",
  },
];

export default async function StudioPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);

  return (
    <SellerPage user={user} store={storeSummary(workspace?.store ?? null)} title="Rex Studio" sub="Build and dress your store with Rex.">
      <div className="grid gap-5">
        <section className="flex flex-wrap items-center gap-4 rounded-[22px] bg-app-peach p-5 sm:p-6">
          <Mascot name="rex" className="h-16 w-16 shrink-0" />
          <div className="min-w-0 flex-1 basis-[240px]">
            <h2 className="m-0 text-[20px] font-extrabold tracking-[-0.3px]">Hey, I&apos;m Rex</h2>
            <p className="mb-0 mt-1 text-[14.5px] leading-[1.55]">I help you build your store: logos, pages, pictures and the whole design. Pick a tool to start.</p>
          </div>
        </section>

        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 2xl:grid-cols-4">
          {tools.map((tool) => (
            <li key={tool.title} className="flex min-w-0 flex-col gap-3 rounded-[22px] border border-app-line bg-white p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-app-canvas"><Icon name={tool.icon} size={20} /></span>
                <h2 className="m-0 text-[17px] font-extrabold">{tool.title}</h2>
              </div>
              <p className="m-0 text-[14px] leading-[1.55] text-app-ink-soft">{tool.description}</p>
              <div className="flex flex-wrap gap-1.5">
                {tool.features.map((f) => <Pill key={f}>{f}</Pill>)}
              </div>
              <div className="mt-auto pt-2">
                <PillLink href={tool.href} tone="ink" size="sm" className="min-h-[40px]">{tool.cta} <Icon name="arrow" size={14} /></PillLink>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </SellerPage>
  );
}
