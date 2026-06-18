"use client";

import { useState, useEffect, useCallback } from "react";

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
    memory.category && `Category: ${memory.category}`,
    memory.productsAdded && "✓ Products added",
    memory.pagesCreated && "✓ Pages created",
    memory.storePublished && "✓ Published",
  ].filter(Boolean);

  if (items.length === 0) return null;

  return (
    <div style={{
      position: "fixed", bottom: 16, right: 16, zIndex: 9998,
      padding: "12px 16px", borderRadius: 12,
      background: "var(--paper)",
      border: "1px solid var(--ink-150)",
      boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
      fontSize: 12, color: "var(--ink-700)",
      maxWidth: 240,
    }}>
      <div style={{ fontWeight: 600, fontSize: 11, color: "var(--teal-700)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Rex remembers
      </div>
      {items.map((item, i) => (
        <div key={i} style={{ padding: "2px 0" }}>{item}</div>
      ))}
      <button
        onClick={clear}
        style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: 11, color: "var(--ink-400)", textDecoration: "underline",
          padding: 0, marginTop: 4,
        }}
      >
        Clear memory
      </button>
    </div>
  );
}
