// Sign-in, onboarding, the builder and other full-screen pages: the wordmark with the app's progress line.
// Signed-in portals have their own skeleton loaders (AppLoading); storefronts have an unbranded one.
export default function Loading() {
  return (
    <div className="app-scope grid min-h-dvh place-items-center bg-app-canvas font-app" role="status" aria-label="Loading">
      <div className="grid w-[180px] justify-items-center gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/app/wordmark-dark.png" alt="Shopinbos" className="block h-auto w-[160px]" />
        <span aria-hidden className="block h-[3px] w-full overflow-hidden rounded-full bg-app-line">
          <span className="app-loading-line block h-full w-1/3 rounded-full bg-app-accent" />
        </span>
      </div>
    </div>
  );
}
