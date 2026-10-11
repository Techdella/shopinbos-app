"use client";

import type { ReactNode } from "react";

/** Submit button for a server-action form that asks first ("Delete this campaign?"). */
export function ConfirmSubmit({ message, className, children, formAction }: { message: string; className?: string; children: ReactNode; formAction?: (formData: FormData) => void | Promise<void> }) {
  return (
    <button
      type="submit"
      formAction={formAction}
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
