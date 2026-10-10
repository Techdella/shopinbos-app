"use client";

export default function AdminErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4" style={{ background: "var(--canvas)" }}>
      <h1 className="font-display text-6xl font-bold tracking-tight text-[var(--ink-900)]">500</h1>
      <p className="mt-4 text-lg text-[var(--ink-500)]">Something went wrong in the admin panel.</p>
      <p className="mt-1 text-sm text-[var(--ink-400)]">
        {error.digest ? `Error ID: ${error.digest}` : "An unexpected error occurred."}
      </p>
      <button
        onClick={() => reset()}
        className="mt-8 rounded-lg bg-[var(--teal-700)] px-6 py-3 text-sm font-medium text-white transition hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
