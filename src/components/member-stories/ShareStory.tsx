import { Icon } from "@/components/ui/Icon";
import { CONSENT_VERSION, STORY_LIMITS, STORY_STATUS_LABEL, consentText } from "@shared/member-stories";
import { deleteMyStory, submitStory, withdrawMyStory } from "@/app/actions/member-story";

// Share your story: what a member's story is for, the form with the consent wording in full, and the story they
// already sent (with Withdraw and Delete). Same page for sellers, suppliers and delivery partners.

type Story = { displayName: string; city: string | null; result: string | null; story: string; videoProjectId: string | null; status: string; consentAt: Date; reviewNote: string | null };
type Video = { id: string; title: string; posterUrl: string | null };

const field = "min-h-[44px] w-full rounded-[14px] border border-app-line bg-white px-4 text-[15px] text-app-ink outline-none focus:border-app-ink";
const label = "grid gap-1.5 text-[14px] font-bold";
const hint = "text-[12.5px] font-normal text-app-ink-soft";

export function ShareStory(props: {
  story: Story | null;
  videos: Video[];
  defaults: { displayName: string; city: string };
  flash: { saved?: boolean; withdrawn?: boolean; deleted?: boolean; error?: string | null };
}) {
  const { story, videos, defaults, flash } = props;
  const live = story && story.status !== "withdrawn";
  return (
    <div className="grid max-w-[760px] gap-5">
      {flash.saved && <p role="status" className="m-0 rounded-[14px] bg-app-success-tint px-4 py-3 text-[14px] font-bold text-app-success">Thank you! The team will read your story and let it into the tips once it&apos;s checked.</p>}
      {flash.withdrawn && <p role="status" className="m-0 rounded-[14px] bg-app-canvas px-4 py-3 text-[14px] font-bold">Done. Your story won&apos;t appear in any new emails.</p>}
      {flash.deleted && <p role="status" className="m-0 rounded-[14px] bg-app-canvas px-4 py-3 text-[14px] font-bold">Your story is deleted.</p>}
      {flash.error && <p role="alert" className="m-0 rounded-[14px] bg-app-danger-tint px-4 py-3 text-[14px] font-bold text-app-danger">{flash.error}</p>}

      <section className="rounded-[20px] bg-app-ink p-5 text-white sm:p-6">
        <p className="m-0 font-mono text-[11px] uppercase tracking-[0.16em] text-[#73D8C8]">From a real member</p>
        <h2 className="m-0 mt-2 text-[20px] font-bold leading-[1.25]">Your story can help another business take its first step</h2>
        <p className="m-0 mt-2 text-[14.5px] leading-[1.6] text-white/75">
          Rex and Peggy&apos;s weekly tips include a short story from a business like yours: what you did and what changed.
          We only use it if you say yes below, we never change your words or share your contact details, and you can stop it any time.
        </p>
      </section>

      {story && (
        <section aria-labelledby="your-story" className="rounded-[20px] border border-app-line bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="your-story" className="m-0 text-[17px] font-extrabold">Your story</h2>
            <span className="rounded-full bg-app-canvas px-3 py-1 text-[12.5px] font-bold">{STORY_STATUS_LABEL[story.status] ?? story.status}</span>
          </div>
          {story.result && <p className="m-0 mt-3 font-bold">{story.result}</p>}
          <p className="m-0 mt-2 text-[14.5px] leading-[1.6]">&ldquo;{story.story}&rdquo;</p>
          <p className="m-0 mt-2 text-[13px] text-app-ink-soft">{story.displayName}{story.city ? `, ${story.city}` : ""} · you agreed on {story.consentAt.toLocaleDateString("en-NG", { dateStyle: "medium", timeZone: "Africa/Lagos" })}</p>
          {story.status === "rejected" && story.reviewNote && <p className="m-0 mt-2 text-[13px] text-app-ink-soft">From the team: {story.reviewNote}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {live && (
              <form action={withdrawMyStory}>
                <button type="submit" className="inline-flex min-h-[40px] items-center rounded-full border border-app-line px-4 text-[13.5px] font-extrabold hover:border-app-line-strong">Stop using my story</button>
              </form>
            )}
            <form action={deleteMyStory}>
              <button type="submit" className="inline-flex min-h-[40px] items-center rounded-full px-4 text-[13.5px] font-bold text-app-danger hover:underline">Delete it</button>
            </form>
          </div>
        </section>
      )}

      <form action={submitStory} className="grid gap-4 rounded-[20px] border border-app-line bg-white p-5 sm:p-6">
        <h2 className="m-0 text-[17px] font-extrabold">{story ? "Send a new version" : "Share your story"}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            Name to show
            <input name="displayName" required maxLength={STORY_LIMITS.name} defaultValue={story?.displayName ?? defaults.displayName} className={field} />
            <span className={hint}>Like &ldquo;Kemi, Kemi&apos;s Fabrics&rdquo;. A first name is enough.</span>
          </label>
          <label className={label}>
            City (optional)
            <input name="city" maxLength={STORY_LIMITS.city} defaultValue={story?.city ?? defaults.city} className={field} />
          </label>
        </div>
        <label className={label}>
          What changed for you? (optional)
          <input name="result" maxLength={STORY_LIMITS.result} defaultValue={story?.result ?? ""} placeholder="40 orders in my first month" className={field} />
        </label>
        <label className={label}>
          Your story
          <textarea name="story" required minLength={STORY_LIMITS.storyMin} maxLength={STORY_LIMITS.story} rows={5} defaultValue={story?.story ?? ""} placeholder="What you sell, what you tried on Shopinbos, and what happened." className={`${field} py-3 leading-[1.55]`} />
          <span className={hint}>A few sentences, up to {STORY_LIMITS.story} characters. Leave out phone numbers, emails and links.</span>
        </label>
        {videos.length > 0 && (
          <label className={label}>
            Show one of your Rex videos (optional)
            <select name="videoProjectId" defaultValue={story?.videoProjectId ?? ""} className={field}>
              <option value="">No video</option>
              {videos.map((video) => <option key={video.id} value={video.id}>{video.title}</option>)}
            </select>
            <span className={hint}>Other sellers see its cover picture in the video tips and can watch it.</span>
          </label>
        )}
        <label className="flex items-start gap-3 rounded-[14px] bg-app-canvas p-4 text-[14px] leading-[1.55]">
          <input type="checkbox" name="consent" value="yes" required className="mt-1 h-4 w-4 shrink-0" />
          <span>{consentText()}</span>
        </label>
        <p className="m-0 text-[12.5px] text-app-ink-soft">
          Consent {CONSENT_VERSION}. We keep your story, this wording and the time you agreed. It&apos;s handled under the Nigeria Data Protection Act 2023; ask Support to see or delete anything we hold.
        </p>
        <button type="submit" className="inline-flex min-h-[46px] w-fit items-center gap-2 rounded-full bg-app-ink px-5 text-[14.5px] font-extrabold text-white hover:bg-black">
          <Icon name="send" size={15} /> {story ? "Send the new version" : "Send my story"}
        </button>
      </form>
    </div>
  );
}
