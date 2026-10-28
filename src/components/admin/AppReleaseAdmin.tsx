import type { ComponentProps } from "react";
import { AppPage, Card, CardHead, EmptyState, ListCard, ListRow, Pill } from "@/components/app-kit";
import { Field, buttonClass, fieldClass, formatDate } from "@/components/admin/AdminKit";
import { saveAppReleaseAction } from "@/app/actions/app-release";
import { APP_RELEASE_MESSAGE_MAX, PLAY_STORE_WEB_URL, parseAppRelease, type AppRelease } from "@shared/app-release";

// Admin › App updates, the page itself (src/app/admin/app-release/page.tsx loads the data and checks access).

export type AppReleaseHistoryRow = { id: string; key: string; before: unknown; after: unknown; note: string | null; createdAt: Date | string; changedBy: { name: string | null; email: string | null } | null };

function releaseLine(value: unknown) {
  if (value === null || value === undefined) return "Not set";
  const release = parseAppRelease(value);
  return `Latest ${release.latestBuild || "—"} · minimum ${release.minBuild || "—"}${release.message ? ` · “${release.message}”` : ""}`;
}

export function AppReleaseAdmin({ frame, query, release, history }: { frame: ComponentProps<typeof AppPage>["frame"]; query: { saved?: string; error?: string }; release: AppRelease; history: AppReleaseHistoryRow[] }) {
  return (
    <AppPage frame={frame} title="App updates" sub="Tell people on an older Android app that a new version is on Google Play, or make a version that's too old update first.">
      {query.error ? (
        <div role="alert" className="mb-5 rounded-[22px] border border-app-danger bg-white p-4 text-[14px] text-app-danger">{query.error}</div>
      ) : query.saved ? (
        <div role="status" className="mb-5 rounded-[22px] border border-app-line bg-white p-4 text-[14px]">{query.saved}</div>
      ) : null}

      <Card className="p-5">
        <CardHead
          title="Android app"
          sub={
            <>
              Build numbers are the versionCode of the build (EAS counts them up; it shows next to each release in Google Play Console).{" "}
              <a href={PLAY_STORE_WEB_URL} target="_blank" rel="noreferrer" className="font-bold underline">Open the Play Store listing</a>
            </>
          }
        />
        <div className="mt-3 grid gap-1 text-[14px]">
          <div className="flex gap-2"><span className="w-[130px] shrink-0 font-bold">Latest build</span><span>{release.latestBuild || "Not set: no one is asked to update"}</span></div>
          <div className="flex gap-2"><span className="w-[130px] shrink-0 font-bold">Minimum build</span><span>{release.minBuild || "Not set: every version keeps working"}</span></div>
          {release.message ? <div className="flex gap-2"><span className="w-[130px] shrink-0 font-bold">Message</span><span className="min-w-0">{release.message}</span></div> : null}
        </div>

        <form action={saveAppReleaseAction} className="mt-5 grid gap-4">
          <input type="hidden" name="platform" value="android" />
          <p className="m-0 rounded-[14px] bg-app-canvas px-4 py-3 text-[14px] font-bold">Set the latest build only after the version is live on Google Play.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Latest build" htmlFor="latestBuild" hint="Older builds see “A new version of Shopinbos is ready” (they can choose Later; it asks again after 3 days). 0: off.">
              <input id="latestBuild" name="latestBuild" type="number" min={0} step={1} defaultValue={release.latestBuild} required className={fieldClass} />
            </Field>
            <Field label="Minimum build" htmlFor="minBuild" hint="Builds below this must update before they can use the app. Use only when an old version can't work any more. 0: off.">
              <input id="minBuild" name="minBuild" type="number" min={0} step={1} defaultValue={release.minBuild} required className={fieldClass} />
            </Field>
          </div>
          <Field label="Message (optional)" htmlFor="message" hint="One short line under the title, e.g. what's new. Shown as written in every language.">
            <input id="message" name="message" maxLength={APP_RELEASE_MESSAGE_MAX} defaultValue={release.message ?? ""} placeholder="Faster photos and a simpler Orders screen." className={fieldClass} />
          </Field>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Note (optional)" htmlFor="note" className="min-w-[220px] flex-1">
              <input id="note" name="note" maxLength={500} placeholder="Why it changed" className={fieldClass} />
            </Field>
            <button type="submit" className={buttonClass("ink")}>Save Android</button>
          </div>
        </form>
      </Card>

      <p className="mt-4 text-[13px] text-app-ink-soft">The iPhone app isn't in the App Store yet, so iPhones are never asked to update.</p>

      <h2 className="mb-3 mt-8 text-[17px] font-extrabold">Change history</h2>
      {history.length ? (
        <ListCard>
          {history.map((row) => (
            <ListRow key={row.id}>
              <div className="min-w-0 flex-1 basis-[240px]">
                <div className="text-[14.5px] font-extrabold">{row.key === "app.release.android" ? "Android app" : row.key}</div>
                <div className="text-[13px] text-app-ink-soft">
                  {formatDate(row.createdAt)} · {row.changedBy?.name || row.changedBy?.email || "Unknown admin"}
                  {row.note ? ` · “${row.note}”` : ""}
                </div>
              </div>
              <Pill tone="muted">{releaseLine(row.before)}</Pill>
              <span aria-hidden className="text-app-ink-soft">→</span>
              <Pill tone="success">{releaseLine(row.after)}</Pill>
            </ListRow>
          ))}
        </ListCard>
      ) : (
        <EmptyState icon="clock" title="No changes yet">Every change shows here with who made it and why.</EmptyState>
      )}
    </AppPage>
  );
}
