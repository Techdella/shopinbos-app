"use client";

import { useToast as useToastContext } from "@/components/ui/Toast";

type ToastVariant = "success" | "error" | "info" | "warning";

type ToastInput = {
  title?: string;
  description?: string;
  variant?: ToastVariant | "danger";
};

export function useToast() {
  const { toast: showToast } = useToastContext();

  return {
    toast(input: string | ToastInput, variant?: ToastVariant) {
      if (typeof input === "string") {
        showToast(input, variant);
        return;
      }

      const message = [input.title, input.description].filter(Boolean).join(" - ");
      showToast(message || "Done", input.variant === "danger" ? "error" : input.variant);
    },
  };
}

export function toast(input: string | ToastInput, variant?: ToastVariant) {
  if (typeof window === "undefined") return;

  const detail = typeof input === "string"
    ? { message: input, variant }
    : {
        message: [input.title, input.description].filter(Boolean).join(" - ") || "Done",
        variant: input.variant === "danger" ? "error" : input.variant,
      };

  window.dispatchEvent(new CustomEvent("shopinbos:toast", { detail }));
}
