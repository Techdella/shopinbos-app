// Rex's store-builder replies are prose followed by machine blocks (<store_config>…</store_config> and
// <chips>…</chips>). These helpers keep the blocks out of the streamed chat text and parse them at the end.
// Pure, unit-tested in tests/behaviour.test.mjs.

const MACHINE_TAGS = ["<store_config", "<chips"];

/** Length of the longest suffix of `text` that is a prefix of a machine tag (so it may still become one). */
function pendingTagPrefix(text: string) {
  const lastOpen = text.lastIndexOf("<");
  if (lastOpen === -1) return 0;
  const tail = text.slice(lastOpen);
  return MACHINE_TAGS.some((tag) => tag.startsWith(tail) || tail.startsWith(tag)) ? text.length - lastOpen : 0;
}

/**
 * Streaming filter: push model deltas in, get back only the text that is safe to show. Text from the first
 * machine tag onwards is never emitted, and a partial tag split across deltas ("<sto" + "re_config>") is
 * held back until it is clear whether it is a tag.
 */
export function createVisibleTextFilter() {
  let buffer = "";
  let emitted = 0;
  let closed = false;

  function tagStart() {
    let first = -1;
    for (const tag of MACHINE_TAGS) {
      const index = buffer.indexOf(tag);
      if (index !== -1 && (first === -1 || index < first)) first = index;
    }
    return first;
  }

  return {
    push(delta: string): string {
      if (closed || !delta) return "";
      buffer += delta;
      const start = tagStart();
      if (start !== -1) {
        closed = true;
        const out = buffer.slice(emitted, start).replace(/\s+$/, "");
        emitted = start;
        return out;
      }
      let safeEnd = buffer.length - pendingTagPrefix(buffer);
      // Trailing whitespace waits for more text, so the gap before a machine block is never sent.
      while (safeEnd > emitted && /\s/.test(buffer[safeEnd - 1])) safeEnd--;
      const out = buffer.slice(emitted, safeEnd);
      emitted = safeEnd;
      return out;
    },
    /** Whatever was held back as a possible tag, once the stream has ended without one. */
    flush(): string {
      if (closed) return "";
      closed = true;
      const out = buffer.slice(emitted);
      emitted = buffer.length;
      return out;
    },
    /** Everything the model sent, tags included. */
    get fullText() {
      return buffer;
    },
  };
}

/** Strips machine blocks (complete or cut off) from a whole reply. */
export function stripMachineBlocks(text: string): string {
  let start = -1;
  for (const tag of MACHINE_TAGS) {
    const index = text.indexOf(tag);
    if (index !== -1 && (start === -1 || index < start)) start = index;
  }
  return (start === -1 ? text : text.slice(0, start)).trim();
}

/** The first balanced {...} in `raw` that parses as a JSON object (prose or code fences around it are fine). */
export function extractJsonObject(raw: string): Record<string, unknown> | null {
  for (let start = raw.indexOf("{"); start !== -1; start = raw.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < raw.length; i++) {
      const char = raw[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "{") depth++;
      else if (char === "}" && --depth === 0) {
        try {
          const value = JSON.parse(raw.slice(start, i + 1));
          if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
        } catch {
          // Try the next opening brace.
        }
        break;
      }
    }
  }
  return null;
}

export interface BuilderReply {
  /** The conversational part, without machine blocks. */
  visible: string;
  /** The parsed <store_config> object, if there was a valid one. */
  config: Record<string, unknown> | null;
  /** Set when a <store_config> block was present but cut off or not valid JSON. */
  configError: string | null;
  chips: string[] | null;
}

export function parseBuilderReply(fullText: string): BuilderReply {
  const visible = stripMachineBlocks(fullText);
  let config: Record<string, unknown> | null = null;
  let configError: string | null = null;

  const open = fullText.indexOf("<store_config");
  if (open !== -1) {
    const bodyStart = fullText.indexOf(">", open);
    const close = fullText.indexOf("</store_config>", open);
    if (bodyStart === -1 || close === -1) {
      configError = "Rex's store design was cut off before it finished.";
    } else {
      config = extractJsonObject(fullText.slice(bodyStart + 1, close));
      if (!config) configError = "Rex's store design came back in a format that couldn't be read.";
    }
  }

  let chips: string[] | null = null;
  const chipsMatch = fullText.match(/<chips>([\s\S]*?)<\/chips>/);
  if (chipsMatch) {
    try {
      const parsed = JSON.parse(chipsMatch[1].trim()) as unknown;
      if (Array.isArray(parsed)) {
        chips = parsed.filter((chip): chip is string => typeof chip === "string" && chip.trim().length > 0).map((chip) => chip.trim().slice(0, 60)).slice(0, 6);
      }
    } catch {
      chips = null;
    }
  }

  return { visible, config, configError, chips };
}
