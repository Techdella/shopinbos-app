import type { ComponentProps } from "react";
import { AppPage, Card, CardHead, EmptyState, ListCard, ListRow, Pill } from "@/components/app-kit";
import { Field, buttonClass, fieldClass, formatDate } from "@/components/admin/AdminKit";
import { saveAppReleaseAction } from "@/app/actions/app-release";
import { APP_RELEASE_MESSAGE_MAX, PLAY_STORE_WEB_URL, parseAppRelease, type AppRelease, type AppReleasePlatform } from "@shared/app-release";

// Admin › App updates, the page itself (src/app/admin/app-release/page.tsx loads the data and checks access).

export type AppReleaseHistoryRow = { id: string; key: string; before: unknown; after: unknown; note: string | null; createdAt: Date | string; changedBy: { name: string | null; email: string | null } | null };

function releaseLine(value: unknown) {
  if (value === null || value === undefined) return "Not set";
  const release = parseAppRelease(value);
  return `Latest ${release.latestBuild || "—"} · minimum ${release.minBuild || "—"}${release.message ? ` · “${release.message}”` : ""}`;
}

const PLATFORMS: Record<AppReleasePlatform, { name: string; store: string; storeUrl: string; buildHint: string }> = {
  android: {
    name: "Android app",
    store: "Google Play",
    storeUrl: PLAY_STORE_WEB_URL,
    buildHint: "Build numbers are the versionCode of the build (EAS counts them up; it shows next to each release in Google Play Console).",
  },
  ios: {
    name: "iPhone app",
    store: "the App Store",
    storeUrl: "",
    buildHint:
      "Build numbers are the iOS build number (EAS counts them up; App Store Connect shows it in brackets after the version, e.g. 1.0.0 (12)). Only iPhone builds made with EXPO_PUBLIC_IOS_APP_STORE_URL set are asked to update.",
  },
};

function PlatformCard({ platform, release }: { platform: AppReleasePlatform; release: AppRelease }) {
  const info = PLATFORMS[platform];
  const short = platform === "ios" ? "iPhone" : "Android";
  return (
    <Card className="mb-5 p-5">
      <CardHead
        title={info.name}
        sub={
          <>
            {info.buildHint}
            {info.storeUrl ? (
              <>
                {" "}
                <a href={info.storeUrl} target="_blank" rel="noreferrer" className="font-bold underline">Open the store listing</a>
              </>
            ) : null}
          </>
        }
      />
      <div className="mt-3 grid gap-1 text-[14px]">
        <div className="flex gap-2"><span className="w-[130px] shrink-0 font-bold">Latest build</span><span>{release.latestBuild || "Not set: no one is asked to update"}</span></div>
        <div className="flex gap-2"><span className="w-[130px] shrink-0 font-bold">Minimum build</span><span>{release.minBuild || "Not set: every version keeps working"}</span></div>
        {release.message ? <div className="flex gap-2"><span className="w-[130px] shrink-0 font-bold">Message</span><span className="min-w-0">{release.message}</span></div> : null}
      </div>

      <form action={saveAppReleaseAction} className="mt-5 grid gap-4">
        <input type="hidden" name="platform" value={platform} />
        <p className="m-0 rounded-[14px] bg-app-canvas px-4 py-3 text-[14px] font-bold">Set the latest build only after the version is live on {info.store}.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Latest build" htmlFor={`${platform}-latestBuild`} hint="Older builds see “A new version of Shopinbos is ready” (they can choose Later; it asks again after 3 days). 0: off.">
            <input id={`${platform}-latestBuild`} name="latestBuild" type="number" min={0} step={1} defaultValue={release.latestBuild} required className={fieldClass} />
          </Field>
          <Field label="Minimum build" htmlFor={`${platform}-minBuild`} hint="Builds below this must update before they can use the app. Use only when an old version can't work any more. 0: off.">
            <input id={`${platform}-minBuild`} name="minBuild" type="number" min={0} step={1} defaultValue={release.minBuild} required className={fieldClass} />
          </Field>
        </div>
        <Field label="Message (optional)" htmlFor={`${platform}-message`} hint="One short line under the title, e.g. what's new. Shown as written in every language.">
          <input id={`${platform}-message`} name="message" maxLength={APP_RELEASE_MESSAGE_MAX} defaultValue={release.message ?? ""} placeholder="Faster photos and a simpler Orders screen." className={fieldClass} />
        </Field>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Note (optional)" htmlFor={`${platform}-note`} className="min-w-[220px] flex-1">
            <input id={`${platform}-note`} name="note" maxLength={500} placeholder="Why it changed" className={fieldClass} />
          </Field>
          <button type="submit" className={buttonClass("ink")}>Save {short}</button>
        </div>
      </form>
    </Card>
  );
}

export function AppReleaseAdmin({ frame, query, releases, history }: { frame: ComponentProps<typeof AppPage>["frame"]; query: { saved?: string; error?: string }; releases: Record<AppReleasePlatform, AppRelease>; history: AppReleaseHistoryRow[] }) {
  return (
    <AppPage frame={frame} title="App updates" sub="Tell people on an older phone app that a new version is in the store, or make a version that's too old update first.">
      {query.error ? (
        <div role="alert" className="mb-5 rounded-[22px] border border-app-danger bg-white p-4 text-[14px] text-app-danger">{query.error}</div>
      ) : query.saved ? (
        <div role="status" className="mb-5 rounded-[22px] border border-app-line bg-white p-4 text-[14px]">{query.saved}</div>
      ) : null}

      <PlatformCard platform="android" release={releases.android} />
      <PlatformCard platform="ios" release={releases.ios} />

      <h2 className="mb-3 mt-8 text-[17px] font-extrabold">Change history</h2>
      {history.length ? (
        <ListCard>
          {history.map((row) => (
            <ListRow key={row.id}>
              <div className="min-w-0 flex-1 basis-[240px]">
                <div className="text-[14.5px] font-extrabold">{row.key === "app.release.android" ? "Android app" : row.key === "app.release.ios" ? "iPhone app" : row.key}</div>
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
