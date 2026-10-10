"use client";

import { PortalErrorState } from "@/components/role/PortalStates";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <PortalErrorState role="logistics_partner" error={error} unstable_retry={unstable_retry} />;
}
