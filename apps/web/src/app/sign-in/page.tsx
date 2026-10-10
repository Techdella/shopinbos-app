import type { Metadata } from 'next';
import Image from 'next/image';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage() {
  return (
    <main className="bg-wash flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center gap-3">
          <Image src="/rex.png" alt="" width={56} height={56} priority />
          <div>
            <p className="text-sm font-semibold text-sub">Shopinbos</p>
            <h1 className="text-2xl font-extrabold tracking-tight">Sign in or start your shop</h1>
          </div>
        </div>
        <SignInForm />
        <p className="mt-6 text-center text-sm text-sub">No passwords. We send you a code.</p>
      </div>
    </main>
  );
}
