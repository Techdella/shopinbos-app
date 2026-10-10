"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <h1 className="font-display text-6xl font-bold tracking-tight">500</h1>
      <p className="mt-4 text-lg text-stone-500">Something went wrong.</p>
      <p className="mt-1 text-sm text-stone-400">
        {error.digest ? `Error ID: ${error.digest}` : "An unexpected error occurred."}
      </p>
      <button
        onClick={() => reset()}
        className="mt-8 rounded-lg bg-stone-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-stone-700"
      >
        Try again
      </button>
    </div>
  );
}
