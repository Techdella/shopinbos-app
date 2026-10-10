"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

export function PageToast() {
  const searchParams = useSearchParams();
  const { toast } = useToast();

  useEffect(() => {
    if (searchParams.get("saved") === "true") {
      toast("Changes saved successfully", "success");
    }
    if (searchParams.get("error")) {
      toast(searchParams.get("error") ?? "Something went wrong", "error");
    }
    if (searchParams.get("status") === "success") {
      toast(searchParams.get("message") ?? "Completed", "success");
    }
  }, [searchParams, toast]);

  return null;
}
