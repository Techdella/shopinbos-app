import { useCallback, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { ApiError } from "./api";
import { fetchDashboard, type Dashboard } from "./dashboard";
import { cacheDashboard, cachedDashboard, markHomeOpened, rememberStoreName, type CachedDashboard } from "./launch";
import { tNow } from "./app-locale";

/** Show the slow-network screen if Home still has nothing after this long. */
export const SLOW_AFTER_MS = 8000;
/** Give up on one request after this long and retry (counts as slow, not offline). */
const ATTEMPT_TIMEOUT_MS = 20_000;
/** Automatic retries back off up to 30 seconds. */
const BACKOFF_MS = [2000, 4000, 8000, 15_000, 30_000];

export interface HomeData {
  /** Fresh data, or the cached copy once the seller chose to see it. */
  data: Dashboard | null;
  /** Set while `data` is the cached copy (when it was saved). */
  cachedAt: number | null;
  /** The last Home saved on this phone, if any. */
  cached: CachedDashboard | null;
  /** A server error worth showing on Home (not network trouble). */
  error: string | null;
  /** Home has nothing to show yet and the network is slow or unreachable. */
  slow: boolean;
  /** The last request couldn't reach Shopinbos at all (as opposed to timing out). */
  offline: boolean;
  attempting: boolean;
  nextRetryAt: number | null;
  reload: () => Promise<void>;
  showCached: () => void;
}

/**
 * Loads the seller's Home (GET /api/app/dashboard), saves each good response on the phone, and handles slow
 * or missing networks: after 8 seconds (or straight away when offline) `slow` turns on, requests retry with
 * backoff, and the seller can choose to see the last saved Home meanwhile.
 */
export function useHomeData(uid: string | undefined): HomeData {
  const [data, setData] = useState<Dashboard | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [cached, setCached] = useState<CachedDashboard | null>(() => (uid ? cachedDashboard(uid) : null));
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [offline, setOffline] = useState(false);
  const [attempting, setAttempting] = useState(false);
  const [nextRetryAt, setNextRetryAt] = useState<number | null>(null);

  const alive = useRef(true);
  const fresh = useRef(false); // fresh data is on screen
  const settled = useRef(false); // the first load finished one way or another (data or a server error)
  const failures = useRef(0);
  const inflight = useRef<Promise<void> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (uid) setCached(cachedDashboard(uid));
  }, [uid]);

  const clearRetry = () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
    setNextRetryAt(null);
  };

  const attempt = useCallback((): Promise<void> => {
    if (inflight.current) return inflight.current;
    clearRetry();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
    setAttempting(true);

    const run = (async () => {
      try {
        const next = await fetchDashboard({ signal: controller.signal });
        if (!alive.current) return;
        fresh.current = true;
        settled.current = true;
        failures.current = 0;
        setData(next);
        setCachedAt(null);
        setError(null);
        setSlow(false);
        setOffline(false);
        if (uid) {
          cacheDashboard(uid, next);
          markHomeOpened(uid);
          rememberStoreName(uid, next.store.name);
          setCached({ savedAt: Date.now(), data: next });
        }
      } catch (loadError) {
        if (!alive.current) return;
        if (loadError instanceof ApiError && loadError.status === 403) {
          // Supplier, logistics or admin account: More explains where to go.
          router.replace("/more");
          return;
        }
        const network = loadError instanceof ApiError && loadError.status === 0;
        if (!network || fresh.current) {
          // Server errors, or a failed pull-to-refresh with fresh data on screen: show the message on Home.
          settled.current = true;
          if (!fresh.current) setSlow(false);
          setError(loadError instanceof Error ? loadError.message : tNow("m_ui")("shopLoadFailed"));
          return;
        }
        // Nothing fresh on screen: show the slow screen (or keep the cached Home) and retry with backoff.
        setOffline(!controller.signal.aborted);
        setSlow(true);
        const wait = BACKOFF_MS[Math.min(failures.current, BACKOFF_MS.length - 1)];
        failures.current += 1;
        setNextRetryAt(Date.now() + wait);
        retryTimer.current = setTimeout(() => void attemptRef.current(), wait);
      } finally {
        clearTimeout(timeout);
        inflight.current = null;
        if (alive.current) setAttempting(false);
      }
    })();
    inflight.current = run;
    return run;
  }, [uid]);
  attemptRef.current = attempt;

  useEffect(() => {
    alive.current = true;
    void attempt();
    const slowTimer = setTimeout(() => {
      if (!fresh.current && !settled.current) setSlow(true);
    }, SLOW_AFTER_MS);
    return () => {
      clearTimeout(slowTimer);
    };
  }, [attempt]);

  useEffect(
    () => () => {
      alive.current = false;
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [],
  );

  const showCached = useCallback(() => {
    if (!cached) return;
    setData(cached.data);
    setCachedAt(cached.savedAt);
  }, [cached]);

  return { data, cachedAt, cached, error, slow, offline, attempting, nextRetryAt, reload: attempt, showCached };
}
