// The upload queue for "Add many with Peggy" (shared/bulk-products.ts): up to 300 photos go up a few at a time
// (BULK_UPLOAD_CONCURRENCY), each retried with a growing wait, with overall progress ("142 of 200 uploaded"). One
// queue per session lives at module level on the phone and the web, so leaving the screen doesn't stop it; the phone
// also keeps the waiting list on the device and picks it up again when the app opens. Pure (no React, no fetch):
// the caller passes `upload`. Unit-tested in tests/bulk-products.test.mjs.

export interface UploadTask {
  /** Sent with the photo, so a retried upload never makes a second product. */
  clientKey: string;
  fileName: string | null;
  state: "waiting" | "uploading" | "done" | "failed";
  /** 0..1 while uploading. */
  progress: number;
  tries: number;
  error?: string;
}

export interface UploadQueueOptions<T extends UploadTask> {
  upload: (task: T, onProgress: (fraction: number) => void) => Promise<void>;
  concurrency?: number;
  /** Tries per photo before it shows as failed (a "Try again" puts it back). */
  maxTries?: number;
  /** Waits between tries, in ms (index = try number - 1). */
  backoff?: number[];
  onChange?: (snapshot: UploadSnapshot) => void;
  /** An upload error that won't get better by trying again (a 4xx): fail at once. */
  isFinal?: (error: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
}

export interface UploadSnapshot {
  total: number;
  done: number;
  failed: number;
  uploading: number;
  waiting: number;
  /** done plus the uploading ones' progress, 0..1 of the total. */
  fraction: number;
}

export function createUploadQueue<T extends UploadTask>(options: UploadQueueOptions<T>) {
  const concurrency = options.concurrency ?? 3;
  const maxTries = options.maxTries ?? 3;
  const backoff = options.backoff ?? [1_000, 4_000, 10_000];
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const tasks: T[] = [];
  let running = 0;
  let idle: Array<() => void> = [];
  const listeners = new Set<(snapshot: UploadSnapshot) => void>();

  const snapshot = (): UploadSnapshot => {
    const done = tasks.filter((task) => task.state === "done").length;
    const uploading = tasks.filter((task) => task.state === "uploading");
    const partial = uploading.reduce((sum, task) => sum + task.progress, 0);
    return {
      total: tasks.length,
      done,
      failed: tasks.filter((task) => task.state === "failed").length,
      uploading: uploading.length,
      waiting: tasks.filter((task) => task.state === "waiting").length,
      fraction: tasks.length ? Math.min(1, (done + partial) / tasks.length) : 0,
    };
  };
  const changed = () => {
    const now = snapshot();
    options.onChange?.(now);
    listeners.forEach((listener) => listener(now));
  };

  async function run(task: T) {
    running++;
    task.state = "uploading";
    task.progress = 0;
    changed();
    try {
      let finished = false;
      while (!finished) {
        task.tries++;
        try {
          await options.upload(task, (fraction) => {
            task.progress = Math.max(0, Math.min(1, fraction));
            changed();
          });
          task.state = "done";
          task.progress = 1;
          task.error = undefined;
          finished = true;
        } catch (error) {
          task.error = error instanceof Error ? error.message : String(error);
          if (options.isFinal?.(error) || task.tries >= maxTries) {
            task.state = "failed";
            finished = true;
          } else await sleep(backoff[Math.min(task.tries - 1, backoff.length - 1)] ?? 1_000);
        }
      }
    } finally {
      running--;
      changed();
      pump();
    }
  }

  function pump() {
    while (running < concurrency) {
      const next = tasks.find((task) => task.state === "waiting");
      if (!next) break;
      void run(next);
    }
    if (running === 0 && !tasks.some((task) => task.state === "waiting")) {
      const waiters = idle;
      idle = [];
      waiters.forEach((resolve) => resolve());
    }
  }

  return {
    /** Adds photos (a clientKey already queued is skipped) and starts them. */
    add(list: T[]) {
      for (const task of list) if (!tasks.some((have) => have.clientKey === task.clientKey)) tasks.push({ ...task, state: "waiting", progress: 0, tries: 0 });
      changed();
      pump();
    },
    /** Puts failed photos back in line. */
    retryFailed() {
      for (const task of tasks) if (task.state === "failed") Object.assign(task, { state: "waiting", tries: 0, error: undefined });
      changed();
      pump();
    },
    tasks: () => tasks.slice(),
    snapshot,
    subscribe(listener: (snapshot: UploadSnapshot) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Resolves when nothing is waiting or uploading. */
    whenIdle() {
      if (running === 0 && !tasks.some((task) => task.state === "waiting")) return Promise.resolve();
      return new Promise<void>((resolve) => idle.push(resolve));
    },
  };
}

export type UploadQueue<T extends UploadTask = UploadTask> = ReturnType<typeof createUploadQueue<T>>;

/** A fresh key for a picked photo. */
export function newClientKey(prefix = "p") {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
