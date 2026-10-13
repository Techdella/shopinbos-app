// "Open the 60-second intro" from anywhere in the app (TermHint, LearnButton) to the LearnHost in _layout.tsx.
// A key opens that intro; no key opens the one for the current screen.

type Listener = (key?: string) => void;
const listeners = new Set<Listener>();

export function openFeatureIntro(key?: string) {
  listeners.forEach((listener) => listener(key));
}

export function onOpenFeatureIntro(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
