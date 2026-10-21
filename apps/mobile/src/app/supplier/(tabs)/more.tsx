import { Redirect } from "expo-router";

// The supplier "More" tab's rows are on Account now (the gear on Home). Kept for old links and notifications.
export default function SupplierMoreRedirect() {
  return <Redirect href="/supplier/account" />;
}
