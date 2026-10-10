import 'server-only';
import {
  memoryCounterStore,
  upstashCounterStore,
  type CounterStore,
} from '@shopinbos/integrations/ratelimit';

let store: CounterStore | undefined;

/** Upstash when configured, otherwise in-memory (dev only; not shared across instances). */
export function counters(): CounterStore {
  if (!store) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) store = upstashCounterStore(url, token);
    else {
      if (process.env.NODE_ENV === 'production')
        console.warn('[ratelimit] Upstash not configured; using memory store');
      store = memoryCounterStore();
    }
  }
  return store;
}

export function clientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}
