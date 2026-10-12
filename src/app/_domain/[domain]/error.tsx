"use client";

import { StorefrontError } from "@/components/errors/StorefrontErrorPages";

export default function StoreError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <StorefrontError error={error} retry={unstable_retry} />;
}
