import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4" style={{ background: "var(--canvas)" }}>
      <h1 className="font-display text-6xl font-bold tracking-tight text-[var(--ink-900)]">404</h1>
      <p className="mt-4 text-lg text-[var(--ink-500)]">Admin page not found.</p>
      <Link
        href="/admin/dashboard"
        className="mt-8 rounded-lg bg-[var(--teal-700)] px-6 py-3 text-sm font-medium text-white transition hover:opacity-90"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
