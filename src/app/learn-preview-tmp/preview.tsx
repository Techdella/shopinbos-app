"use client";
// TEMPORARY visual harness for the feature intro (deleted after screenshots).
import { useEffect, useState } from "react";
import { FeatureIntro } from "@/components/learn/FeatureIntro";
import { Term } from "@/components/learn/Term";
import { introByKey } from "@shared/feature-intros";
export function Preview() {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => { setKey(new URLSearchParams(location.search).get("k")); }, []);
  const intro = introByKey(key);
  return (
    <div className="app-scope min-h-dvh bg-app-canvas p-8 font-app text-app-ink">
      <h1 className="text-[30px] font-extrabold"><Term k="segments">Segments</Term></h1>
      <p>Hover the word. Also <Term k="roas">ROAS</Term> in text.</p>
      {intro && <FeatureIntro intro={intro} role="seller" onClose={() => setKey(null)} />}
    </div>
  );
}
