// Joins class names, skipping falsy values. Plain module so server components can use it too.
export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
