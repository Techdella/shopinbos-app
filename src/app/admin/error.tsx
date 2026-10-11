"use client";

export default function AdminErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-app-canvas px-4 text-center font-app text-app-ink">
      <h1 className="m-0 text-[56px] font-extrabold tracking-[-1.5px]">500</h1>
      <p className="mb-0 mt-3 text-[17px] font-bold">Something went wrong in the admin panel.</p>
      <p className="mb-0 mt-1 text-[14px] text-app-ink-soft">
        {error.digest ? `Error ID: ${error.digest}` : "An unexpected error occurred."}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-8 inline-flex min-h-[48px] items-center rounded-full bg-app-ink px-6 text-[15px] font-extrabold text-white transition hover:bg-black"
      >
        Try again
      </button>
    </div>
  );
}
