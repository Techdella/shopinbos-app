import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-app-canvas px-4 text-center font-app text-app-ink">
      <h1 className="m-0 text-[56px] font-extrabold tracking-[-1.5px]">404</h1>
      <p className="mb-0 mt-3 text-[17px] text-app-ink-soft">This admin page does not exist.</p>
      <Link
        href="/admin/dashboard"
        className="mt-8 inline-flex min-h-[48px] items-center rounded-full bg-app-ink px-6 text-[15px] font-extrabold text-white no-underline transition hover:bg-black"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
