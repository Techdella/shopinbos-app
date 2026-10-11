"use client";

import { useState } from "react";
import type { FormDesign, FormField } from "@/lib/marketing/forms";
import { SignupForm, SignupSuccess, type SignupColors, type SignupResult } from "@/components/storefront/marketing/SignupForm";

export function JoinForm(props: { storeSlug: string; formId: string; fields: FormField[]; design: FormDesign; colors: SignupColors }) {
  const [result, setResult] = useState<SignupResult | null>(null);
  return (
    <section className="rounded-3xl border p-6" style={{ borderColor: `${props.colors.ink}1F` }}>
      <h1 className="m-0 text-[26px] font-bold leading-tight">{props.design.headline}</h1>
      {result ? (
        <div className="mt-4">
          <SignupSuccess result={result} colors={props.colors} />
          <a href={`/s/${props.storeSlug}`} className="mt-5 inline-flex min-h-[44px] items-center rounded-full px-5 text-[14px] font-bold no-underline" style={{ background: props.colors.accent, color: props.colors.accentText }}>
            Visit the shop
          </a>
        </div>
      ) : (
        <>
          <p className="mb-5 mt-2 text-[15px] leading-[1.5] opacity-80">{props.design.body}</p>
          <SignupForm {...props} onDone={setResult} />
        </>
      )}
    </section>
  );
}
