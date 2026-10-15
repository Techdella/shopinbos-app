"use client";

import { confirmDialog } from "@/components/ui/dialogs";
import type { ReactNode } from "react";

/** Submit button for a server-action form that asks first ("Delete this campaign?"). */
export function ConfirmSubmit({ message, className, children, formAction }: { message: string; className?: string; children: ReactNode; formAction?: (formData: FormData) => void | Promise<void> }) {
  return (
    <button
      type="submit"
      formAction={formAction}
      className={className}
      onClick={(event) => {
        // Hold the submit, ask in-app, then submit through this same button (no click event, so no second ask) so its formAction still applies.
        event.preventDefault();
        const button = event.currentTarget;
        void confirmDialog(message).then((ok) => {
          if (!ok) return;
          button.form?.requestSubmit(button);
        });
      }}
    >
      {children}
    </button>
  );
}
