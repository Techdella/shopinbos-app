"use client";

import { PortalError } from "@/components/errors/PortalErrorPages";

export default function Error({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <PortalError portal="seller" error={error} retry={unstable_retry} />;
}
