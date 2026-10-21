"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChipDrawer } from "@/components/chip/ChipDrawer";

// "Ask Rex" from anywhere in the app. Rex has one chat (Rex Studio, /studio, with saved history), so opening him
// goes there, with the message (if any) ready in the chat box, instead of a separate drawer chat.

interface RexDrawerContextValue {
  isOpen: boolean;
  openDrawer: (initialMessage?: string) => void;
  closeDrawer: () => void;
}

const RexDrawerContext = createContext<RexDrawerContextValue | null>(null);

export function useRexDrawer() {
  const ctx = useContext(RexDrawerContext);
  if (!ctx) throw new Error("useRexDrawer must be used within RexDrawerProvider");
  return ctx;
}

/** The Rex Studio link for a message to put in the chat box. */
export function rexChatHref(message?: string) {
  const text = message?.trim();
  return text ? `/studio?prompt=${encodeURIComponent(text.slice(0, 2000))}` : "/studio";
}

export function RexDrawerProvider({ children, chipMessage }: { children: ReactNode; chipMessage?: string }) {
  const router = useRouter();
  const openDrawer = useCallback((message?: string) => router.push(rexChatHref(message)), [router]);
  const closeDrawer = useCallback(() => {}, []);

  return (
    <RexDrawerContext.Provider value={{ isOpen: false, openDrawer, closeDrawer }}>
      {children}
      <ChipDrawer message={chipMessage} />
    </RexDrawerContext.Provider>
  );
}
