// Peggy ends the call when they're done ("Call Peggy", the in-app voice call). Pure, unit-tested in
// tests/peggy-call.test.mjs.
//
// The agent has ElevenLabs' end_call tool and is told to use it after her goodbye (src/lib/ai/peggy-voice-prompt.ts),
// but a voice model doesn't always call a tool after saying goodbye, and an agent whose config didn't take the tool
// can't. So the app also listens: when the person has said they're done ("bye", "thank you, that's all", "I no get
// anything again", "na im be that") and Peggy answers with a goodbye, the app hangs up once she has finished
// speaking, the same as if she'd called end_call. Words are matched loosely (case, punctuation, curly quotes).

/** Lowercase, plain apostrophes, punctuation as spaces, single spaces. */
export function goodbyeText(text: string | null | undefined): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[^a-z0-9'?\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// What people say when they're done: English and Nigerian Pidgin (with a few Yoruba, Hausa and Igbo goodbyes).
const DONE = [
  /\b(good ?)?bye( bye)?\b/,
  /\bbye ?bye\b/,
  /\b(see|talk to|speak to|catch) (you|u) (later|soon|another time|tomorrow)\b/,
  /\b(talk|speak) (later|soon)\b/,
  /\blater (then|o|oo)\b/,
  /\b(that'?s|that is|thats|na) (all|it|everything)\b/,
  /\bthat'?s all for (now|today)\b/,
  /\bnothing (else|more|again|other)\b/,
  /\b(no|don'?t have|do not have|no get|don'?t get) (any )?(other |more )?questions?\b/,
  /\bno(thing)? more (question|questions|wahala)\b/,
  /\b(i )?(don'?t|do not|no) (have|get|get any|have any) ?(anything|any other thing|any question|any questions|question|questions)? ?(again|else|more)\b/,
  /\b(i'?m|i am|we'?re|we are) (done|okay now|good now|fine now|all set|good|ok|okay)( now)?( thank| thanks)?$/,
  /\b(you can|please|abeg) (hang up|end (the )?call|drop (the )?call|cut (the )?call)\b/,
  /\b(hang up|end the call|end call|drop the call)\b/,
  /\bna (im|him|ehn|en) be (that|dat)\b/,
  /\bna so (e|it) be\b/,
  /\be don do\b/,
  /\bmake we (stop|end) (am|here|for here)\b/,
  /\bi (don|go) (dey )?go\b/,
  /\bhave a (good|nice|great|lovely|blessed) (day|night|evening|one|weekend)\b/,
  /\b(o d[aà]b[oọ]|odabo|sai an jima|ka chi fo|kachifo)\b/,
];

/** Whether the person has said they're done (a goodbye, "that's all", "nothing again"), not asking something. */
export function userIsDone(text: string | null | undefined): boolean {
  const said = goodbyeText(text);
  if (!said || said.includes("?")) return false;
  // "Don't hang up", "not yet", "wait": they're not done.
  if (/\b(don'?t|do not|no) (hang up|end|drop|cut)\b|\bnot yet\b|\bwait\b|\bhold on\b|\bone more\b|\banother question\b/.test(said)) return false;
  return DONE.some((pattern) => pattern.test(said));
}

const FAREWELL = [
  /\b(good ?)?bye( bye)?\b/,
  /\btake care\b(?! of)/,
  /\b(talk|speak) (to you )?(soon|later)\b/,
  /\bhave a (good|nice|great|lovely|blessed|wonderful) (day|night|evening|one|weekend|time)\b/,
  /\benjoy the rest of\b/,
  /\bwaka (well|safe)\b/,
  /\b(stay|keep) (well|safe)\b/,
  /\bwe (go|will) (talk|yarn) (again|later|soon)\b/,
  /\bcatch you (later|soon)\b/,
];

/** Whether Peggy's line is a goodbye (not a question like "anything else before I go?"). */
export function peggySaysGoodbye(text: string | null | undefined): boolean {
  const said = goodbyeText(text);
  if (!said || /\?\s*$/.test(said)) return false;
  return FAREWELL.some((pattern) => pattern.test(said));
}

/**
 * Whether the app should hang up after Peggy finishes this line: she said goodbye, and the person had said they
 * were done (or she said "bye" outright, which she only does when the call is over).
 */
export function shouldHangUp(lastUser: string | null | undefined, peggyLine: string | null | undefined): boolean {
  if (!peggySaysGoodbye(peggyLine)) return false;
  return userIsDone(lastUser) || /\b(good ?)?bye\b/.test(goodbyeText(peggyLine));
}

/** How long after Peggy stops talking the app waits (they may still say something) before it hangs up. */
export const HANG_UP_AFTER_MS = 2000;
/** If the app never hears that she stopped talking, it hangs up this long after her goodbye line anyway. */
export const HANG_UP_FALLBACK_MS = 15000;
