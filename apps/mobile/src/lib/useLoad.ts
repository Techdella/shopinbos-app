import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { tNow } from "./app-locale";

/**
 * Loads one screen's data: first load, pull to refresh (`refreshing`), reload when the screen comes back
 * into focus (after a reply, an edit on the web, …) and a readable error. Keeps the last good data on screen
 * when a refresh fails. Pass `key` when the loader depends on something that changes (a filter, an id).
 */
export function useLoad<T>(load: () => Promise<T>, key = "") {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which `key` the data on screen was loaded for; `loading` until the first answer for the current key.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loader = useRef(load);
  useLayoutEffect(() => {
    loader.current = load;
  });
  const focused = useRef(false);
  const latest = useRef(0);

  const reload = useCallback(async () => {
    // Only the newest request lands (switching filters quickly can answer out of order).
    const run = ++latest.current;
    try {
      const next = await loader.current();
      if (run !== latest.current) return;
      setData(next);
      setError(null);
    } catch (loadError) {
      if (run !== latest.current) return;
      setError(loadError instanceof Error ? loadError.message : tNow("m_ui")("loadFailed"));
    } finally {
      // `key` (a filter, an id) starts a fresh load when it changes; `load` itself is read from the ref.
      setLoadedKey(key);
    }
  }, [key]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Reload quietly when coming back to the screen (not on the first focus, which the effect above covers).
  useFocusEffect(
    useCallback(() => {
      if (focused.current) void reload();
      focused.current = true;
    }, [reload]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  return { data, setData, error, loading: loadedKey !== key, refreshing, refresh, reload };
}
