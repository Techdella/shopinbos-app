import type { Metadata } from "next";
import { AppPage, EmptyState, FilterChips, Pill, PillLink } from "@/components/app-kit";
import { CountRow, adminFrame, buttonClass, fieldClass, formatDate, withParams } from "@/components/admin/AdminKit";
import { PendingButton } from "@/components/admin/PendingButton";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { storiesForReview, storyCounts, videoSample } from "@/lib/member-messaging/stories.server";
import { STORY_STATUS_LABEL } from "@shared/member-stories";
import { decideStory, setVideoSample } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Member stories" };

// Admin › Member stories: stories members shared (with consent) for the weekly tips. Approve before they're used;
// a withdrawn story can't be approved. Plus the sample Rex video for video tips.

const STATUSES = ["submitted", "approved", "rejected", "withdrawn"] as const;
const ROLE: Record<string, string> = { seller: "Seller", supplier: "Supplier", logistics_partner: "Delivery partner" };
const TONE: Record<string, "warning" | "success" | "muted" | "danger"> = { submitted: "warning", approved: "success", rejected: "muted", withdrawn: "danger" };

export default async function AdminMemberStoriesPage(props: { searchParams?: Promise<{ status?: string; saved?: string; error?: string }> }) {
  const admin = await requireAdminSection("leads");
  const params = (await props.searchParams) ?? {};
  const status = STATUSES.find((value) => value === params.status);
  const [stories, counts, sample] = await Promise.all([storiesForReview(status), storyCounts(), videoSample()]);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const back = withParams("/admin/member-stories", { status });

  return (
    <AppPage
      frame={adminFrame(admin, "Search")}
      title="Member stories"
      sub="Stories members shared for the weekly tips, with their consent. Approve one and it starts appearing in tip emails for that kind of business; the member can withdraw it any time."
      toolbar={
        <FilterChips
          items={[
            { label: "All", count: total, href: "/admin/member-stories", active: !status },
            ...STATUSES.map((value) => ({ label: STORY_STATUS_LABEL[value], count: counts[value] ?? 0, href: withParams("/admin/member-stories", { status: value }), active: status === value })),
          ]}
        />
      }
      actions={<PillLink href="/admin/member-tips" icon="arrowLeft">Member tips</PillLink>}
    >
      {params.saved && <p role="status" className="mb-4 rounded-[14px] bg-app-success-tint px-4 py-3 text-[14px] font-bold text-app-success">Saved.</p>}
      {params.error && <p role="alert" className="mb-4 rounded-[14px] bg-app-danger-tint px-4 py-3 text-[14px] font-bold text-app-danger">{params.error.slice(0, 200)}</p>}

      <CountRow items={STATUSES.map((value) => ({ label: STORY_STATUS_LABEL[value], value: counts[value] ?? 0 }))} />

      {stories.length === 0 ? (
        <EmptyState icon="chat" title="No stories here yet">
          Members share them from &ldquo;Share your story&rdquo; (the link at the end of every tip email, or /story).
        </EmptyState>
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0">
          {stories.map((story) => (
            <li key={story.id} className="rounded-[18px] border border-app-line bg-white p-5">
              <div className="flex flex-wrap items-start gap-4">
                {story.posterUrl && story.videoUrl && (
                  <a href={story.videoUrl} target="_blank" rel="noreferrer" className="block shrink-0" aria-label="Watch their Rex video">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={story.posterUrl} alt="" className="h-[120px] w-[90px] rounded-[12px] object-cover" />
                  </a>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={TONE[story.status] ?? "muted"} dot>{STORY_STATUS_LABEL[story.status] ?? story.status}</Pill>
                    <Pill tone="muted">{ROLE[story.role] ?? story.role}</Pill>
                    {story.language !== "en" && <Pill tone="info">{story.language}</Pill>}
                  </div>
                  {story.result && <p className="m-0 mt-2 text-[15px] font-extrabold">{story.result}</p>}
                  <p className="m-0 mt-1 text-[14.5px] leading-[1.6]">&ldquo;{story.story}&rdquo;</p>
                  <p className="m-0 mt-1 text-[13px] text-app-ink-soft">
                    {story.displayName}{story.city ? `, ${story.city}` : ""} · sent {formatDate(story.updatedAt)} · shown {story.timesShown}×
                    {story.reviewNote ? ` · note: ${story.reviewNote}` : ""}
                  </p>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[13px] font-bold text-app-ink-soft">Consent ({story.consentVersion}, {story.consentAt.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" })})</summary>
                    <p className="m-0 mt-2 rounded-[12px] bg-app-canvas p-3 text-[13px] leading-[1.55]">{story.consentText}</p>
                  </details>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <PillLink href={`/admin/support/new?to=user:${story.userId}`} size="sm" icon="chat">Message</PillLink>
                </div>
              </div>
              {story.status !== "withdrawn" && (
                <form action={decideStory} className="mt-3 flex flex-wrap items-end gap-2 border-t border-app-line pt-3">
                  <input type="hidden" name="storyId" value={story.id} />
                  <input type="hidden" name="back" value={back} />
                  <label className="grid min-w-[220px] flex-1 gap-1 text-[12.5px] font-bold">
                    Note to the member (optional, shown if not used)
                    <input name="note" maxLength={300} className={fieldClass} />
                  </label>
                  {story.status !== "approved" && <PendingButton name="decision" value="approved" pending="Saving…" className={buttonClass("ink", "sm")}>Approve for the tips</PendingButton>}
                  {story.status !== "rejected" && <PendingButton name="decision" value="rejected" pending="Saving…" className={buttonClass("white", "sm")}>{story.status === "approved" ? "Stop using it" : "Don't use"}</PendingButton>}
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <section id="sample" aria-labelledby="sample-title" className="mt-6 rounded-[18px] border border-app-line bg-white p-5">
        <h2 id="sample-title" className="m-0 text-[17px] font-extrabold">Sample Rex video for video tips</h2>
        <p className="m-0 mt-1 text-[14px] text-app-ink-soft">
          Video tips show a Rex video: a member&apos;s (only when they shared it with their story), else the reader&apos;s own latest, else this sample.
          Use a Shopinbos demo here, not a member&apos;s video. {sample ? "A sample is set." : "No sample yet."}
        </p>
        <form action={setVideoSample} className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-[12.5px] font-bold">Video link (https)<input name="videoUrl" defaultValue={sample?.videoUrl ?? ""} className={fieldClass} /></label>
          <label className="grid gap-1 text-[12.5px] font-bold">Cover picture link (https)<input name="posterUrl" defaultValue={sample?.posterUrl ?? ""} className={fieldClass} /></label>
          <label className="grid gap-1 text-[12.5px] font-bold">Caption (optional)<input name="caption" maxLength={120} defaultValue={sample?.caption ?? ""} className={fieldClass} /></label>
          <div className="flex gap-2 md:col-span-3">
            <PendingButton pending="Saving…" className={buttonClass("ink", "sm")}>Save sample</PendingButton>
            {sample && <PendingButton name="clear" value="1" pending="Saving…" className={buttonClass("white", "sm")}>Remove</PendingButton>}
          </div>
        </form>
      </section>
    </AppPage>
  );
}
