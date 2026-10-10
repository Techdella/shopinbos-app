import Image from 'next/image';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="bg-wash flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <Image src="/peggy.png" alt="" width={96} height={96} />
      <h1 className="text-2xl font-extrabold tracking-tight">We can&apos;t find that page</h1>
      <p className="text-sub">The link may be wrong, or the shop has moved.</p>
      <Link
        href="https://shopinbos.com"
        className="mt-2 inline-flex min-h-11 items-center rounded-pill bg-ink px-5 font-semibold text-paper"
      >
        Go to Shopinbos
      </Link>
    </main>
  );
}
