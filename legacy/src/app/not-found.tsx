import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <h1 className="font-display text-6xl font-bold tracking-tight">404</h1>
      <p className="mt-4 text-lg text-stone-500">This page doesn&apos;t exist.</p>
      <Link
        href="/"
        className="mt-8 rounded-lg bg-stone-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-stone-700"
      >
        Go home
      </Link>
    </div>
  );
}
