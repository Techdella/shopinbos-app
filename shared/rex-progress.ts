// What Rex is busy with, for the step-by-step progress shown while he works (RexProgress in
// src/components/builder/rex). Rex's replies don't stream, so the steps are paced against how long that kind of
// job usually takes and never claim to be done before the answer arrives. Pure; tests/behaviour.test.mjs.

export const REX_JOBS = ["image", "logo", "photo_edit", "video", "store_edit", "build", "ideas", "chat"] as const;
export type RexJob = (typeof REX_JOBS)[number];

/** Steps per job (labels are the rex "prog.<job>.<n>" messages) and the usual time it takes. */
export const REX_JOB_PLAN: Record<RexJob, { steps: number; seconds: number }> = {
  image: { steps: 5, seconds: 50 },
  logo: { steps: 4, seconds: 70 },
  photo_edit: { steps: 4, seconds: 45 },
  video: { steps: 3, seconds: 20 },
  store_edit: { steps: 4, seconds: 40 },
  build: { steps: 6, seconds: 100 },
  ideas: { steps: 3, seconds: 15 },
  chat: { steps: 3, seconds: 15 },
};

/** Light-hearted lines that rotate under the steps (rex "prog.quip.<n>"). */
export const REX_QUIPS = 8;

/** Best guess at the job from the seller's request, so the steps say the right things. */
export function guessRexJob(request: string, hasPhotos = false): RexJob {
  const text = request.toLowerCase();
  if (/\b(build|create|make|set up|setup)\b.{0,20}\b(my|the|a|whole|new)?\s*(store|shop|website|site)\b/.test(text) && !/\b(photo|picture|image|banner)\b/.test(text)) return "build";
  if (/\b(video|reel|tiktok|clip)s?\b/.test(text)) return "video";
  const pictureWords = /\b(photo|picture|pic|image|banner|flyer|poster|shot|post|mockup|jar|pack|packaging)s?\b/;
  if (/\blogos?\b/.test(text) && !/\b(with|my|our|add|put)\s+(brand\s+)?logo\b/.test(text) && !pictureWords.test(text)) return "logo";
  if (hasPhotos && /\b(bright|brighter|background|enhance|clean|remove|fix|edit|white|sharpen|lifestyle)\b/.test(text)) return "photo_edit";
  if (pictureWords.test(text) || /\b(with my logo|branded)\b/.test(text)) return "image";
  if (/\b(ideas?|suggest|inspire|what should i)\b/.test(text)) return "ideas";
  if (/\b(home ?page|page|section|colou?rs?|fonts?|theme|header|footer|hero|button|menu|layout|store|shop)\b/.test(text)) return "store_edit";
  return "chat";
}

/**
 * Where the bar is after `elapsedMs` of a job that usually takes `seconds`: quick at first, slowing as it
 * nears the end, and never past 94% until the answer is really back.
 */
export function rexProgressAt(elapsedMs: number, seconds: number) {
  const t = Math.max(0, elapsedMs) / 1000 / Math.max(1, seconds);
  return Math.min(94, Math.round(94 * (1 - Math.exp(-2.2 * t))));
}

/** The step in progress: steps share the usual time, and the last one holds until the answer arrives. */
export function rexStepAt(elapsedMs: number, plan: { steps: number; seconds: number }) {
  const per = (plan.seconds * 1000) / plan.steps;
  return Math.min(plan.steps - 1, Math.floor(Math.max(0, elapsedMs) / per));
}

/** True once a job has run well past its usual time (time for a "still on it" note). */
export function rexIsSlow(elapsedMs: number, seconds: number) {
  return elapsedMs > seconds * 1500;
}
