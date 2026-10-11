"use client";

import { useState, useEffect, useCallback } from "react";
import { Icon } from "@/components/ui/Icon";

const MEMORY_KEY = "shopinbos-rex-memory";

export interface RexMemory {
  storeName?: string;
  category?: string;
  palette?: string;
  logoStyle?: string;
  productsAdded: boolean;
  pagesCreated: boolean;
  storePublished: boolean;
  lastPhase?: string;
  preferences?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export function getRexMemory(): RexMemory | null {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveRexMemory(data: Partial<RexMemory>): void {
  try {
    const current = getRexMemory() ?? {
      productsAdded: false,
      pagesCreated: false,
      storePublished: false,
      createdAt: new Date().toISOString(),
    };
    const updated: RexMemory = {
      ...current,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(MEMORY_KEY, JSON.stringify(updated));
  } catch {
    // storage unavailable
  }
}

export function clearRexMemory(): void {
  try {
    localStorage.removeItem(MEMORY_KEY);
  } catch {
    // storage unavailable
  }
}

export function useRexMemory(): {
  memory: RexMemory | null;
  save: (data: Partial<RexMemory>) => void;
  clear: () => void;
} {
  const [memory, setMemory] = useState<RexMemory | null>(null);

  useEffect(() => {
    setMemory(getRexMemory());
  }, []);

  const save = useCallback((data: Partial<RexMemory>) => {
    saveRexMemory(data);
    setMemory(getRexMemory());
  }, []);

  const clear = useCallback(() => {
    clearRexMemory();
    setMemory(null);
  }, []);

  return { memory, save, clear };
}

export function RexMemoryIndicator() {
  const { memory, clear } = useRexMemory();

  if (!memory) return null;

  const items = [
    memory.storeName && `Store: ${memory.storeName}`,
    memory.category && `Sells: ${memory.category}`,
    memory.productsAdded && "Products added",
    memory.pagesCreated && "Pages written",
    memory.storePublished && "Published",
  ].filter((item): item is string => Boolean(item));

  if (items.length === 0) return null;

  return (
    <aside aria-label="What Rex remembers" className="fixed bottom-4 right-4 z-[9998] w-[240px] max-w-[calc(100vw-32px)] rounded-[18px] border border-app-line bg-white px-4 py-3 font-app text-[13px] text-app-ink shadow-[0_6px_18px_rgba(22,20,31,0.08)]">
      <p className="m-0 mb-1.5 text-[13px] font-extrabold">Rex remembers</p>
      <ul className="m-0 grid list-none gap-1 p-0">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-1.5">
            <Icon name="check" size={12} className="shrink-0 text-app-success" />
            <span className="truncate">{item}</span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={clear} className="mt-2 min-h-[32px] p-0 text-[12.5px] font-bold text-app-ink-soft underline-offset-4 hover:text-app-ink hover:underline">
        Clear memory
      </button>
    </aside>
  );
}
