"use client";

import "./globals.css";
import { GlobalAppError } from "@/components/errors/AppErrorPages";

// Replaces the root layout when it fails, so it brings its own <html>, <body> and styles.
export default function GlobalError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-full">
        <title>Something went wrong | Shopinbos</title>
        <GlobalAppError error={error} retry={unstable_retry} />
      </body>
    </html>
  );
}
