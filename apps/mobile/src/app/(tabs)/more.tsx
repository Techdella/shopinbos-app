import { Redirect } from "expo-router";

// "More" became "My shop" (build spec 8A). Kept so old links, notifications and saved routes still work.
export default function MoreRedirect() {
  return <Redirect href="/shop" />;
}
