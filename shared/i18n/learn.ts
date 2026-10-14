// The glossary (shared/glossary.ts) and 60-second intros (shared/feature-intros.ts) in the person's language.
// Sentences come from the "glossary" and "intros" catalogs; the standard word itself (entry.term), the intros'
// in-art labels, chips and values, and every key/path stay as they are. Missing translations show English.
import type { GlossaryEntry } from "../glossary.ts";
import type { FeatureIntro } from "../feature-intros.ts";
import type { TFunction } from "./index.ts";

type Dyn = Pick<TFunction, "dynamic">;

export function translateTerm(entry: GlossaryEntry, t: Dyn): GlossaryEntry {
  return { ...entry, short: t.dynamic(`${entry.key}.short`, entry.short), example: t.dynamic(`${entry.key}.example`, entry.example) };
}

export function translateIntro(intro: FeatureIntro, t: Dyn): FeatureIntro {
  return {
    ...intro,
    title: t.dynamic(`${intro.key}.title`, intro.title),
    cta: intro.cta ? { ...intro.cta, label: t.dynamic(`${intro.key}.cta`, intro.cta.label) } : undefined,
    scenes: intro.scenes.map((scene, index) => ({
      ...scene,
      caption: t.dynamic(`${intro.key}.${index + 1}.caption`, scene.caption),
      sub: t.dynamic(`${intro.key}.${index + 1}.sub`, scene.sub),
    })),
  };
}
