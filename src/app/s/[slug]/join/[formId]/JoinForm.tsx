"use client";

import { useState } from "react";
import type { FormDesign, FormField, PopupRewardSummary } from "@/lib/marketing/forms";
import { rewardLine } from "@/components/storefront/marketing/PopupView";
import { SignupForm, SignupSuccess, type SignupColors, type SignupResult } from "@/components/storefront/marketing/SignupForm";

export function JoinForm(props: { storeSlug: string; formId: string; fields: FormField[]; design: FormDesign; colors: SignupColors; currency?: string; reward?: PopupRewardSummary | null }) {
  const { reward, currency, ...formProps } = props;
  const line = rewardLine(reward ?? null, currency);
  const [result, setResult] = useState<SignupResult | null>(null);
  return (
    <section className="rounded-3xl border p-6" style={{ borderColor: `${props.colors.ink}1F` }}>
      <h1 className="m-0 text-[26px] font-bold leading-tight">{props.design.headline}</h1>
      {result ? (
        <div className="mt-4">
          <SignupSuccess result={result} colors={props.colors} shopHref={`/s/${props.storeSlug}`} currency={props.currency} />
        </div>
      ) : (
        <>
          <p className="mb-5 mt-2 text-[15px] leading-[1.5] opacity-80">
            {props.design.body}
            {line ? <strong className="block pt-1 opacity-100">{line}</strong> : null}
          </p>
          <SignupForm {...formProps} onDone={setResult} />
        </>
      )}
    </section>
  );
}
