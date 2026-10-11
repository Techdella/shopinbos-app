import { redirect } from "next/navigation";

// Reports moved into Analytics (same numbers plus ranges, channels, attribution and the store funnel).
export default function SellerInsightsPage() {
  redirect("/home/analytics");
}
