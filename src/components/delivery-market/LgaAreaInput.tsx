"use client";

import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from "react";
import { areaSuggestions } from "@shared/ng-lgas";

// An "Area or LGA" text input that suggests the LGAs and well-known areas of the state picked in the same form
// (shared/ng-lgas.ts). It watches the form's state field by name, so server-rendered forms keep their own state
// <select>. Free text still works for addresses the list doesn't know.

export function LgaAreaInput({
  stateName,
  initialState,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "list"> & {
  /** Name of the state field in the same form. */
  stateName: string;
  /** The state selected when the form first renders. */
  initialState?: string | null;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [state, setState] = useState(initialState ?? "");

  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onChange = (event: Event) => {
      const target = event.target as HTMLInputElement | HTMLSelectElement | null;
      if (target?.name === stateName) setState(target.value);
    };
    form.addEventListener("change", onChange);
    form.addEventListener("input", onChange);
    return () => {
      form.removeEventListener("change", onChange);
      form.removeEventListener("input", onChange);
    };
  }, [stateName]);

  const options = areaSuggestions(state);
  return (
    <>
      <input ref={ref} autoComplete="off" {...props} list={options.length ? listId : undefined} />
      <datalist id={listId}>
        {options.map((option) => <option key={option} value={option} />)}
      </datalist>
    </>
  );
}
