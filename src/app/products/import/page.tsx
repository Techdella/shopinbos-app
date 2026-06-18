"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead } from "@/components/ui";

export default function ImportProductsPage() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUploading(true);
    setError("");
    setResult(null);

    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("csv") as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) {
      setError("Please select a CSV file");
      setUploading(false);
      return;
    }

    const formData = new FormData();
    formData.append("csv", file);

    try {
      const res = await fetch("/api/products/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data.data ?? data);
        fileInput.value = "";
      } else {
        setError(data?.error?.message ?? data?.error ?? "Import failed");
      }
    } catch {
      setError("Something went wrong during upload");
    } finally {
      setUploading(false);
    }
  };

  return (
    <AppFrame role="seller" storeName="Products" storeInitial="P">
      <div className="flex-1 overflow-y-auto" style={{ padding: "24px 28px 40px", background: "var(--canvas)" }}>
        <PageHead
          title="Import products from CSV"
          sub="Upload a CSV file with your product data"
          actions={
            <Link href="/products" className="dbtn dBtn-ghost dBtn-sm">
              Back to products
            </Link>
          }
        />

        <div style={{ maxWidth: 600 }}>
          {error && (
            <div className="card" style={{ padding: 12, marginBottom: 14, borderColor: "var(--danger)", color: "var(--danger)", fontSize: 13 }}>
              {error}
            </div>
          )}

          {result && (
            <div className="card" style={{ padding: 16, marginBottom: 14, borderColor: "var(--teal-200)", background: "var(--teal-50)" }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, color: "var(--teal-800)" }}>
                Import complete — {result.imported} product(s) imported
              </div>
              {result.errors.length > 0 && (
                <div style={{ fontSize: 12.5, color: "var(--danger)" }}>
                  {result.errors.length} error(s):
                  <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                    {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
              <Link href="/products" className="dbtn dBtn-mint dBtn-sm" style={{ marginTop: 10 }}>
                View products
              </Link>
            </div>
          )}

          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>CSV file</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginBottom: 14, lineHeight: 1.5 }}>
              Upload a CSV file with columns: <code>name, description, retailPrice, costPrice, status</code>.
              The first row must be the header row.
            </div>

            <form onSubmit={handleSubmit}>
              <div className="field" style={{ marginBottom: 14 }}>
                <input type="file" name="csv" accept=".csv" required style={{ fontSize: 13, width: "100%" }} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="submit" className="dbtn dBtn-mint" disabled={uploading}>
                  {uploading ? "Uploading..." : "Upload & import"}
                </button>
                <a href="/sample-products.csv" className="dbtn dBtn-ghost dBtn-sm" download>
                  Download sample CSV
                </a>
              </div>
            </form>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
