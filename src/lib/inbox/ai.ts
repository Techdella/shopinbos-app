import "server-only";

/** Whether Peggy can write replies on this server (either provider is enough). */
export function hasAiProvider() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
}
