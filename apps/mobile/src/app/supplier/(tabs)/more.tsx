import { Redirect } from "expo-router";

// The supplier "More" tab moved into Money (build spec 8A: tabs Home, Orders, Products, Money). Kept for old links.
export default function SupplierMoreRedirect() {
  return <Redirect href="/supplier/money" />;
}
