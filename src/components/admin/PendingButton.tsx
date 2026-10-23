"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

// A submit button for server-action forms that shows it's working ("Switching…") and can't be pressed twice, so a
// slow action (like sending templates to Meta) never looks like the button did nothing.
export function PendingButton({ children, pending, className, name, value }: { children: ReactNode; pending: string; className: string; name?: string; value?: string }) {
  const status = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={status.pending} aria-busy={status.pending} className={`${className} disabled:cursor-wait disabled:opacity-60`}>
      {status.pending ? pending : children}
    </button>
  );
}
