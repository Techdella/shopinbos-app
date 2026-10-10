"use client";

import { type SelectHTMLAttributes } from "react";

type Props = SelectHTMLAttributes<HTMLSelectElement>;

export function AutoSubmitSelect({ onChange, ...props }: Props) {
  return (
    <select
      {...props}
      onChange={(e) => {
        onChange?.(e);
        e.target.form?.requestSubmit();
      }}
    />
  );
}
