// Some browsers deny site storage (blocked cookies/site data, some in-app WebViews): just reading
// window.sessionStorage throws "SecurityError: Access is denied for this document". Supabase's browser client
// touches it while being created, so sign-up broke. When storage is denied, swap in an in-memory Storage that
// lasts for the page, so the app keeps working (the session itself lives in cookies).

export function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(String(key)) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(String(key)),
    setItem: (key, value) => void items.set(String(key), String(value)),
  };
}

function usable(target: Window, name: "sessionStorage" | "localStorage") {
  try {
    const storage = target[name];
    storage.getItem("__shopinbos_probe");
    return true;
  } catch {
    return false;
  }
}

/** Make window.sessionStorage and window.localStorage safe to use; returns which ones were replaced. */
export function ensureUsableStorage(target: Window | undefined = typeof window === "undefined" ? undefined : window) {
  const replaced: string[] = [];
  if (!target) return replaced;
  for (const name of ["sessionStorage", "localStorage"] as const) {
    if (usable(target, name)) continue;
    try {
      Object.defineProperty(target, name, { value: memoryStorage(), configurable: true, writable: false });
      replaced.push(name);
    } catch {
      // Can't replace it either; callers still guard their own storage use.
    }
  }
  return replaced;
}
