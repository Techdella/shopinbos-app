/**
 * Fixed-window counters for rate limits and OTP lockouts.
 * Upstash Redis REST in production; in-memory for local dev and tests.
 */
export interface CounterStore {
  /** Increment and return the new count. The window starts at the first hit. */
  hit(key: string, windowSeconds: number): Promise<number>;
  get(key: string): Promise<number>;
  reset(key: string): Promise<void>;
}

export function memoryCounterStore(now: () => number = Date.now): CounterStore {
  const map = new Map<string, { count: number; expiresAt: number }>();
  const live = (key: string) => {
    const v = map.get(key);
    if (v && v.expiresAt <= now()) {
      map.delete(key);
      return undefined;
    }
    return v;
  };
  return {
    async hit(key, windowSeconds) {
      const v = live(key) ?? { count: 0, expiresAt: now() + windowSeconds * 1000 };
      v.count += 1;
      map.set(key, v);
      return v.count;
    },
    async get(key) {
      return live(key)?.count ?? 0;
    },
    async reset(key) {
      map.delete(key);
    },
  };
}

export function upstashCounterStore(
  url: string,
  token: string,
  doFetch: typeof fetch = fetch,
): CounterStore {
  const pipeline = async (commands: (string | number)[][]) => {
    const res = await doFetch(`${url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
    });
    if (!res.ok) throw new Error(`Upstash error ${res.status}`);
    return (await res.json()) as { result: unknown; error?: string }[];
  };
  return {
    async hit(key, windowSeconds) {
      const [incr] = await pipeline([
        ['INCR', key],
        ['EXPIRE', key, windowSeconds, 'NX'],
      ]);
      return Number(incr?.result ?? 0);
    },
    async get(key) {
      const [r] = await pipeline([['GET', key]]);
      return Number(r?.result ?? 0);
    },
    async reset(key) {
      await pipeline([['DEL', key]]);
    },
  };
}

export interface LimitResult {
  allowed: boolean;
  count: number;
  limit: number;
}

export async function limit(
  store: CounterStore,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<LimitResult> {
  const count = await store.hit(key, windowSeconds);
  return { allowed: count <= max, count, limit: max };
}
