"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";

declare global {
  interface Window {
    PaystackPop?: {
      setup: (config: Record<string, unknown>) => {
        openIframe: () => void;
      };
    };
  }
}

interface PaystackCheckoutProps {
  amount?: number;
  plan?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  metadata?: Record<string, unknown>;
  onSuccess?: (reference: string) => void;
  onClose?: () => void;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  label?: string;
}

const PUBLIC_KEY = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? "";

export function PaystackCheckoutButton({
  amount,
  plan,
  email,
  firstName,
  lastName,
  phone,
  metadata,
  onSuccess,
  onClose,
  children,
  className,
  style,
  disabled,
  label = "Pay with Paystack",
}: PaystackCheckoutProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!buttonRef.current || !style) return;
    Object.assign(buttonRef.current.style, style);
  }, [style]);

  const handlePayment = useCallback(() => {
    if (!PUBLIC_KEY) {
      toast("Paystack is not configured", "error");
      return;
    }

    setLoading(true);

    const config: Record<string, unknown> = {
      key: PUBLIC_KEY,
      email,
      currency: "NGN",
      ref: `paystack-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...(plan ? { plan } : { amount: Math.round((amount ?? 0) * 100) }),
      metadata: {
        custom_fields: [
          { display_name: "Name", variable_name: "name", value: `${firstName ?? ""} ${lastName ?? ""}`.trim() || email },
        ],
        ...(metadata as Record<string, unknown>),
      },
      callback: (response: { reference: string; status: string }) => {
        setLoading(false);
        if (response.status === "success") {
          toast("Payment successful!", "success");
          onSuccess?.(response.reference);
        } else {
          toast("The payment didn't go through. Nothing was taken. Try again.", "error");
        }
      },
      onClose: () => {
        setLoading(false);
        toast("Payment cancelled", "info");
        onClose?.();
      },
    };

    if (typeof window.PaystackPop?.setup === "function") {
      window.PaystackPop.setup(config).openIframe();
    } else {
      const script = document.createElement("script");
      script.src = "https://js.paystack.co/v1/inline.js";
      script.onload = () => {
        if (window.PaystackPop) {
          window.PaystackPop.setup(config).openIframe();
        }
      };
      document.body.appendChild(script);
    }
  }, [amount, plan, email, firstName, lastName, phone, metadata, onSuccess, onClose, toast]);

  return (
    <button
      ref={buttonRef}
      onClick={handlePayment}
      className={className ?? "btn btn-mint"}
      disabled={disabled || loading}
    >
      {loading ? "Processing..." : (children ?? label)}
    </button>
  );
}

interface PaystackResumeProps {
  /** From /transaction/initialize on our server (the order's reference and any split are already fixed there). */
  accessCode: string;
  onSuccess?: (reference: string) => void;
  onClose?: () => void;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  label?: string;
}

/** Opens Paystack's popup for a transaction the server already started (store checkout). */
export function PaystackResumeButton({ accessCode, onSuccess, onClose, className, style, disabled, label = "Pay with Paystack" }: PaystackResumeProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handlePayment = useCallback(async () => {
    setLoading(true);
    try {
      const { default: PaystackPop } = await import("@paystack/inline-js");
      new PaystackPop().resumeTransaction(accessCode, {
        onSuccess: (transaction) => {
          setLoading(false);
          toast("Payment successful!", "success");
          onSuccess?.(transaction.reference);
        },
        onCancel: () => {
          setLoading(false);
          toast("Payment cancelled", "info");
          onClose?.();
        },
        onError: (error) => {
          setLoading(false);
          toast(error?.message || "Paystack couldn't open. Try again.", "error");
        },
      });
    } catch {
      setLoading(false);
      toast("Paystack couldn't open. Check your connection and try again.", "error");
    }
  }, [accessCode, onSuccess, onClose, toast]);

  return (
    <button type="button" onClick={handlePayment} className={className ?? "btn btn-mint"} style={style} disabled={disabled || loading}>
      {loading ? "Processing..." : label}
    </button>
  );
}
