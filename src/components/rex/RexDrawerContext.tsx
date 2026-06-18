"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { AssistantRexDrawer } from "./AssistantRexDrawer";
import { ChipDrawer } from "@/components/chip/ChipDrawer";

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

export function RexDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialMessage, setInitialMessage] = useState<string | undefined>();

  const openDrawer = useCallback((msg?: string) => {
    setInitialMessage(msg);
    setIsOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
    setInitialMessage(undefined);
  }, []);

  return (
    <RexDrawerContext.Provider value={{ isOpen, openDrawer, closeDrawer }}>
      {children}
      <AssistantRexDrawer
        isOpen={isOpen}
        onClose={closeDrawer}
        initialMessage={initialMessage}
      />
      <ChipDrawer />
    </RexDrawerContext.Provider>
  );
}
