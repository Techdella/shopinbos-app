"use client";

import { AppError } from "@/components/errors/AppErrorPages";

export default function ErrorPage({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <AppError error={error} retry={unstable_retry} />;
}
